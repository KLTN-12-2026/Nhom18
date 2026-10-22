const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
// Đánh giá gắn với PHIM chứ không gắn với rạp — duyệt/xoá 1 đánh giá là thay
// đổi nội dung mà khách của CẢ 3 RẠP đều nhìn thấy, nên chỉ admin được làm.
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { analyzeSentiment } = require('../services/sentimentAnalysis.service');
const { autoModerate } = require('../services/reviewModeration.service');
const pointsService = require('../services/points.service');
const Notification = require('../models/Notification');

// ── Admin moderation ────────────────────────────────────────────────────
// Đặt TRƯỚC route GET /:movieId — nếu không, Express sẽ khớp "/admin" vào
// tham số :movieId (cả hai đều là 1 segment) và không bao giờ chạy tới đây.
//
// Trước đây review chỉ có thể bị xoá bởi chính người viết (DELETE /:movieId,
// khớp theo user_id của token) — không có cách nào cho admin ẩn/xoá một
// review vi phạm (spam, ngôn từ xấu...) của người khác. sentiment_label đã
// được gắn sẵn từ lúc review được gửi (xem route POST /:movieId) chính là để
// phục vụ việc lọc review tiêu cực ở đây.
router.get('/admin/list', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { sentiment, movieId, moderationStatus, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    if (sentiment) {
      conditions.push('r.sentiment_label = ?');
      params.push(sentiment);
    }
    if (movieId) {
      conditions.push('r.movie_id = ?');
      params.push(movieId);
    }
    if (moderationStatus) {
      conditions.push('r.moderation_status = ?');
      params.push(moderationStatus);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [reviews] = await pool.query(
      `SELECT
        r.id, r.movie_id, m.title as movie_title, m.poster_url,
        r.user_id, COALESCE(u.username, u.email) as username, u.email,
        r.rating, r.review_text, r.sentiment_label, r.sentiment_score,
        r.moderation_status, r.moderation_reason, r.moderated_at, r.points_awarded,
        r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM review_helpful WHERE review_id = r.id) as helpful_count
       FROM movie_reviews r
       JOIN movies m ON r.movie_id = m.id
       JOIN users u ON r.user_id = u.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ?`,
      [...params, parseInt(limit)]
    );

    // Số đánh giá ĐANG CHỜ DUYỆT tính trên TOÀN BỘ bảng, không phụ thuộc tab
    // đang mở. Trang admin trước đây tự đếm từ mảng `reviews` vừa trả về — mà
    // mảng đó đã bị lọc theo moderationStatus của tab, nên khi admin đứng ở tab
    // "Đã duyệt"/"Đã từ chối" thì badge luôn hiện 0 dù vẫn còn đánh giá chờ xử
    // lý, khiến việc chờ duyệt dễ bị bỏ sót.
    const [[{ flaggedTotal }]] = await pool.query(
      "SELECT COUNT(*) AS flaggedTotal FROM movie_reviews WHERE moderation_status = 'flagged'",
    );

    res.json({ reviews, flaggedTotal: Number(flaggedTotal) || 0 });
  } catch (error) {
    console.error('Admin list reviews error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách đánh giá' });
  }
});

