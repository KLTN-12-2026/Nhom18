const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken, optionalAuth } = require('../middleware/auth');

// Get movie rating (including user's own rating if logged in).
// PHẢI có optionalAuth: route này đọc req.user?.id để trả về userRating (số sao
// chính người dùng đã chấm, dùng để hiện sẵn lựa chọn cũ trên UI), nhưng trước
// đây không gắn middleware xác thực nào nên req.user LUÔN undefined —
// userRating vĩnh viễn trả null, nhánh truy vấn bên dưới là code chết.
// Dùng optionalAuth (không phải verifyToken) để khách chưa đăng nhập vẫn xem
// được điểm trung bình.
router.get('/:movieId', optionalAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user?.id;

    // Get movie average rating
    const [movies] = await pool.execute(
      'SELECT average_rating, rating_count FROM movies WHERE id = ?',
      [movieId]
    );

    if (movies.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    // Phân bố số lượt chấm theo từng mức sao (5★ → 1★).
    //
    // Điểm trung bình một mình không nói lên nhiều: 4.0 có thể là "ai cũng thấy
    // khá" hoặc "nửa khen hết lời, nửa chê thẳng". Biểu đồ phân bố cho khách
    // thấy sự khác biệt đó ngay.
    //
    // ROUND() vì movie_ratings.rating là DECIMAL (cho phép chấm 4.5 sao) —
    // gom về đúng 5 bậc để vẽ biểu đồ.
    const [phanBo] = await pool.execute(
      `SELECT ROUND(rating) AS sao, COUNT(*) AS so_luot
         FROM movie_ratings
        WHERE movie_id = ? AND rating > 0
        GROUP BY ROUND(rating)`,
      [movieId]
    );
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of phanBo) {
      const sao = Number(d.sao);
      if (sao >= 1 && sao <= 5) distribution[sao] = Number(d.so_luot);
    }

    const result = {
      averageRating: parseFloat(movies[0].average_rating) || 0,
      ratingCount: movies[0].rating_count || 0,
      distribution,
      userRating: null
    };

    // Get user's rating if logged in
    if (userId) {
      const [userRatings] = await pool.execute(
        'SELECT rating FROM movie_ratings WHERE movie_id = ? AND user_id = ?',
        [movieId, userId]
      );
      if (userRatings.length > 0) {
        result.userRating = parseFloat(userRatings[0].rating);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Get rating error:', error);
    res.status(500).json({ error: 'Failed to get rating' });
  }
});

// Submit/Update rating (requires authentication)
router.post('/:movieId', verifyToken, async (req, res) => {
  try {
    const { movieId } = req.params;
    const { rating } = req.body;
    const userId = req.user.id;

    // Validate rating
    if (!rating || rating < 0 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 0 and 5' });
    }

    // Check if movie exists
    const [movies] = await pool.execute('SELECT id FROM movies WHERE id = ?', [movieId]);
    if (movies.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    // Bắt buộc đã MUA VÉ mới được chấm sao — dùng ĐÚNG điều kiện đang áp dụng
    // cho review chữ (routes/reviews.js), vốn đã yêu cầu điều này từ trước.
    // Trước đây rating bị bỏ sót khỏi luật đó: bất kỳ tài khoản nào cũng chấm
    // sao được cho phim chưa từng xem. Đây không chỉ làm lệch số sao hiển thị —
    // ShowtimeGeneratorService lấy AVG(movie_ratings.rating) làm 30% điểm phổ
    // biến để chia suất chiếu/phòng chiếu cho phim, nên vài tài khoản ảo cùng
    // chấm 5 sao là đủ đẩy 1 phim lên hạng cao hơn và chiếm thêm suất chiếu thật.
    const [[{ cnt: purchaseCount }]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.user_id = ? AND s.movie_id = ? AND t.payment_status = 'paid' AND t.booking_status != 'cancelled'`,
      [userId, movieId]
    );
    if (purchaseCount === 0) {
      return res.status(403).json({ error: 'Bạn cần đặt vé và thanh toán cho phim này trước khi có thể chấm sao' });
    }

    // Insert or update rating
    await pool.execute(
      `INSERT INTO movie_ratings (movie_id, user_id, rating) 
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = CURRENT_TIMESTAMP`,
      [movieId, userId, rating]
    );

    // Get updated average
    const [result] = await pool.execute(
      'SELECT average_rating, rating_count FROM movies WHERE id = ?',
      [movieId]
    );

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      averageRating: parseFloat(result[0].average_rating),
      ratingCount: result[0].rating_count
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// Delete rating (requires authentication)
router.delete('/:movieId', verifyToken, async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user.id;

    const [result] = await pool.execute(
      'DELETE FROM movie_ratings WHERE movie_id = ? AND user_id = ?',
      [movieId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Rating not found' });
    }

    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({ error: 'Failed to delete rating' });
  }
});

module.exports = router;