// Duyệt (kiểm duyệt THỦ CÔNG) 1 đánh giá đang 'flagged' — chuyển sang hiển thị
// công khai + thưởng điểm nếu chưa từng được thưởng cho đánh giá này
// (points_awarded chống thưởng trùng khi lỡ duyệt lại đánh giá đã approved).
router.post('/admin/:reviewId/approve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const [[review]] = await pool.query('SELECT id, user_id, points_awarded FROM movie_reviews WHERE id = ?', [reviewId]);
    if (!review) return res.status(404).json({ error: 'Không tìm thấy đánh giá' });

    await pool.execute(
      "UPDATE movie_reviews SET moderation_status = 'approved', moderation_reason = NULL, moderated_by = ?, moderated_at = NOW() WHERE id = ?",
      [req.user.id, reviewId]
    );

    if (!review.points_awarded) {
      const result = await pointsService.awardPoints(review.user_id, pointsService.REVIEW_APPROVED_BONUS, 'Đánh giá phim được duyệt', {
        referenceType: 'review', referenceId: review.id,
      });
      if (result.awarded) await pool.execute('UPDATE movie_reviews SET points_awarded = 1 WHERE id = ?', [reviewId]);
    }

    // Báo lại cho NGƯỜI VIẾT. Đánh giá của họ bị ẩn từ lúc gửi mà không có
    // lời giải thích nào; nếu duyệt xong cũng im lặng thì họ không bao giờ biết
    // bài đã hiện công khai (và đã được cộng điểm).
    try {
      await Notification.create({
        userId: review.user_id,
        type: 'review_approved',
        title: '✅ Đánh giá của bạn đã được duyệt',
        message: 'Đánh giá của bạn đã hiển thị công khai. Cảm ơn bạn đã chia sẻ cảm nhận!',
        data: { reviewId: review.id },
      });
    } catch (e) { console.error('Gửi thông báo duyệt đánh giá thất bại:', e.message); }

    res.json({ success: true, message: 'Đã duyệt đánh giá — hiện công khai và đã thưởng điểm cho người viết' });
  } catch (error) {
    console.error('Approve review error:', error);
    res.status(500).json({ error: 'Không thể duyệt đánh giá' });
  }
});

// Từ chối (kiểm duyệt THỦ CÔNG) — ẩn khỏi công khai nhưng KHÔNG xoá (khác
// DELETE bên dưới), giữ lại lý do để người viết/admin xem lại sau này.
router.post('/admin/:reviewId/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;
    const finalReason = reason || 'Vi phạm quy định nội dung';

    const [[review]] = await pool.query('SELECT id, user_id, movie_id FROM movie_reviews WHERE id = ?', [reviewId]);
    if (!review) return res.status(404).json({ error: 'Không tìm thấy đánh giá' });

    await pool.execute(
      "UPDATE movie_reviews SET moderation_status = 'rejected', moderation_reason = ?, moderated_by = ?, moderated_at = NOW() WHERE id = ?",
      [finalReason, req.user.id, reviewId]
    );

    // Người viết cần biết VÌ SAO đánh giá của họ không hiển thị công khai —
    // nếu không, review "biến mất" mà không có lời giải thích nào.
    Notification.create({
      userId: review.user_id,
      type: 'review_rejected',
      title: '😔 Đánh giá của bạn không được duyệt',
      message: `Lý do: ${finalReason}. Bạn có thể chỉnh sửa lại nội dung và gửi lại.`,
      data: { reviewId: review.id, movieId: review.movie_id, reason: finalReason },
    }).catch((e) => console.error('⚠️ Không tạo được thông báo từ chối đánh giá:', e.message));

    res.json({ success: true, message: 'Đã từ chối đánh giá' });
  } catch (error) {
    console.error('Reject review error:', error);
    res.status(500).json({ error: 'Không thể từ chối đánh giá' });
  }
});

// Admin xoá đánh giá của BẤT KỲ người dùng nào theo review id (khác với
// DELETE /:movieId bên dưới — route đó chỉ cho phép tự xoá đánh giá của
// chính mình theo movie_id, không nhận review id và không dùng được cho
// mục đích kiểm duyệt).
router.delete('/admin/:reviewId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const [result] = await pool.execute('DELETE FROM movie_reviews WHERE id = ?', [reviewId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    }

    res.json({ success: true, message: 'Đã xoá đánh giá' });
  } catch (error) {
    console.error('Admin delete review error:', error);
    res.status(500).json({ error: 'Không thể xoá đánh giá' });
  }
});

// Get reviews for a movie
router.get('/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Chỉ hiện đánh giá đã DUYỆT ('approved') — đánh giá đang chờ duyệt
    // ('flagged') hoặc bị từ chối ('rejected') không hiển thị công khai.
    // Xem reviewModeration.service.js cho luồng kiểm duyệt tự động lúc gửi.
    const [reviews] = await pool.query(
      `SELECT
        r.id, r.rating, r.review_text, r.sentiment_label, r.sentiment_score, r.created_at, r.updated_at,
        u.id as user_id,
        COALESCE(u.username, u.email) as username,
        u.email,
        (SELECT COUNT(*) FROM review_helpful WHERE review_id = r.id) as helpful_count
       FROM movie_reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.movie_id = ? AND r.moderation_status = 'approved'
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [movieId, parseInt(limit), parseInt(offset)]
    );

    const [total] = await pool.execute(
      "SELECT COUNT(*) as count FROM movie_reviews WHERE movie_id = ? AND moderation_status = 'approved'",
      [movieId]
    );

    res.json({
      reviews,
      total: total[0].count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
});

// Submit/Update review (requires authentication)
router.post('/:movieId', verifyToken, async (req, res) => {
  try {
    const { movieId } = req.params;
    const { rating, review_text } = req.body;
    const userId = req.user.id;

    // Validate
    if (rating !== null && (rating < 0 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 0 and 5' });
    }

    if (!review_text || review_text.trim().length < 10) {
      return res.status(400).json({ error: 'Review must be at least 10 characters' });
    }

    // Bắt buộc đã MUA VÉ phim này mới được review — trước đây ai có tài khoản
    // cũng review được bất kỳ phim nào kể cả chưa từng xem, không thực tế so
    // với các nền tảng đánh giá thật (đều gắn nhãn/yêu cầu "verified purchase").
    // Chỉ tính vé đã thanh toán VÀ chưa bị huỷ — vé "pending" (chưa thanh toán
    // xong) hoặc đã huỷ không được coi là đã xem phim.
    const [[{ cnt: purchaseCount }]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.user_id = ? AND s.movie_id = ? AND t.payment_status = 'paid' AND t.booking_status != 'cancelled'`,
      [userId, movieId]
    );
    if (purchaseCount === 0) {
      return res.status(403).json({ error: 'Bạn cần đặt vé và thanh toán cho phim này trước khi có thể đánh giá' });
    }

    // Phân tích sắc thái nội dung review (Sentiment Analysis) — gắn nhãn
    // tích cực/trung lập/tiêu cực ngay khi review được gửi, để admin có thể
    // lọc/theo dõi các review tiêu cực mà không cần đọc thủ công từng review.
    const sentiment = analyzeSentiment(review_text);

    // Kiểm duyệt TỰ ĐỘNG ngay lúc gửi — đa số đánh giá hợp lệ được duyệt và
    // hiển thị công khai NGAY LẬP TỨC; chỉ những đánh giá có dấu hiệu vi phạm
    // rõ ràng (từ tục, spam) mới bị giữ lại chờ admin duyệt tay ('flagged').
    // Xem reviewModeration.service.js.
    const moderation = autoModerate(review_text);

    // Insert or update — nếu sửa lại 1 đánh giá đã gửi trước đó, chấm kiểm
    // duyệt LẠI theo nội dung mới (xoá luôn dấu vết duyệt tay cũ, vì nội dung
    // đã khác) thay vì giữ nguyên trạng thái cũ không còn đúng với nội dung mới.
    await pool.execute(
      `INSERT INTO movie_reviews (movie_id, user_id, rating, review_text, sentiment_label, sentiment_score, moderation_status, moderation_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         review_text = VALUES(review_text),
         sentiment_label = VALUES(sentiment_label),
         sentiment_score = VALUES(sentiment_score),
         moderation_status = VALUES(moderation_status),
         moderation_reason = VALUES(moderation_reason),
         moderated_by = NULL,
         moderated_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [movieId, userId, rating, review_text, sentiment.label, sentiment.score, moderation.status, moderation.reason]
    );

    const [[reviewRow]] = await pool.query(
      'SELECT id, points_awarded FROM movie_reviews WHERE movie_id = ? AND user_id = ?',
      [movieId, userId]
    );

    // Báo cho QUẢN TRỊ VIÊN khi có đánh giá bị giữ lại. Trước đây đánh giá bị
    // giữ chỉ nằm im trong hàng chờ ở trang "Kiểm duyệt đánh giá" — không ai
    // được báo, nên nếu admin không tự nhớ vào xem thì nó treo vô thời hạn:
    // người viết không thấy bài của mình đâu, admin không biết có việc cần làm.
    if (moderation.status === 'flagged') {
      try {
        const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_blocked = 0");
        const [[mv]] = await pool.query('SELECT title FROM movies WHERE id = ?', [movieId]);
        await Promise.all(admins.map((a) => Notification.create({
          userId: a.id,
          type: 'review_flagged',
          title: '🛡️ Có đánh giá cần kiểm duyệt',
          message: `Một đánh giá về phim "${mv?.title || 'không rõ'}" bị giữ lại: ${moderation.reason}. Vào mục Kiểm duyệt đánh giá để xử lý.`,
          data: { reviewId: reviewRow?.id, movieId, reason: moderation.reason },
        })));
      } catch (e) {
        // Không để lỗi gửi thông báo làm hỏng việc lưu đánh giá — đánh giá đã
        // ghi vào DB rồi, thông báo chỉ là việc phụ.
        console.error('Gửi thông báo kiểm duyệt cho admin thất bại:', e.message);
      }
    }

    // Thưởng điểm NGAY khi được duyệt tự động — points_awarded + UNIQUE
    // constraint ở point_transactions đảm bảo không thưởng lại nếu user sửa
    // review nhiều lần (reference_id luôn là cùng 1 review.id).
    let pointsAwarded = 0;
    if (moderation.status === 'approved' && reviewRow && !reviewRow.points_awarded) {
      const result = await pointsService.awardPoints(userId, pointsService.REVIEW_APPROVED_BONUS, 'Đánh giá phim được duyệt', {
        referenceType: 'review', referenceId: reviewRow.id,
      });
      if (result.awarded) {
        pointsAwarded = result.amount;
        await pool.execute('UPDATE movie_reviews SET points_awarded = 1 WHERE id = ?', [reviewRow.id]);
      }
    }

    res.json({
      success: true,
      message: moderation.status === 'flagged'
        ? 'Đánh giá của bạn đã được ghi nhận và đang chờ admin duyệt trước khi hiển thị công khai'
        : 'Đánh giá đã được đăng',
      moderationStatus: moderation.status,
      moderationReason: moderation.reason,
      sentiment: { label: sentiment.label, score: sentiment.score },
      pointsAwarded,
    });
  } catch (error) {
    console.error('Submit review error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({
      error: 'Failed to submit review',
    });
  }
});

// Delete review (requires authentication)
router.delete('/:movieId', verifyToken, async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user.id;

    const [result] = await pool.execute(
      'DELETE FROM movie_reviews WHERE movie_id = ? AND user_id = ?',
      [movieId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Mark review as helpful (requires authentication)
router.post('/:reviewId/helpful', verifyToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    await pool.execute(
      'INSERT IGNORE INTO review_helpful (review_id, user_id) VALUES (?, ?)',
      [reviewId, userId]
    );

    const [count] = await pool.execute(
      'SELECT COUNT(*) as count FROM review_helpful WHERE review_id = ?',
      [reviewId]
    );

    res.json({
      success: true,
      helpful_count: count[0].count,
    });
  } catch (error) {
    console.error('Mark helpful error:', error);
    res.status(500).json({ error: 'Failed to mark review as helpful' });
  }
});

module.exports = router;
