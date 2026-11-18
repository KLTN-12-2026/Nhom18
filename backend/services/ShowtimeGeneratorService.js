/**
 * ShowtimeGeneratorService
 *
 * Tự động tạo suất chiếu với:
 *  - Hệ thống chấm điểm PHA TRỘN: điểm nội bộ (vé/rating/yêu thích) luôn được
 *    cộng với baseline "cold start" (TMDb hoặc thể loại), baseline giảm dần
 *    ảnh hưởng khi phim có càng nhiều dữ liệu thật — không chọn cứng 1 trong 3
 *    nguồn, để tránh phim CHƯA có dữ liệu lại có điểm cao hơn phim ĐÃ bán vé.
 *  - Tối ưu lịch theo thời lượng phim (không dùng slot cứng)
 *  - Phân bổ phim vào phòng và khung giờ thực tế
 */

const { pool } = require('../config/database');
const config = require('../config/scheduler.config');
const fetch = require('node-fetch');
const { formatLocalDateString, parseLocalDateString } = require('../utils/dateUtils');

// ── Hằng số ───────────────────────────────────────
// Đọc từ config.OPERATING_HOURS (ràng buộc RB-C2) — cùng nguồn với bộ kiểm lịch
// tạo tay và bộ soát lỗi, để ba nơi không bao giờ hiểu "giờ mở cửa" khác nhau.
const OPENING_HOUR = config.OPERATING_HOURS.OPEN_HOUR;   // 09:00
// Mốc phim phải KẾT THÚC TRƯỚC (tính theo phút trong ngày, 25 = 01:00 hôm sau).
// Trước đây để 23 nên suất cuối phải kết thúc trước 23:00, tức phim 2 tiếng
// không thể bắt đầu sau 21:00 — kết quả: chỉ 5/387 suất từ 21h trở đi (1%),
// còn khung 19h và 21h gần như trống, trái hẳn rạp thật (suất khuya là khung
// đông khách). Ghi chú cũ ngay tại dòng này đã nói đúng ý định là 01:00.
const CLOSING_HOUR = config.OPERATING_HOURS.MUST_END_BY_HOUR;  // 25 = phim phải kết thúc trước 01:00 hôm sau
// Giờ MUỘN NHẤT còn mở suất mới. Rạp thật không bán suất bắt đầu lúc 23:55 dù
// phim ngắn vẫn kịp kết thúc trước 01:00 — thiếu mốc này, thuật toán dồn hàng
// chục suất vào khung 23h30–23h55 cho đủ chỗ trống.
const LAST_START_HOUR = config.OPERATING_HOURS.LAST_START_HOUR;

// Điểm theo thể loại dùng cho Tier 3 (fallback metadata)
const GENRE_BASE_SCORES = {
  action: 72, 'sci-fi': 68, animation: 75, adventure: 70,
  comedy: 62, thriller: 65, drama: 52, mystery: 58,
  romance: 46, horror: 60, fantasy: 67, biography: 42,
  crime: 58, 'action, sci-fi': 73, 'action, adventure': 71,
  'animation, adventure': 72, 'animation, fantasy': 70,
};
// Sắp theo ĐỘ DÀI KHOÁ GIẢM DẦN — _genreScore() dò khớp bằng includes() (khớp
// chuỗi con), nên phải thử khoá DÀI/CỤ THỂ HƠN ("action, sci-fi") trước khoá
// NGẮN/CHUNG CHUNG hơn ("action"). Với thứ tự khai báo cũ (action trước
// "action, sci-fi"), phim thể loại "Action, Sci-Fi" luôn khớp "action" (72)
// ngay lập tức và KHÔNG BAO GIỜ tới được điểm riêng cho tổ hợp "action,
// sci-fi" (73) — quy tắc tổ hợp coi như chết, và với "Animation, Adventure"
// còn tệ hơn: khớp nhầm "animation" (75) thay vì đúng điểm tổ hợp (72), làm
// điểm phổ biến bị TĂNG ẢO. Sắp theo độ dài đảm bảo khoá cụ thể luôn được ưu
// tiên thử trước, bất kể thứ tự khai báo trong object phía trên.
const GENRE_BASE_SCORES_BY_SPECIFICITY = Object.entries(GENRE_BASE_SCORES)
  .sort((a, b) => b[0].length - a[0].length);

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DANH MỤC RÀNG BUỘC CỦA THUẬT TOÁN LẬP LỊCH (tra theo mã, vd tìm "RB-C1")
 * ═══════════════════════════════════════════════════════════════════════════
 * Thuật toán: THAM LAM NHIỀU VÒNG (greedy, heuristic) — mỗi ngày chạy 3 vòng:
 *   Vòng 1 _ensureBaseline  → bảo đảm công bằng (RB-M1)
 *   Vòng 2 _allocateBonus   → phân thêm suất theo độ phổ biến (RB-M2, M3, M4, M8)
 *   Vòng 3 _fillRoomGaps    → lấp giờ trống còn lại trong phòng (RB-C5)
 * Mỗi suất chỉ được chèn khi thoả MỌI ràng buộc cứng; ràng buộc mềm quyết
 * định THỨ TỰ thử (phim nào, phòng nào, giờ nào trước). Không phải tối ưu
 * toàn cục: đổi thứ tự thử có thể ra lịch khác, nhưng lịch nào cũng hợp lệ.
 *
 * RÀNG BUỘC CỨNG — không bao giờ vi phạm (vi phạm = không chèn suất đó):
 *   RB-C1  Không trùng phòng: suất sau chỉ bắt đầu khi suất trước chiếu xong
 *          + MIN_BUFFER_MINUTES (20') dọn phòng. checkRoomConflict(); CSDL còn
 *          chặn thêm bằng UNIQUE(room_id, show_date, show_time).
 *   RB-C2  Giờ hoạt động: mở 09:00 (cuối tuần sớm 45'), phim chiếu xong trước
 *          01:00, suất cuối bắt đầu trước 22:30 (cuối tuần 23:15), cộng độ
 *          lệch theo rạp. config.OPERATING_HOURS; _openCloseMinutes(),
 *          checkRoomConflict(). Cùng nguồn với utils/showtimeValidation.js.
 *   RB-C3  Không xếp suất vào giờ đã qua (khi tạo lịch cho hôm nay). _timeGrid()
 *   RB-C4  Phim chỉ có suất từ ngày ra rạp (release_date). generateWeeklyShowtimes()
 *   RB-C5  Vòng 3: một phim tối đa MAX_REPEATS_PER_MOVIE_PER_ROOM_PER_DAY (3)
 *          suất/phòng/ngày, tránh một phim độc chiếm phòng. _fillRoomGaps()
 *   RB-C6  Vòng 2–3: mỗi phòng lấp tối đa ROOM_FILL_MAX_FRACTION số khung giờ
 *          (ngày thường 30%, cuối tuần 100%). _roomCapacityRemaining()
 *
 * RÀNG BUỘC MỀM — mục tiêu ưu tiên, cố đạt nhưng có thể không đạt khi hết chỗ:
 *   RB-M1  Công bằng: mọi phim có mặt ở cả 3 rạp trong tuần (xoay vòng 1
 *          rạp/ngày). _ensureBaseline()
 *   RB-M2  Phim thường không nhiều suất hơn phim banner trong cùng ngày.
 *          _featuredFloor()
 *   RB-M3  Số suất/phòng/ngày theo điểm phổ biến (3 hạng) và giảm dần theo
 *          tuổi phim. _showtimesForScore(), getAgeDecayMultiplier()
 *   RB-M4  Cuối tuần (T6–CN) nhiều suất gấp WEEKEND_SHOWTIME_MULTIPLIER (1,3).
 *          _targetForDate()
 *   RB-M5  Khung giờ được thử theo nhu cầu vé bán THẬT (thứ × giờ), thiếu dữ
 *          liệu thì dùng đường cong nhu cầu mặc định. _slotDemandScore(),
 *          _buildPrioritizedSlots()
 *   RB-M6  Phim hot ưu tiên phòng cao cấp (IMAX/VIP/4DX) — ưu tiên chứ KHÔNG
 *          loại trừ phòng khác. filterRoomsByPopularity()
 *   RB-M7  Các rạp lệch giờ nhau 0/10/20 phút cho tự nhiên. getCinemaOffsetMinutes()
 *   RB-M8  Suất thêm của một phim trải đều các rạp (rạp đang ít suất phim đó
 *          nhất được thử trước). _placeOne()
 *
 * Kiểm chứng độc lập: scripts/_audit-logic.js soát lại RB-C1, RB-C2 trên dữ
 * liệu thật trong CSDL sau khi sinh lịch.
 * ═══════════════════════════════════════════════════════════════════════════
 */
class ShowtimeGeneratorService {
  constructor() {
    this.config = config;
    this.generatedCount = 0;
    this.skippedCount = 0;
    // Số suất KHÔNG THỬ chèn vì phòng đã hết công suất trong ngày —
    // khác hẳn "bỏ qua" (đã thử nhưng mọi khung giờ đều vướng).
    this.capacityLimitedCount = 0;
    this.errors = [];
    this.dryRun = false;
    this.pendingInserts = [];
    this._datLaiChiMuc();
  }

  // ═══════════════════════════════════════════════
  // ENTRY POINT
  // ═══════════════════════════════════════════════

  /**
   * @param {Date} weekStart
   * @param {{ dryRun?: boolean }} [options] dryRun=true: chạy đúng thuật toán thật nhưng
   *   không ghi DB — dùng để xem trước số liệu CHÍNH XÁC (bao gồm số phòng, giới hạn vật lý,
   *   conflict giữa các phim) thay vì ước lượng đơn giản.
   */
  /**
   * CHỈ MỤC cho pendingInserts.
   *
   * Vì sao cần: mỗi lần thử đặt một suất, thuật toán phải hỏi "phòng này ngày
   * này đã có suất nào chưa" và "phim này hôm nay đã có mấy suất". Bản đầu
   * QUÉT TOÀN BỘ mảng pendingInserts cho từng câu hỏi — mà mảng đó lớn dần
   * theo đúng số suất đang sinh ra. Kết quả là O(n²): đo thực tế 7 ngày mất
   * 0,65 giây nhưng 28 ngày mất 5,12 giây (gấp 4 lần ngày nhưng gấp 7,9 lần
   * thời gian, số mũ ~1,5 và còn tăng).
   *
   * Hai Map dưới đây trả lời cùng câu hỏi đó trong thời gian hằng số, đổi lại
   * một chút bộ nhớ. Không đổi MỘT chút nào về kết quả xếp lịch — chỉ đổi cách
   * tra cứu.
   */
  _datLaiChiMuc() {
    this.idxPhongNgay = new Map();   // "room_id|date"  -> [suất]
    this.idxPhimNgay = new Map();    // "movie_id|date" -> [suất]
    this.idxNgay = new Map();        // "date"          -> Map(movie_id -> số suất)
  }

  _themVaoChiMuc(p) {
    const kPhong = p.room_id + '|' + p.show_date;
    const kPhim = p.movie_id + '|' + p.show_date;
    if (!this.idxPhongNgay.has(kPhong)) this.idxPhongNgay.set(kPhong, []);
    if (!this.idxPhimNgay.has(kPhim)) this.idxPhimNgay.set(kPhim, []);
    this.idxPhongNgay.get(kPhong).push(p);
    this.idxPhimNgay.get(kPhim).push(p);

    if (!this.idxNgay.has(p.show_date)) this.idxNgay.set(p.show_date, new Map());
    const dem = this.idxNgay.get(p.show_date);
    dem.set(p.movie_id, (dem.get(p.movie_id) || 0) + 1);
  }

  /** Các suất của 1 PHÒNG trong 1 NGÀY — thay cho việc quét cả pendingInserts. */
  _suatCuaPhong(roomId, date) {
    return this.idxPhongNgay.get(roomId + '|' + date) || [];
  }

  /** Các suất của 1 PHIM trong 1 NGÀY. */
  _suatCuaPhim(movieId, date) {
    return this.idxPhimNgay.get(movieId + '|' + date) || [];
  }

  async generateWeeklyShowtimes(weekStart, { dryRun = false } = {}) {
    const startTime = Date.now();
    this.log(`🎬 Bắt đầu ${dryRun ? 'XEM TRƯỚC' : 'tạo'} suất chiếu từ ${formatLocalDateString(weekStart)}`);

    this.generatedCount = 0;
    this.skippedCount = 0;
    // Số suất KHÔNG THỬ chèn vì phòng đã hết công suất trong ngày —
    // khác hẳn "bỏ qua" (đã thử nhưng mọi khung giờ đều vướng).
    this.capacityLimitedCount = 0;
    this.errors = [];
    this.dryRun = dryRun;
    this.pendingInserts = []; // mọi suất chiếu (thật hoặc mô phỏng) trong lần chạy này
    this._datLaiChiMuc();
    // Thống kê nhu cầu vé thật theo (thứ trong tuần, khung giờ) — dùng để XẾP
    // HẠNG khung giờ khi phân bổ, thay vì random. Lấy 1 LẦN cho cả lần chạy
    // (không đổi trong lúc tạo lịch), xem _getSlotDemandProfile().
    this._slotDemandProfile = await this._getSlotDemandProfile();

    const movies = await this.fetchEligibleMovies(weekStart);
    this.log(`📊 Tìm thấy ${movies.length} phim đủ điều kiện`);
    if (!movies.length) return { success: false, message: 'Không có phim nào đủ điều kiện' };

    const rooms = await this.fetchAvailableRooms();
    this.log(`🏢 Tìm thấy ${rooms.length} phòng chiếu`);

    const dates = this.generateDateRange(weekStart, this.config.DAYS_PER_WEEK);

    // Đếm suất chiếu ĐÃ CÓ SẴN trong tuần này TRƯỚC khi chạy thuật toán — lý
    // do phổ biến nhất khiến số "bỏ qua" (skipped) rất cao và nhiều phim chỉ
    // được rất ít/0 suất KHÔNG PHẢI lỗi thuật toán, mà vì phòng/khung giờ
    // trong tuần đó đã bị suất chiếu CŨ chiếm gần hết (checkRoomConflict()
    // đúng đắn từ chối chèn đè lên). Trả về số này để hiển thị rõ nguyên
    // nhân cho admin thay vì chỉ thấy 1 con số "skipped" khó hiểu.
    const dayAfterLast = parseLocalDateString(dates[dates.length - 1]);
    dayAfterLast.setDate(dayAfterLast.getDate() + 1);
    const [existingRows] = await pool.query(
      `SELECT COUNT(*) as n FROM showtimes WHERE show_date >= ? AND show_date < ?`,
      [dates[0], formatLocalDateString(dayAfterLast)]
    );
    const existingShowtimesInWeek = existingRows[0].n;

    // Tính trước cấu hình (tier, số suất/phòng, phòng phù hợp) cho mỗi phim —
    // không đụng DB nên có thể tái dùng cho cả 2 vòng dưới.
    const movieConfigs = movies
      .filter((m) => m.weeks_since_release < this.config.AGE_DECAY_MULTIPLIER.STOP_AT_WEEK)
      .map((m) => this._buildMovieConfig(m, rooms));

    for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
      const date = dates[dayIndex];
      // Chỉ những phim đã tới/qua ngày ra mắt THẬT tính đến ngày đang xét mới
      // được sinh suất chiếu cho ngày đó — phim COMING_SOON release giữa tuần
      // (vd Thứ 5) sẽ KHÔNG có suất ở Thứ 2-4, dù đã "đủ điều kiện" cho cả
      // tuần theo fetchEligibleMovies (điều kiện đó chỉ chặn ở mức tuần).
      // [RB-C4] Phim chỉ có suất từ ngày ra rạp
      const activeConfigs = movieConfigs.filter((mc) => mc.releaseDateStr <= date);

      // VÒNG 1 — đảm bảo CÔNG BẰNG: mỗi phim được chiếu đủ ở CẢ 3 RẠP trong
      // TUẦN (xoay vòng 1 rạp/ngày, xem _ensureBaseline), KHÔNG bắt buộc mỗi
      // ngày phải có mặt ở mọi rạp như trước — bắt buộc mỗi ngày từng khiến 1
      // phim cần tới 3 lượt/ngày, và với ~15 phim đang chiếu chung lúc, riêng
      // vòng này đã chiếm gần hết công suất 10 phòng vật lý MỌI ngày, khiến
      // phần thưởng cuối tuần ở vòng 2 không còn chỗ nào để phát huy tác dụng
      // dù công thức tính đúng. Xoay vòng giữ đúng tinh thần "công bằng cả
      // tuần" (mọi phim vẫn đủ mặt ở mọi rạp) nhưng giải phóng ~2/3 công suất
      // mỗi ngày cho vòng 2-3 sử dụng — trong đó có phần thưởng cuối tuần.
      for (const mc of activeConfigs) {
        // [RB-M1] Công bằng: mọi phim đủ mặt 3 rạp trong tuần
        mc.baselineCinemaCoverage = await this._ensureBaseline(mc, date, dayIndex);
      }

      // VÒNG 2 — suất chiếu THÊM theo độ phổ biến (cuối tuần nhiều hơn), chia
      // THEO LƯỢT: nhóm phim banner được chia xong trước rồi mới tới phim
      // thường, và phim thường không bao giờ nhiều suất hơn phim banner (xem
      // _allocateBonus). Trước đây mỗi phim lấy trọn chỉ tiêu trên MỌI phòng
      // rồi mới tới phim sau: banner #1 Joker chiếm 44 suất/tuần, tới banner
      // #5 Spider-Man thì hết chỗ, chỉ còn 7 suất bắt buộc của vòng 1.
      await this._allocateBonus(date, activeConfigs);

      // VÒNG 3 — lấp lỗ hổng giờ trống còn lại trong từng phòng (rạp thật hiếm
      // khi để phòng trống nhiều giờ liền giữa 2 suất như vòng 1-2 có thể để lại).
      // Chỉ dùng activeConfigs — phim chưa ra mắt không được dùng để lấp chỗ trống.
      if (this.config.ENABLE_GAP_FILL) {
        await this._fillRoomGaps(date, activeConfigs);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    this.log(`✅ Hoàn thành: tạo ${this.generatedCount}, bỏ qua ${this.skippedCount}, lỗi ${this.errors.length}`);

    return {
      success: true,
      generated: this.generatedCount,
      skipped: this.skippedCount,
      capacityLimited: this.capacityLimitedCount,
      errors: this.errors.length,
      duration: `${duration}s`,
      details: {
        moviesProcessed: movies.length,
        roomsAvailable: rooms.length,
        dateRange: { from: dates[0], to: dates[dates.length - 1] },
        existingShowtimesInWeek
      },
      // Tổng hợp chính xác theo từng phim, lấy trực tiếp từ các suất đã (mô phỏng) chèn —
      // không phải công thức ước lượng, nên luôn khớp với this.generatedCount.
      movieSummary: this._buildMovieSummary(movieConfigs),
      // Lịch chiếu chi tiết từng suất (ngày/giờ/phim/rạp/phòng) — dùng cho "Xem chi tiết".
      schedule: this.pendingInserts
    };
  }

  /** Tổng hợp số suất/phòng/doanh thu thực tế theo từng phim từ this.pendingInserts */
  _buildMovieSummary(movieConfigs) {
    return movieConfigs.map((mc) => {
      const rows = this.pendingInserts.filter((p) => p.movie_id === mc.movie.id);
      const roomsUsed = new Map();
      const daysCovered = new Set();
      let revenuePotential = 0;
      for (const r of rows) {
        daysCovered.add(r.show_date);
        revenuePotential += r.price * r.total_seats;
        if (!roomsUsed.has(r.room_id)) {
          roomsUsed.set(r.room_id, { id: r.room_id, name: r.room_name, room_type: r.room_type, cinema_name: r.cinema_name });
        }
      }
      return {
        id: mc.movie.id,
        title: mc.movie.title,
        status: mc.movie.status,
        popularity_score: mc.movie.popularity_score,
        popularity_tier: mc.movie.popularity_tier,
        scoring_source: mc.movie.scoring_source,
        ticket_count: mc.movie.ticket_count,
        average_rating: mc.movie.average_rating,
        favorite_count: mc.movie.favorite_count,
        weeks_since_release: mc.movie.weeks_since_release,
        rooms_used: Array.from(roomsUsed.values()),
        days_covered: daysCovered.size,
        estimated_total_showtimes: rows.length,
        estimated_showtimes_per_day: Math.round((rows.length / this.config.DAYS_PER_WEEK) * 10) / 10,
        revenue_potential: revenuePotential
      };
    });
  }

  // ═══════════════════════════════════════════════
  // TẦNG 1-2-3: SCORING
  // ═══════════════════════════════════════════════

  /**
   * Tải phim đủ điều kiện và tính điểm theo công thức pha trộn (xem _scoreMovie).
   */
  async fetchEligibleMovies(weekStart) {
    const connection = await pool.getConnection();
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const statusPlaceholders = this.config.ELIGIBLE_STATUSES.map(() => '?').join(',');

      const [movies] = await connection.query(`
        SELECT
          m.id, m.title, m.duration, m.status, m.release_date, m.genre, m.featured_order,
          COALESCE(
            (SELECT AVG(mr.rating) FROM movie_ratings mr WHERE mr.movie_id = m.id),
            m.average_rating, 0
          ) AS average_rating,
          -- NULLIF(COUNT(*), 0): COUNT(*) không BAO GIỜ trả NULL (luôn ra 0 khi
          -- không có dòng nào khớp), nên COALESCE phía dưới nếu để COUNT(*) trần
          -- sẽ KHÔNG BAO GIỜ rơi xuống m.rating_count — cột đó coi như chết dù
          -- có 16 phim đang seed sẵn rating_count/average_rating hợp lệ (vd "The
          -- Dark Knight Returns" rating_count=2) nhưng movie_ratings thật chưa ai
          -- đánh giá. Bọc NULLIF để 0 thật sự thành NULL, COALESCE mới rơi đúng
          -- xuống giá trị seed sẵn thay vì luôn coi là 0.
          COALESCE(
            NULLIF((SELECT COUNT(*) FROM movie_ratings mr WHERE mr.movie_id = m.id), 0),
            m.rating_count, 0
          ) AS rating_count,
          COALESCE(
            (SELECT COUNT(t.id) FROM tickets t
             JOIN showtimes s ON t.showtime_id = s.id
             WHERE s.movie_id = m.id AND t.booking_status = 'confirmed'), 0
          ) AS ticket_count,
          COALESCE((SELECT COUNT(*) FROM favorites WHERE movie_id = m.id), 0) AS favorite_count,
          DATEDIFF(?, m.release_date) / 7 AS weeks_since_release
        FROM movies m
        WHERE m.status IN (${statusPlaceholders})
          AND (
            m.status = 'NOW_SHOWING'
            OR (m.status = 'COMING_SOON' AND m.release_date <= ? AND ? = 1)
          )
        ORDER BY m.release_date DESC
      `, [weekStart, ...this.config.ELIGIBLE_STATUSES, weekEnd, this.config.ENABLE_COMING_SOON ? 1 : 0]);

      // Tính điểm theo hệ 3 tầng
      const scored = await Promise.all(movies.map(m => this._scoreMovie(m)));
      const tiered = scored.map((m) => {
        const isFeatured = m.featured_order != null;
        return {
          ...m,
          is_featured: isFeatured,
          // PHIM NỔI BẬT (đang nằm trên banner lớn trang chủ) luôn được xếp ở
          // tầng cao nhất. Lý do: banner là chỗ web quảng bá mạnh nhất — nếu
          // khách bấm vào phim trên banner mà lịch chiếu thưa thớt thì chính
          // trang chủ đang dẫn khách tới ngõ cụt. Điểm phổ biến tính từ vé đã
          // bán nên phim mới lên banner luôn bị điểm thấp lúc đầu (chưa ai
          // mua), đúng lúc cần nhiều suất nhất — nghịch lý "con gà quả trứng".
          popularity_tier: isFeatured ? 'HIGH' : this.getPopularityTier(m.popularity_score),
        };
      });
      // Thứ tự xử lý quyết định ai giành được khung giờ vàng trước:
      // phim nổi bật đi trước (theo đúng thứ tự trên banner), rồi mới tới các
      // phim còn lại xếp theo điểm phổ biến.
      tiered.sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        if (a.is_featured && b.is_featured) return a.featured_order - b.featured_order;
        return b.popularity_score - a.popularity_score;
      });
      return tiered;
    } finally {
      connection.release();
    }
  }

  /**
   * Điểm phổ biến = điểm nội bộ (luôn cộng) + baseline "cold start" (TMDb/thể loại)
   * với trọng số GIẢM DẦN theo lượng dữ liệu thật đã có.
   *
   * Lý do không dùng kiểu "chọn 1 trong 3 tầng" như cũ: công thức điểm nội bộ
   * (vé×0.6 + rating×6 + yêu thích×0.1) hiếm khi vượt 30-40 với lượng vé thực tế
   * của rạp vừa/nhỏ, trong khi baseline thể loại cố định ở mức 45-90. Nếu chọn
   * cứng 1 trong 2, phim CHƯA CÓ vé/rating nào (dùng baseline) lại có điểm CAO
   * HƠN phim ĐÃ bán được vé thật (dùng điểm nội bộ) — vô lý. Pha trộn liên tục
   * theo sampleSize giúp baseline chỉ đóng vai trò "khởi đầu công bằng" cho phim
   * mới, rồi nhường chỗ cho dữ liệu thật khi phim tích lũy đủ vé/rating/yêu thích.
   */
  async _scoreMovie(movie) {
    const internal = this._internalScore(movie.ticket_count, movie.average_rating, movie.favorite_count);
    const sampleSize = movie.ticket_count + movie.rating_count + movie.favorite_count;
    const coldStartWeight = 1 / (1 + sampleSize / this.config.POPULARITY_COLD_START_HALF_LIFE);

    let baseline = this._genreScore(movie.genre);
    let source = 'genre';
    // Chỉ gọi TMDb khi baseline còn đủ ảnh hưởng đến điểm cuối — phim đã có nhiều
    // dữ liệu thật thì baseline gần như không còn tác dụng, không cần tốn network call.
    if (coldStartWeight > 0.05 && process.env.TMDB_API_KEY) {
      const tmdbScore = await this._tmdbScore(movie.title);
      if (tmdbScore !== null) { baseline = tmdbScore; source = 'tmdb'; }
    }

    const score = internal + baseline * coldStartWeight;
    const label = sampleSize === 0 ? source : `${source}+internal`;
    this.log(`📊 [${label}] "${movie.title}": ${score.toFixed(1)} (nội bộ=${internal.toFixed(1)}, baseline=${baseline.toFixed(1)}×${coldStartWeight.toFixed(2)})`);
    return { ...movie, popularity_score: score, scoring_source: label };
  }

  /** Tầng 1 — điểm từ dữ liệu nội bộ */
  _internalScore(tickets, rating, favorites) {
    const w = this.config.POPULARITY_WEIGHTS;
    return (tickets * w.TICKET_COUNT) + (rating * w.AVERAGE_RATING * 20) + (favorites * w.FAVORITE_COUNT);
  }

  /** Tầng 2 — lấy điểm từ TMDb */
  async _tmdbScore(title) {
    try {
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=vi-VN`;
      const res = await fetch(url, { timeout: 5000 });
      if (!res.ok) return null;
      const data = await res.json();
      const hit = data.results?.[0];
      if (!hit || !hit.vote_count) return null;
      // Chuyển đổi: vote_average (0-10) → 0-100, cộng log(popularity)
      return (hit.vote_average / 10) * 80 + Math.min(Math.log1p(hit.popularity) * 3, 20);
    } catch {
      return null;
    }
  }

  /** Tầng 3 — điểm từ metadata thể loại */
  _genreScore(genre) {
    const g = (genre || '').toLowerCase();
    for (const [key, score] of GENRE_BASE_SCORES_BY_SPECIFICITY) {
      if (g.includes(key)) return score;
    }
    return 45; // Mặc định: dưới ngưỡng Medium
  }

  getPopularityTier(score) {
    if (score >= this.config.POPULARITY_TIERS.HIGH.MIN_SCORE)   return 'HIGH';
    if (score >= this.config.POPULARITY_TIERS.MEDIUM.MIN_SCORE) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Số suất/phòng mục tiêu cho 1 phim = nội suy TUYẾN TÍNH vị trí của điểm phổ
   * biến bên TRONG khoảng điểm của tier đó, map sang khoảng SHOWTIMES_PER_DAY
   * [MIN, MAX] của tier — vd 2 phim cùng tier HIGH nhưng 1 phim điểm cao hơn
   * (nhiều vé/rating/yêu thích hơn) sẽ được nhiều suất hơn phim điểm thấp hơn,
   * thay vì cả 2 cùng "random" trong [MIN, MAX] như cũ. Quyết định LUÔN dựa
   * trên dữ liệu điểm thật (đã tính ở _scoreMovie), không dùng Math.random()
   * cho bất kỳ lựa chọn nào ảnh hưởng tới độ "thông minh" của lịch chiếu.
   */
  // [RB-M3] Số suất theo độ phổ biến
  _showtimesForScore(score, tierName) {
    const tiers = this.config.POPULARITY_TIERS;
    const order = ['LOW', 'MEDIUM', 'HIGH'];
    const idx = order.indexOf(tierName);
    const tier = tiers[tierName];
    const nextTier = tiers[order[idx + 1]];
    const spanTop = nextTier ? nextTier.MIN_SCORE : tier.MIN_SCORE + this.config.TOP_TIER_SCORE_SPAN;
    const span = Math.max(1, spanTop - tier.MIN_SCORE);
    const fraction = Math.min(1, Math.max(0, (score - tier.MIN_SCORE) / span));
    const { MIN, MAX } = tier.SHOWTIMES_PER_DAY;
    return Math.round(MIN + fraction * (MAX - MIN));
  }

  // ═══════════════════════════════════════════════
  // TẠO SUẤT CHIẾU — PHÂN BỔ THEO DURATION
  // ═══════════════════════════════════════════════

  /**
   * Tính trước cấu hình phân bổ cho 1 phim: tier, số suất/phòng mong muốn,
   * danh sách phòng phù hợp. Không đụng DB nên gọi 1 lần, dùng lại cho mọi ngày.
   */
  _buildMovieConfig(movie, rooms) {
    const tier = this.config.POPULARITY_TIERS[movie.popularity_tier];
    let targetPerRoom = this._showtimesForScore(movie.popularity_score, movie.popularity_tier);

    // Phim BANNER không bị giảm suất theo tuổi phim: nó đang được quảng bá ở chỗ
    // nổi bật nhất web. Nếu không miễn, John Wick (khởi chiếu 31 tuần trước) bị
    // nhân 0,7 còn 2 suất/ngày — bằng hệt phim thường, mất luôn sự ưu tiên.
    if (this.config.ENABLE_AGE_DECAY && movie.weeks_since_release > 0 && !movie.is_featured) {
      targetPerRoom = Math.max(1, Math.floor(targetPerRoom * this.getAgeDecayMultiplier(movie.weeks_since_release)));
    }

    const suitableRooms = this.config.ENABLE_ROOM_PRIORITY
      ? this.filterRoomsByPopularity(rooms, movie.popularity_tier)
      : rooms;

    const duration = movie.duration || 120;
    const maxPhysical = this._maxSlotsPerDay(duration);
    const perRoom = Math.min(targetPerRoom, maxPhysical);

    // Phim COMING_SOON được coi "đủ điều kiện" cho CẢ TUẦN nếu release_date
    // rơi vào trong tuần (xem fetchEligibleMovies), nhưng bản thân điều kiện
    // đó chỉ so với NGÀY CUỐI TUẦN — không có gì chặn thuật toán sinh suất
    // chiếu cho những NGÀY TRƯỚC release_date (vd release Thứ 5 nhưng vẫn bị
    // sinh suất cho Thứ 2-4, trong khi chưa ai xem được phim). Lưu lại ngày ra
    // mắt để vòng lặp theo ngày (generateWeeklyShowtimes) lọc đúng — chỉ sinh
    // suất cho các ngày >= ngày ra mắt thật của phim đó. movies.release_date
    // là cột DATE và config/database.js đã bật dateStrings:["DATE"], nên đây
    // đã LÀ chuỗi "YYYY-MM-DD" sẵn — KHÔNG bọc qua new Date() rồi đọc lại
    // (new Date("YYYY-MM-DD") hiểu là nửa đêm UTC, vòng qua lại không cần
    // thiết và là đúng lớp lỗi lệch ngày UTC/local mà dateUtils.js đã cảnh báo).
    const releaseDateStr = String(movie.release_date);

    this.log(
      `🎥 "${movie.title}" (${movie.popularity_tier}, score:${movie.popularity_score.toFixed(0)})` +
      ` → mục tiêu ${perRoom}/phòng × ${suitableRooms.length} phòng phù hợp`
    );

    return { movie, tier, perRoom, suitableRooms, duration, releaseDateStr };
  }

  /**
   * Đảm bảo phim có ÍT NHẤT 1 suất chiếu trong ngày ở 1 RẠP ĐƯỢC XOAY VÒNG
   * theo dayIndex — KHÔNG bắt buộc mọi rạp mỗi ngày (xem giải thích trong
   * generateWeeklyShowtimes). Rạp được chọn đổi mỗi ngày theo công thức
   * `(dayIndex + movie.id) % số_rạp_phù_hợp`, offset theo movie.id để các
   * phim không cùng "rơi" vào đúng 1 rạp ở cùng 1 ngày, giúp mỗi phim vẫn ghé
   * qua ĐỦ CẢ 3 rạp trong 1 tuần 7 ngày (7 > 3 nên mỗi rạp được ghé ít nhất 2
   * lần/tuần) mà không cần y êu cầu đủ mặt mỗi ngày. Nếu chỉ có ≤1 rạp phù hợp
   * (hoặc không truyền dayIndex, vd gọi từ boostMovie) thì giữ hành vi cũ —
   * thử tất cả rạp phù hợp, không cần xoay vòng vì không có gì để xoay.
   * @returns {number} số rạp đã chèn được suất chiếu baseline (0 hoặc 1 khi có xoay vòng)
   */
  async _ensureBaseline(mc, date, dayIndex) {
    if (!mc.suitableRooms.length) {
      this.log(`⚠️  Không tìm được phòng phù hợp cho "${mc.movie.title}"`, 'WARN');
      return 0;
    }

    const roomsByCinema = new Map();
    for (const room of mc.suitableRooms) {
      if (!roomsByCinema.has(room.cinema_id)) roomsByCinema.set(room.cinema_id, []);
      roomsByCinema.get(room.cinema_id).push(room);
    }

    const cinemaIds = [...roomsByCinema.keys()].sort((a, b) => a - b);
    const targetCinemaIds = (dayIndex != null && cinemaIds.length > 1)
      ? [cinemaIds[(dayIndex + mc.movie.id) % cinemaIds.length]]
      : cinemaIds;

    let cinemasCovered = 0;
    for (const cinemaId of targetCinemaIds) {
      const rooms = roomsByCinema.get(cinemaId);
      let placed = false;
      for (const room of rooms) {
        const slots = this._buildPrioritizedSlots(mc.duration, date, room.cinema_id);
        for (const timeSlot of slots) {
          if (!(await this.checkRoomConflict(room.room_id, date, timeSlot, mc.duration, room.cinema_id))) {
            await this._doInsert(mc.movie, room, date, timeSlot);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) cinemasCovered++;
      else this.log(`⚠️  Hết slot trống cho "${mc.movie.title}" tại rạp #${cinemaId} ngày ${date}`, 'WARN');
    }
    return cinemasCovered;
  }

  /** Số suất của 1 phim trong 1 ngày đã xếp ở lần chạy này (thật hoặc mô phỏng). */
  _countOnDate(movieId, date) {
    let n = 0;
    n += this._suatCuaPhim(movieId, date).length;
    return n;
  }

  /**
   * "Sàn" của nhóm banner trong ngày = số suất của phim banner ÍT suất nhất.
   * Phim thường không được vượt mức này, ở cả vòng 2 lẫn vòng 3 — đó là cách
   * bảo đảm "5 phim banner luôn được ưu tiên". Trước đây Moana 2 (không phải
   * banner, nhưng ngắn nhất — 100 phút — nên lọt được mọi khe trống) có 43
   * suất/tuần trong khi banner Spider-Man chỉ có 7. Ngày không có banner nào
   * chiếu thì không giới hạn.
   */
  _featuredFloor(date, configs) {
    const featured = configs.filter((mc) => mc.movie.is_featured);
    if (!featured.length) return Infinity;
    return Math.min(...featured.map((mc) => this._countOnDate(mc.movie.id, date)));
  }

  /**
   * Chèn ĐÚNG 1 suất cho phim vào khung giờ tốt nhất còn trống. Rạp đang có ÍT
   * suất của phim này nhất trong ngày được thử trước, để suất thêm trải đều cả
   * 3 rạp thay vì dồn vào rạp đầu danh sách; trong cùng rạp vẫn giữ thứ tự
   * phòng ưu tiên theo hạng phim (filterRoomsByPopularity). Slot của mỗi phòng
   * tính RIÊNG (lệch giờ theo rạp, đa dạng theo cuối tuần).
   * @returns {Promise<boolean>} true nếu đã chèn được
   */
  // [RB-M8] Trải đều suất thêm qua các rạp
  async _placeOne(mc, date) {
    const perCinema = new Map();
    for (const p of this._suatCuaPhim(mc.movie.id, date)) {
      perCinema.set(p.cinema_id, (perCinema.get(p.cinema_id) || 0) + 1);
    }
    const rooms = [...mc.suitableRooms].sort(
      (a, b) => (perCinema.get(a.cinema_id) || 0) - (perCinema.get(b.cinema_id) || 0),
    );
    for (const room of rooms) {
      if (this._roomCapacityRemaining(room, date, mc.duration) <= 0) continue;
      for (const timeSlot of this._buildPrioritizedSlots(mc.duration, date, room.cinema_id)) {
        if (await this.checkRoomConflict(room.room_id, date, timeSlot, mc.duration, room.cinema_id)) continue;
        if (await this._doInsert(mc.movie, room, date, timeSlot)) return true;
      }
    }
    return false;
  }

  /**
   * VÒNG 2 — chia suất THÊM theo lượt (round-robin): mỗi lượt, mỗi phim còn
   * thiếu chỉ tiêu được thêm ĐÚNG 1 suất, lặp tới khi đủ chỉ tiêu hoặc hết
   * chỗ. Nhóm banner (theo thứ tự banner) được chia xong TRƯỚC, rồi mới tới
   * phim thường (theo điểm phổ biến), và phim thường bị chặn ở "sàn" banner.
   *
   * Trước đây mỗi phim lấy trọn chỉ tiêu trên TỪNG phòng rồi mới tới phim
   * sau ("ai trước lấy hết"): banner #1 Joker 44 suất/tuần, tới banner #5
   * Spider-Man thì các phòng đã chạm trần, chỉ còn 7 suất bắt buộc.
   */
  async _allocateBonus(date, configs) {
    const featured = configs.filter((mc) => mc.movie.is_featured);
    const regular = configs.filter((mc) => !mc.movie.is_featured);

    for (const group of [featured, regular]) {
      const need = new Map(group.map((mc) => [
        mc, Math.max(0, this._targetForDate(mc, date) - this._countOnDate(mc.movie.id, date)),
      ]));
      let placedAny = true;
      while (placedAny) {
        placedAny = false;
        const floor = group === regular ? this._featuredFloor(date, configs) : Infinity;
        for (const mc of group) {
          if (need.get(mc) <= 0) continue;
          if (this._countOnDate(mc.movie.id, date) >= floor) continue; // không vượt banner
          if (await this._placeOne(mc, date)) {
            need.set(mc, need.get(mc) - 1);
            placedAny = true;
          } else {
            // Hết chỗ cho phim này trong ngày — giới hạn công suất, không phải lỗi.
            this.capacityLimitedCount += need.get(mc);
            need.set(mc, 0);
          }
        }
      }
    }
  }

  /** true nếu dateStr rơi vào ngày cuối tuần theo config.WEEKEND_DAYS */
  _isWeekend(dateStr) {
    return this.config.WEEKEND_DAYS.includes(parseLocalDateString(dateStr).getDay());
  }

  /**
   * Số suất còn được phép chèn thêm vào 1 phòng trong 1 ngày trước khi chạm
   * trần lấp đầy theo ngày thường/cuối tuần (ROOM_FILL_MAX_FRACTION) — dùng
   * chung cho vòng 2 (suất thêm theo độ phổ biến) và vòng 3 (lấp lỗ hổng) để
   * cả 2 vòng cùng tôn trọng đúng 1 trần, không riêng gì gap-fill (xem giải
   * thích đầy đủ ở ROOM_FILL_MAX_FRACTION trong scheduler.config.js).
   * KHÔNG áp dụng cho vòng 1 (baseline) — mọi phim đều phải có tối thiểu 1
   * suất/rạp/ngày bất kể ngày thường hay cuối tuần.
   */
  // [RB-C6] Trần lấp phòng: ngày thường 30%, cuối tuần 100% số khung giờ
  _roomCapacityRemaining(room, date, duration) {
    const chronological = this._buildChronologicalSlots(duration, date, room.cinema_id);
    const fraction = this._isWeekend(date)
      ? this.config.ROOM_FILL_MAX_FRACTION.weekend
      : this.config.ROOM_FILL_MAX_FRACTION.weekday;
    const cap = Math.round(chronological.length * fraction);
    const already = this._suatCuaPhong(room.room_id, date).length;
    return Math.max(0, cap - already);
  }

  /** Số suất/phòng mục tiêu cho 1 ngày cụ thể — cuối tuần nhân thêm hệ số vì
   * nhu cầu cao hơn ngày thường (xem WEEKEND_SHOWTIME_MULTIPLIER). */
  // [RB-M4] Cuối tuần nhiều suất hơn
  _targetForDate(mc, date) {
    if (!this._isWeekend(date)) return mc.perRoom;
    // ceil (không phải round) để LUÔN đảm bảo tăng ít nhất +1 suất/phòng vào
    // cuối tuần — trước đây dùng round() khiến các phim tier thấp (perRoom=1,
    // rất phổ biến khi có nhiều phim cùng chiếu và phòng bị chia nhỏ theo
    // tier) tính ra round(1×1.3)=1, tức KHÔNG tăng gì cả cuối tuần. Với gần
    // 20 phim NOW_SHOWING cạnh tranh chỉ 10 phòng, phần lớn phim rơi vào tier
    // thấp này, nên hệ số cuối tuần gần như vô hiệu trên tổng thể dù công
    // thức tính đúng cho từng phim riêng lẻ.
    return Math.max(mc.perRoom + 1, Math.ceil(mc.perRoom * this.config.WEEKEND_SHOWTIME_MULTIPLIER));
  }

  /** Độ lệch giờ (phút) theo rạp — mỗi rạp lệch nhau vài chục phút để không
   * bao giờ 2 rạp khác nhau chiếu đúng cùng 1 khung giờ mỗi ngày (giống thực
   * tế CGV/Lotte/Galaxy không bao giờ đồng bộ giờ chiếu với nhau). */
  // [RB-M7] Các rạp lệch giờ nhau 0/10/20 phút
  getCinemaOffsetMinutes(cinemaId) {
    const variants = this.config.CINEMA_TIME_OFFSET_VARIANTS || 1;
    const step = this.config.CINEMA_TIME_OFFSET_STEP_MINUTES || 0;
    return (Number(cinemaId) % variants) * step;
  }

  /**
   * Xây lưới khung giờ mở cửa của 1 phòng cho 1 ngày cụ thể, đã áp dụng độ
   * lệch giờ theo rạp + mở rộng khung giờ cuối tuần, rồi phân nhóm theo mức độ
   * ưu tiên (prime/medium/low). Trả về nhóm CHƯA xáo trộn để dùng lại cho cả
   * _buildPrioritizedSlots (ưu tiên giờ vàng) và _buildChronologicalSlots (quét
   * theo thứ tự thời gian, dùng cho lấp lỗ hổng).
   */
  /** Giờ mở/đóng cửa (phút trong ngày) của 1 rạp cho 1 ngày cụ thể — áp dụng
   * độ lệch giờ theo rạp + mở rộng khung giờ cuối tuần. Tách riêng khỏi
   * _timeGrid để checkRoomConflict cũng dùng lại đúng công thức này khi kiểm
   * tra giờ đóng cửa, tránh 2 nơi tính ra 2 kết quả khác nhau. */
  _openCloseMinutes(dateStr, cinemaId) {
    const offsetMin = this.getCinemaOffsetMinutes(cinemaId);
    const isWeekend = dateStr ? this._isWeekend(dateStr) : false;
    const openMin = OPENING_HOUR * 60 - (isWeekend ? this.config.WEEKEND_EXTRA_OPEN_MINUTES : 0) + offsetMin;
    // Mốc KẾT THÚC không nới theo cuối tuần: 01:00 là muộn nhất, cuối tuần chỉ
    // được mở suất muộn hơn (lastStartMin) chứ không kéo dài giờ đóng cửa.
    const closeMin = CLOSING_HOUR * 60 + offsetMin;
    // Giờ mở suất CUỐI theo mặt bằng rạp Việt Nam: ngày thường ~22:30, cuối
    // tuần ~23:15 (cộng thêm độ lệch 0–20 phút giữa các rạp).
    const lechSuatCuoi = this.config.OPERATING_HOURS.LAST_START_OFFSET_MINUTES;
    const lastStartMin = LAST_START_HOUR * 60 + (isWeekend ? lechSuatCuoi.weekend : lechSuatCuoi.weekday) + offsetMin;
    return { openMin, closeMin, lastStartMin };
  }

  _timeGrid(duration, dateStr, cinemaId) {
    const { openMin, closeMin, lastStartMin } = this._openCloseMinutes(dateStr, cinemaId);
    const step = 30;
    // Nếu dateStr là HÔM NAY, không được sinh suất ở giờ ĐÃ QUA — trước đây
    // chỉ boostMovie() tự lọc việc này, còn vòng tạo lịch tuần chính
    // (generateWeeklyShowtimes) thì không, nên nếu admin chạy tạo lịch cho
    // TUẦN NÀY (weekStart = hôm nay), thuật toán vẫn vô tư sinh suất chiếu ở
    // các khung giờ sáng đã trôi qua — dữ liệu vô nghĩa (suất chiếu "trong
    // quá khứ" nhưng vẫn hiện "còn chỗ" cho tới khi có cơ chế dọn riêng).
    const minStart = dateStr === formatLocalDateString(new Date())
      ? (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })()
      : -Infinity;

    const primeSlots = [], mediumSlots = [], lowSlots = [];
    for (let start = openMin; start + duration <= closeMin && start <= lastStartMin; start += step) {
      // [RB-C3] Không xếp suất vào giờ đã qua
      if (start <= minStart) continue;
      const h  = Math.floor(start / 60);
      const mm = start % 60;
      const t  = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const band = this.config.TIME_BANDS;
      if (h >= band.PRIME_FROM_HOUR && h < band.PRIME_TO_HOUR) primeSlots.push({ t, start });
      else if (h >= band.MEDIUM_FROM_HOUR)                     mediumSlots.push({ t, start });
      else                     lowSlots.push({ t, start });
    }

    const byTime = (a, b) => a.start - b.start;
    primeSlots.sort(byTime);
    mediumSlots.sort(byTime);
    lowSlots.sort(byTime);
    return { primeSlots, mediumSlots, lowSlots };
  }

  /**
   * Điểm ưu tiên MẶC ĐỊNH theo giờ trong ngày khi CHƯA đủ dữ liệu vé thật để
   * tin cậy (cold start) — mô phỏng đường cong nhu cầu rạp chiếu phim thực tế
   * (cao điểm tối 19-21h, thấp dần về sáng sớm/khuya). Đây là suy luận CÓ CĂN
   * CỨ (không phải đoán ngẫu nhiên), dùng làm nền tới khi có đủ vé bán thật.
   */
  _staticHourPrior(hour) {
    const PRIOR_BY_HOUR = {
      8: 2, 9: 3, 10: 4, 11: 4, 12: 3, 13: 4, 14: 5, 15: 6, 16: 6, 17: 6,
      18: 7, 19: 9, 20: 10, 21: 9, 22: 6, 23: 3,
    };
    return PRIOR_BY_HOUR[hour] ?? 1;
  }

  /**
   * Thống kê SỐ VÉ ĐÃ BÁN THẬT theo (thứ trong tuần, giờ chiếu) — nguồn dữ
   * liệu THẬT để xếp hạng khung giờ theo từng ngày trong tuần (vd tối Thứ 6
   * thường bán chạy giờ khác với chiều Thứ 3), thay vì suy đoán/random. Cache
   * lại trong phạm vi 1 lần chạy generateWeeklyShowtimes/boostMovie — đây là
   * dữ liệu lịch sử toàn hệ thống, không đổi trong lúc đang tạo lịch.
   */
  async _getSlotDemandProfile() {
    const [rows] = await pool.query(`
      SELECT DAYOFWEEK(s.show_date) AS dow_mysql, HOUR(s.show_time) AS hour, COUNT(t.id) AS ticket_count
      FROM tickets t
      JOIN showtimes s ON t.showtime_id = s.id
      WHERE t.booking_status = 'confirmed'
      GROUP BY dow_mysql, hour
    `);
    const profile = {}; // profile[jsDow][hour] = số vé đã bán thật
    for (const r of rows) {
      const jsDow = r.dow_mysql - 1; // MySQL DAYOFWEEK: 1=CN..7=T7 -> JS Date.getDay(): 0=CN..6=T7
      if (!profile[jsDow]) profile[jsDow] = {};
      profile[jsDow][r.hour] = r.ticket_count;
    }
    return profile;
  }

  /** Điểm xếp hạng 1 giờ cụ thể cho 1 thứ trong tuần cụ thể — vé thật (nhân
   * hệ số lớn để luôn thắng khi đã có đủ dữ liệu) cộng với prior mặc định làm
   * nền/phá vỡ hoà (khi vé thật = 0, ví dụ phim/khung giờ mới, hoặc hệ thống
   * còn ít dữ liệu). */
  _slotDemandScore(dow, hour) {
    const realTickets = this._slotDemandProfile?.[dow]?.[hour] || 0;
    return realTickets * 10 + this._staticHourPrior(hour);
  }

  /**
   * Danh sách slot ưu tiên cho phòng chiếu: giờ vàng (prime) trước, rồi trung
   * bình (medium), rồi thấp điểm (low). Thứ tự TRONG mỗi nhóm được xếp theo
   * ĐIỂM NHU CẦU THẬT (_slotDemandScore) của ĐÚNG thứ-trong-tuần đang xét —
   * không dùng random để giả vờ đa dạng, mà để lịch mỗi ngày trong tuần khác
   * nhau ĐÚNG theo thống kê vé bán thật của từng thứ đó (thứ 6/7/CN có xu
   * hướng khác thứ 2-5 chẳng hạn), và ngày càng chính xác hơn khi có thêm vé.
   */
  // [RB-M5] Thử khung giờ theo nhu cầu vé thật
  _buildPrioritizedSlots(duration, dateStr, cinemaId) {
    const { primeSlots, mediumSlots, lowSlots } = this._timeGrid(duration, dateStr, cinemaId);
    const dow = dateStr ? parseLocalDateString(dateStr).getDay() : null;
    const byDemandDesc = (a, b) => {
      const hourA = Math.floor(a.start / 60) % 24;
      const hourB = Math.floor(b.start / 60) % 24;
      return this._slotDemandScore(dow, hourB) - this._slotDemandScore(dow, hourA);
    };
    return [
      ...[...primeSlots].sort(byDemandDesc).map(s => s.t),
      ...[...mediumSlots].sort(byDemandDesc).map(s => s.t),
      ...[...lowSlots].sort(byDemandDesc).map(s => s.t),
    ];
  }

  /** Giống _buildPrioritizedSlots nhưng giữ THỨ TỰ THỜI GIAN (không ưu tiên
   * giờ vàng) — dùng để quét lần lượt từ sáng tới tối khi lấp lỗ hổng giờ trống. */
  _buildChronologicalSlots(duration, dateStr, cinemaId) {
    const { primeSlots, mediumSlots, lowSlots } = this._timeGrid(duration, dateStr, cinemaId);
    return [...primeSlots, ...mediumSlots, ...lowSlots]
      .sort((a, b) => a.start - b.start)
      .map(s => s.t);
  }

  /**
   * VÒNG 3: lấp lỗ hổng giờ trống còn lại trong mỗi phòng sau khi đã phân bổ
   * theo phim (vòng 1-2) — rạp thật hiếm khi để phòng trống nhiều giờ liền
   * giữa 2 suất (vd 9h xong, suất kế tiếp tận 15h). Quét từng phòng theo thứ
   * tự thời gian trong ngày, hễ còn slot trống thì chèn thêm 1 suất của phim
   * PHÙ HỢP phòng đó (đã lọc theo loại phòng ở _buildMovieConfig), ưu tiên
   * phim phổ biến hơn nhưng xoay vòng qua nhiều phim để tránh 1 phim độc
   * chiếm cả phòng — giới hạn số lần lặp/phim/phòng/ngày qua
   * MAX_REPEATS_PER_MOVIE_PER_ROOM_PER_DAY, và giới hạn TỔNG số khung giờ
   * được lấp/phòng/ngày qua ROOM_FILL_MAX_FRACTION (ngày thường lấp ít hơn
   * cuối tuần — xem giải thích ở scheduler.config.js và _roomCapacityRemaining).
   */
  async _fillRoomGaps(date, movieConfigs) {
    const roomToConfigs = new Map(); // room_id -> { room, configs: [mc,...] }
    for (const mc of movieConfigs) {
      for (const room of mc.suitableRooms) {
        if (!roomToConfigs.has(room.room_id)) roomToConfigs.set(room.room_id, { room, configs: [] });
        roomToConfigs.get(room.room_id).configs.push(mc);
      }
    }

    for (const { room, configs } of roomToConfigs.values()) {
      if (!configs.length) continue;
      const minDuration = Math.min(...configs.map((c) => c.duration)) || 90;
      const chronological = this._buildChronologicalSlots(minDuration, date, room.cinema_id);
      const repeatCount = new Map(); // movie.id -> số lần đã lặp trong phòng/ngày này
      // Trần lấp đầy dùng chung với vòng 2 — tính trên TỔNG cả ngày (kể cả
      // suất đã có từ vòng 1-2), không phải chỉ riêng phần gap-fill thêm vào,
      // để ngày thường thật sự "thưa" hơn cuối tuần.
      let capRemaining = this._roomCapacityRemaining(room, date, minDuration);

      for (const timeSlot of chronological) {
        if (capRemaining <= 0) break;
        // Mỗi khe trống ưu tiên phim đang có ÍT suất nhất trong ngày (hoà thì
        // phim banner trước, rồi tới điểm phổ biến), và phim thường không được
        // vượt "sàn" banner. Trước đây khe trống xoay vòng theo điểm phổ biến
        // nên phim NGẮN NHẤT (Moana 2, 100 phút) lọt vào mọi khe mà phim dài
        // không vừa, gom tới 43 suất/tuần — nhiều hơn cả phim banner.
        const counts = this.idxNgay.get(date) || new Map();
        const countOf = (mc) => counts.get(mc.movie.id) || 0;
        const featuredCounts = movieConfigs.filter((mc) => mc.movie.is_featured).map(countOf);
        const floor = featuredCounts.length ? Math.min(...featuredCounts) : Infinity;
        const candidates = [...configs].sort((a, b) =>
          countOf(a) - countOf(b)
          || Number(b.movie.is_featured) - Number(a.movie.is_featured)
          || b.movie.popularity_score - a.movie.popularity_score);

        for (const mc of candidates) {
          const used = repeatCount.get(mc.movie.id) || 0;
          // [RB-C5] Tối đa 3 suất/phim/phòng/ngày ở vòng lấp giờ trống
          if (used >= this.config.MAX_REPEATS_PER_MOVIE_PER_ROOM_PER_DAY) continue;
          // [RB-M2] Phim thường không vượt phim banner
          if (!mc.movie.is_featured && countOf(mc) >= floor) continue;
          if (await this.checkRoomConflict(room.room_id, date, timeSlot, mc.duration, room.cinema_id)) continue;
          if (!(await this._doInsert(mc.movie, room, date, timeSlot))) continue;
          repeatCount.set(mc.movie.id, used + 1);
          capRemaining--;
          break;
        }
      }
    }
  }

  /** Số suất chiếu tối đa có thể nhét vào 1 phòng trong 1 ngày */
  _maxSlotsPerDay(duration) {
    const totalMin = (CLOSING_HOUR - OPENING_HOUR) * 60;
    const gapMin   = duration + this.config.MIN_BUFFER_MINUTES;
    return Math.max(1, Math.floor(totalMin / gapMin));
  }

  /** @deprecated Dùng _buildPrioritizedSlots thay thế */
  _selectEvenly(arr, n) {
    if (n <= 0 || arr.length === 0) return [];
    if (n >= arr.length) return [...arr];
    const step = arr.length / n;
    const result = [];
    for (let i = 0; i < n; i++) result.push(arr[Math.floor(i * step)]);
    return result;
  }

  async _doInsert(movie, room, date, timeSlot) {
    const record = {
      movie_id: movie.id,
      movie_title: movie.title,
      cinema_id: room.cinema_id,
      room_id: room.room_id,
      room_name: room.room_name,
      room_type: room.room_type,
      cinema_name: room.cinema_name,
      duration: movie.duration || 120,
      show_date: date,
      show_time: timeSlot,
      price: this.calculatePrice(timeSlot, room.room_type, date),
      available_seats: room.total_seats,
      total_seats: room.total_seats,
    };
    // Trả về true/false để nơi gọi (_placeOne) biết suất đã thật sự vào lịch
    // hay chưa — nếu bị bỏ qua thì còn thử khung giờ khác.
    try {
      // Dry-run (xem trước): không ghi DB, chỉ mô phỏng — nhưng vẫn được tính vào
      // pendingInserts để checkRoomConflict() chặn trùng slot trong CHÍNH lần chạy này.
      if (!this.dryRun) {
        const insertedId = await this.insertShowtime(record);
        if (!insertedId) return false; // trùng lặp thật trong DB, insertShowtime đã đếm vào skippedCount
        // Lưu lại ID thật vừa ghi — trước đây không lưu, nên frontend không
        // có cách nào xoá/sửa MỘT suất chiếu cụ thể vừa tạo mà không xoá cả
        // tuần rồi tạo lại toàn bộ.
        record.id = insertedId;
      }
      this.pendingInserts.push(record);
      this._themVaoChiMuc(record);
      this.generatedCount++;
      return true;
    } catch (e) {
      this.errors.push({ movie: movie.title, date, time: timeSlot, error: e.message });
      return false;
    }
  }

  // ═══════════════════════════════════════════════
  // DATABASE HELPERS
  // ═══════════════════════════════════════════════

  async fetchAvailableRooms() {
    const connection = await pool.getConnection();
    try {
      const [rooms] = await connection.query(`
        SELECT r.id AS room_id, r.cinema_id, r.room_name, r.total_seats, r.room_type, r.features,
               c.name AS cinema_name, c.location
        FROM rooms r JOIN cinemas c ON r.cinema_id = c.id
        WHERE r.is_active = TRUE
        ORDER BY r.total_seats DESC
      `);
      return rooms.map(r => ({ ...r, features: r.features ? JSON.parse(r.features) : [] }));
    } finally { connection.release(); }
  }

  /**
   * @param {number} [excludeShowtimeId] - bỏ qua suất này khi dò trùng. Dùng khi
   *   THAY phim của một suất có sẵn: chính suất đó sắp đổi phim nên không được
   *   tính là "đang chiếm phòng", nhưng các suất trước/sau nó vẫn phải được kiểm.
   */
  async checkRoomConflict(roomId, date, time, movieDuration, cinemaId, excludeShowtimeId = null) {
    const [h, m] = time.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin   = startMin + movieDuration + this.config.MIN_BUFFER_MINUTES;

    // Phim phải chiếu XONG trước giờ đóng cửa (không tính buffer dọn phòng —
    // đó là khoảng nghỉ SAU khi phim đã chiếu xong, không phải hạn chót chiếu
    // xong). Quan trọng cho _fillRoomGaps: danh sách slot ở đó được dựng theo
    // duration của phim NGẮN NHẤT trong phòng để dò được nhiều khung giờ hơn,
    // nên 1 slot hợp lệ với phim ngắn có thể KHÔNG hợp lệ với phim dài hơn nếu
    // không kiểm tra lại đúng giờ đóng cửa ở đây — nếu chỉ dựa vào việc không
    // trùng suất khác thì phim dài vẫn có thể bị chèn sát giờ đóng cửa, kết
    // thúc sau nửa đêm.
    if (cinemaId != null) {
      const { closeMin, lastStartMin } = this._openCloseMinutes(date, cinemaId);
      // [RB-C2] Giờ hoạt động: chiếu xong trước giờ đóng cửa, bắt đầu trước giờ suất cuối
      if (startMin + movieDuration > closeMin || startMin > lastStartMin) return true;
    }

    // Chặn trùng với các suất đã chèn (thật hoặc mô phỏng) trong CHÍNH lần chạy này.
    // Bắt buộc cho dry-run vì những suất đó chưa từng ghi DB nên query dưới không thấy được.
    // [RB-C1] Không trùng phòng — kể cả với suất vừa xếp trong chính lần chạy này
    const hasPendingConflict = this._suatCuaPhong(roomId, date).some((p) => {
      if (excludeShowtimeId != null && p.id === excludeShowtimeId) return false;
      const [ph, pm] = p.show_time.split(':').map(Number);
      const pStart = ph * 60 + pm;
      const pEnd = pStart + p.duration + this.config.MIN_BUFFER_MINUTES;
      return pStart < endMin && pEnd > startMin;
    });
    if (hasPendingConflict) return true;

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(`
        SELECT s.id FROM showtimes s JOIN movies mv ON s.movie_id = mv.id
        WHERE s.room_id = ? AND s.show_date = ?
          AND TIME_TO_SEC(s.show_time)/60 < ?
          AND (TIME_TO_SEC(s.show_time)/60 + mv.duration + ?) > ?
          AND s.id <> ?
      `, [roomId, date, endMin, this.config.MIN_BUFFER_MINUTES, startMin, excludeShowtimeId ?? 0]);

      return rows.length > 0;
    } finally { connection.release(); }
  }

  /** @returns {number|false} id thật vừa ghi (insertId) nếu thành công, false nếu bị bỏ qua vì trùng lặp */
  async insertShowtime(data) {
    const connection = await pool.getConnection();
    try {
      // Kiểm tra trùng lặp — khoá phải TRÙNG với ràng buộc uq_showtimes_room_slot
      // (room_id, show_date, show_time), KHÔNG kèm movie_id: một phòng chỉ có
      // thể bắt đầu đúng 1 suất tại 1 thời điểm, bất kể đó là phim nào. Nếu
      // pre-check còn lọc theo movie_id thì một phim KHÁC ở cùng khung giờ sẽ
      // lọt qua đây rồi mới bị DB từ chối — bị đếm là "lỗi" thay vì "bỏ qua".
      const [ex] = await connection.query(
        'SELECT id FROM showtimes WHERE room_id=? AND show_date=? AND show_time=?',
        [data.room_id, data.show_date, data.show_time]
      );
      if (ex.length) { this.skippedCount++; return false; }

      const [result] = await connection.query(`
        INSERT INTO showtimes (movie_id, cinema_id, room_id, show_date, show_time, price, available_seats, total_seats, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [data.movie_id, data.cinema_id, data.room_id, data.show_date, data.show_time,
          data.price, data.available_seats, data.total_seats]);
      return result.insertId;
    } finally { connection.release(); }
  }

  // ═══════════════════════════════════════════════
  // ĐÔN SUẤT CHIẾU CHO PHIM ĐANG LÊN TREND (thao tác thủ công của admin)
  // Chỉ TÍNH TOÁN GỢI Ý ở đây — admin tự xem số liệu (vé 3 ngày gần nhất tăng
  // bao nhiêu so với 3 ngày trước đó) rồi quyết định phim nào cần thêm suất,
  // hệ thống không tự động chèn suất chiếu nào nếu admin không bấm áp dụng.
  // ═══════════════════════════════════════════════

  /**
   * Gợi ý phim cần đôn thêm suất, dựa trên HAI tín hiệu độc lập — phim chỉ
   * cần đạt MỘT trong hai:
   *
   *   1. ĐÀ TĂNG (chỉ phim mới ra rạp ≤ MAX_RELEASE_AGE_DAYS): vé N ngày gần
   *      nhất tăng mạnh so với N ngày liền trước. Bắt được cơn sốt ĐANG HÌNH
   *      THÀNH, trước khi suất chiếu kịp kín.
   *
   *   2. LẤP ĐẦY (mọi phim đang chiếu, KHÔNG giới hạn tuổi): suất chiếu thật
   *      sự đang kín ghế. Đây là thước đo rạp thật dùng, và nó bắt được các
   *      trường hợp tín hiệu 1 bỏ sót: phim cũ chiếu lại mà hot, phim nổi lên
   *      muộn nhờ truyền miệng, phim hot đều (đà tăng ≈ 1 dù suất nào cũng kín).
   *
   * Số suất gợi ý = số lớn hơn giữa hai tín hiệu, không cộng dồn — hai tín
   * hiệu cùng đo MỘT nhu cầu, cộng lại là đếm hai lần.
   *
   * @param {number} windowDays - Số ngày của cửa sổ so sánh (1, 2 hoặc 3).
   *   Độ "hot" của phim thay đổi rất nhanh nên cửa sổ ngắn phản ứng nhạy hơn
   *   (1 ngày = bắt sóng ngay hôm nay), cửa sổ dài thì ổn định hơn, ít nhiễu.
   *   Luôn so N ngày gần nhất với N ngày liền trước đó.
   */
  async getTrendingSuggestions(windowDays = null) {
    const cfg = this.config.TREND_BOOST;
    // Chỉ nhận 1/2/3 — ngoài khoảng này thì dùng mặc định trong config
    const N = [1, 2, 3].includes(Number(windowDays)) ? Number(windowDays) : cfg.LOOKBACK_RECENT_DAYS;

    // Ngưỡng số vé tối thiểu PHẢI co giãn theo độ dài cửa sổ. Ngưỡng gốc (3 vé)
    // được đặt cho cửa sổ 3 ngày, tức "1 vé/ngày". Giữ nguyên 3 vé cho cửa sổ
    // 1 ngày là đòi hỏi gấp 3 lần mật độ — hầu như không phim nào đạt, mục
    // "đang lên trend" sẽ luôn trống và người dùng tưởng hỏng.
    const minTickets = Math.max(1, Math.round((cfg.MIN_RECENT_TICKETS * N) / cfg.LOOKBACK_RECENT_DAYS));

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(`
        SELECT
          m.id, m.title, m.duration, m.status,
          DATEDIFF(CURDATE(), m.release_date) AS release_age_days,
          COALESCE((
            SELECT COUNT(t.id) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
            WHERE s.movie_id = m.id AND t.booking_status = 'confirmed'
              AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          ), 0) AS recent_tickets,
          COALESCE((
            SELECT COUNT(t.id) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
            WHERE s.movie_id = m.id AND t.booking_status = 'confirmed'
              AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
              AND t.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
          ), 0) AS prior_tickets,
          COALESCE((
            SELECT COUNT(*) FROM showtimes s2
            WHERE s2.movie_id = m.id AND s2.show_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 6 DAY)
          ), 0) AS current_week_showtimes
        FROM movies m
        WHERE m.status = 'NOW_SHOWING'
      `, [
        N,          // cửa sổ "gần nhất": N ngày qua
        N * 2, N,   // cửa sổ "trước đó": N ngày liền kề trước cửa sổ trên
      ]);
      // Không lọc tuổi phim trong SQL nữa — giới hạn 21 ngày chỉ áp cho tín
      // hiệu đà tăng (xét ở dưới), tín hiệu lấp đầy cần thấy mọi phim.

      // Ghế đã bán của từng suất trong cửa sổ: từ N ngày trước tới hết ngày
      // (hôm nay + N). Gồm cả suất SẮP chiếu, vì suất sắp chiếu đã bán gần
      // kín là tín hiệu mạnh nhất — khách đang bị từ chối ngay lúc này.
      // Chỉ đếm vé ĐÃ THANH TOÁN: vé đang chờ trả tiền có thể bị nhả sau 20
      // phút, tính vào thì một người giữ ghế rồi bỏ đi cũng tạo "nhu cầu" giả.
      const [suat] = await connection.query(`
        SELECT
          s.movie_id, s.total_seats,
          TIMESTAMP(s.show_date, s.show_time) <= NOW() AS da_chieu,
          (
            SELECT COUNT(*) FROM ticket_seats ts JOIN tickets t ON t.id = ts.ticket_id
            WHERE ts.showtime_id = s.id AND ts.status = 'confirmed'
              AND t.booking_status = 'confirmed' AND t.payment_status = 'paid'
          ) AS da_ban
        FROM showtimes s JOIN movies m ON m.id = s.movie_id
        WHERE m.status = 'NOW_SHOWING' AND s.total_seats > 0
          AND TIMESTAMP(s.show_date, s.show_time) >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND s.show_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      `, [N, N]);

      const occ = cfg.OCCUPANCY;
      const lapDay = new Map(); // movie_id -> số liệu lấp đầy
      for (const s of suat) {
        const d = lapDay.get(s.movie_id) || { ganKin: 0, daChieu: 0, gheDaChieu: 0, banDaChieu: 0 };
        const tiLe = Number(s.da_ban) / Number(s.total_seats);
        if (tiLe >= occ.NEAR_FULL_RATIO) d.ganKin++;
        if (Number(s.da_chieu) === 1) {
          d.daChieu++;
          d.gheDaChieu += Number(s.total_seats);
          d.banDaChieu += Number(s.da_ban);
        }
        lapDay.set(s.movie_id, d);
      }

      const capToiDa = (n) => Math.min(cfg.MAX_SUGGESTED_ADDITIONAL, Math.max(1, n));

      return rows
        .map((r) => {
          // ── Tín hiệu 1: đà tăng (chỉ phim mới) ──
          const laPhimMoi = r.release_age_days >= 0 && r.release_age_days <= cfg.MAX_RELEASE_AGE_DAYS;
          const momentum = r.recent_tickets / Math.max(r.prior_tickets, 1);
          const goiYDaTang = (laPhimMoi && r.recent_tickets >= minTickets && momentum >= cfg.MOMENTUM_THRESHOLD)
            ? capToiDa(Math.round((momentum - 1) * 4))
            : 0;

          // ── Tín hiệu 2: lấp đầy (mọi phim) ──
          const d = lapDay.get(r.id) || { ganKin: 0, daChieu: 0, gheDaChieu: 0, banDaChieu: 0 };
          const tbLapDay = d.gheDaChieu > 0 ? d.banDaChieu / d.gheDaChieu : 0;
          // Mỗi suất gần kín ≈ một suất khách phải bỏ đi → thêm một suất.
          const goiYGanKin = d.ganKin >= occ.MIN_NEAR_FULL_SHOWTIMES ? capToiDa(d.ganKin) : 0;
          // Trung bình quá cao → thêm suất tới khi lấp đầy dự kiến về mức mục
          // tiêu, giả định nhu cầu giữ nguyên: suất_cần = suất_hiện_có × (TB ÷ mục tiêu).
          const goiYTrungBinh = (d.daChieu >= occ.MIN_FINISHED_SHOWTIMES && tbLapDay >= occ.AVG_THRESHOLD)
            ? capToiDa(Math.ceil(Math.max(r.current_week_showtimes, 1) * (tbLapDay / occ.TARGET_RATIO - 1)))
            : 0;
          const goiYLapDay = Math.max(goiYGanKin, goiYTrungBinh);

          const suggested = Math.max(goiYDaTang, goiYLapDay);
          const reasons = [];
          if (goiYDaTang > 0) reasons.push('momentum');
          if (goiYGanKin > 0) reasons.push('near_full');
          if (goiYTrungBinh > 0) reasons.push('high_occupancy');

          return {
            id: r.id,
            title: r.title,
            release_age_days: r.release_age_days,
            recent_tickets: r.recent_tickets,
            prior_tickets: r.prior_tickets,
            momentum: Math.round(momentum * 100) / 100,
            current_week_showtimes: r.current_week_showtimes,
            near_full_showtimes: d.ganKin,
            finished_showtimes: d.daChieu,
            avg_occupancy: Math.round(tbLapDay * 1000) / 1000,
            trend_reasons: reasons,
            is_trending: suggested > 0,
            suggested_additional_showtimes: suggested,
          };
        })
        .filter((m) => m.recent_tickets > 0 || m.near_full_showtimes > 0 || m.avg_occupancy > 0)
        .sort((a, b) =>
          b.suggested_additional_showtimes - a.suggested_additional_showtimes || b.momentum - a.momentum)
        .map((m) => ({ ...m, window_days: N, min_tickets_required: minTickets }));
    } finally { connection.release(); }
  }

  /**
   * Lấy đúng dữ liệu thật (vé/rating/yêu thích) của 1 phim — cùng công thức
   * fallback đã dùng trong fetchEligibleMovies (COALESCE + NULLIF cho
   * rating_count, xem giải thích ở đó), tách riêng thành helper để boostMovie
   * dùng lại được thay vì tự chấm điểm với dữ liệu giả định bằng 0.
   */
  async _fetchMovieStats(movieId) {
    const [[stats]] = await pool.query(`
      SELECT
        COALESCE((SELECT AVG(rating) FROM movie_ratings WHERE movie_id = ?), m.average_rating, 0) AS average_rating,
        COALESCE(NULLIF((SELECT COUNT(*) FROM movie_ratings WHERE movie_id = ?), 0), m.rating_count, 0) AS rating_count,
        COALESCE((
          SELECT COUNT(t.id) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
          WHERE s.movie_id = ? AND t.booking_status = 'confirmed'
        ), 0) AS ticket_count,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE movie_id = ?), 0) AS favorite_count
      FROM movies m WHERE m.id = ?
    `, [movieId, movieId, movieId, movieId, movieId]);
    return stats;
  }

  /**
   * Thêm THÊM `additionalShowtimes` suất chiếu cho 1 phim vào các ngày còn
   * lại của 7 ngày tới (tính từ hôm nay) — dùng đúng cơ chế phân bổ phòng và
   * chống trùng đã có (checkRoomConflict).
   *
   * Hai bước, giống cách rạp thật xử lý:
   *   1. Chèn vào giờ TRỐNG của phòng (không đụng suất nào có sẵn).
   *   2. Còn thiếu (phòng đã kín giờ) → THAY suất của phim ế: xem
   *      _timSuatCoTheThay() cho các điều kiện bảo vệ khách và phim khác.
   *
   * @param {boolean} [xemTruoc=false] - chỉ tính kế hoạch, KHÔNG ghi gì vào
   *   CSDL, để admin thấy trước suất sẽ nằm ở đâu, mấy giờ rồi mới xác nhận.
   */
  async boostMovie(movieId, additionalShowtimes, xemTruoc = false) {
    const connection = await pool.getConnection();
    let movie;
    try {
      const [rows] = await connection.query(
        `SELECT id, title, duration, genre FROM movies WHERE id = ? AND status = 'NOW_SHOWING'`,
        [movieId]
      );
      if (!rows.length) return { success: false, message: 'Không tìm thấy phim đang chiếu với ID này' };
      movie = rows[0];
    } finally { connection.release(); }

    // Trước đây gọi _scoreMovie() với ticket_count/rating/favorite_count đều =
    // 0 — tức LUÔN chấm điểm phim này như thể CHƯA AI biết đến (chỉ dùng
    // baseline "lạnh" thể loại/TMDb), bất kể phim đang được đôn suất chính vì
    // ĐÃ CÓ vé bán thật tăng vọt gần đây (xem getTrendingSuggestions — điều
    // kiện "trending" luôn đòi hỏi recent_tickets thật). Hệ quả: tier/phòng
    // chọn cho suất đôn thêm bị đánh giá THẤP hơn thực tế, phim hot có thể bị
    // xếp vào phòng standard thay vì VIP/IMAX xứng đáng. Lấy đúng dữ liệu
    // thật của phim (giống hệt cách fetchEligibleMovies tính cho các phim khác)
    // trước khi chấm điểm.
    const stats = await this._fetchMovieStats(movie.id);
    const scored = await this._scoreMovie({ ...movie, ...stats });
    const tier = this.getPopularityTier(scored.popularity_score);
    const rooms = await this.fetchAvailableRooms();
    const suitableRooms = this.filterRoomsByPopularity(rooms, tier);
    this._slotDemandProfile = await this._getSlotDemandProfile();

    this.dryRun = xemTruoc;
    this.pendingInserts = [];
    this.generatedCount = 0;
    this._datLaiChiMuc();

    const now = new Date();
    const upcomingDays = [];
    for (let i = 0; i < this.config.DAYS_PER_WEEK; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      upcomingDays.push(formatLocalDateString(d));
    }

    let remaining = additionalShowtimes;
    const duration = movie.duration || 120;
    // Xoay vòng qua từng rạp (không random) để suất bổ sung trải đều, không
    // dồn hết vào 1 rạp chỉ vì rạp đó đứng đầu danh sách.
    const roundRobinRooms = this._roundRobinByCinema(suitableRooms);
    for (const date of upcomingDays) {
      if (remaining <= 0) break;
      for (const room of roundRobinRooms) {
        if (remaining <= 0) break;
        // _buildPrioritizedSlots đã tự loại khung giờ đã qua nếu date là hôm nay.
        const slots = this._buildPrioritizedSlots(duration, date, room.cinema_id);
        for (const timeSlot of slots) {
          if (!(await this.checkRoomConflict(room.room_id, date, timeSlot, duration, room.cinema_id))) {
            if (await this._doInsert({ ...movie, popularity_score: scored.popularity_score }, room, date, timeSlot)) {
              remaining--;
            }
            break; // mỗi phòng chỉ nhận 1 suất bổ sung/ngày trong 1 lần đôn, tránh dồn hết vào 1 phòng
          }
        }
      }
    }

    const ketQua = this.pendingInserts.map((r) => ({ ...r, kind: 'new' }));

    // ── Bước 2: thay suất của phim ế khi không còn giờ trống ──
    if (remaining > 0) {
      const phongTheoId = new Map(suitableRooms.map((r) => [r.room_id, r]));
      const daDungPhongNgay = new Set(ketQua.map((r) => `${r.room_id}|${r.show_date}`));
      const cfgSwap = this.config.TREND_BOOST.SWAP;
      const ungVien = await this._timSuatCoTheThay(movie.id, [...phongTheoId.keys()], upcomingDays);
      // Đếm lại số suất mỗi phim còn giữ trong từng ngày khi lấy dần trong vòng lặp
      const conLai = new Map(ungVien.map((u) => [`${u.movie_id}|${u.show_date}`, Number(u.suat_cung_ngay)]));
      const daLayCuaPhim = new Map();

      for (const u of ungVien) {
        if (remaining <= 0) break;
        const khoaNgay = `${u.movie_id}|${u.show_date}`;
        if ((daLayCuaPhim.get(u.movie_id) || 0) >= cfgSwap.MAX_TAKE_PER_MOVIE) continue;
        const coKhach = Number(u.ve_gan_day) > 0;
        const phaiGiu = coKhach ? cfgSwap.MIN_KEEP_PER_DAY : 0;
        if (conLai.get(khoaNgay) - 1 < phaiGiu) continue;
        if (daDungPhongNgay.has(`${u.room_id}|${u.show_date}`)) continue;
        // Phim hot phải vừa khít vào chỗ của suất cũ: không đè suất kế tiếp,
        // vẫn đủ thời gian dọn phòng và chiếu xong trước giờ đóng cửa.
        if (await this.checkRoomConflict(u.room_id, u.show_date, u.show_time, movie.duration || 120, u.cinema_id, u.id)) continue;

        const room = phongTheoId.get(u.room_id);
        const price = this.calculatePrice(u.show_time, room.room_type, u.show_date);
        if (!xemTruoc) {
          // Điều kiện "chưa có vé, không ai giữ ghế" được kiểm LẠI ngay trong
          // câu UPDATE — giữa lúc tìm ứng viên và lúc thay, có thể vừa có
          // khách đặt vé; khi đó 0 dòng bị đổi và suất được giữ nguyên.
          const [res] = await pool.query(`
            UPDATE showtimes s SET s.movie_id = ?, s.price = ?
            WHERE s.id = ? AND s.movie_id = ?
              AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.showtime_id = s.id)
              AND NOT EXISTS (SELECT 1 FROM seat_locks sl WHERE sl.showtime_id = s.id AND sl.expires_at > NOW())
          `, [movie.id, price, u.id, u.movie_id]);
          if (res.affectedRows === 0) continue;
        }

        conLai.set(khoaNgay, conLai.get(khoaNgay) - 1);
        daLayCuaPhim.set(u.movie_id, (daLayCuaPhim.get(u.movie_id) || 0) + 1);
        daDungPhongNgay.add(`${u.room_id}|${u.show_date}`);
        remaining--;
        ketQua.push({
          id: u.id,
          kind: 'replaced',
          movie_id: movie.id,
          movie_title: movie.title,
          cinema_id: u.cinema_id,
          cinema_name: room.cinema_name,
          room_id: u.room_id,
          room_name: room.room_name,
          room_type: room.room_type,
          duration: movie.duration || 120,
          show_date: u.show_date,
          show_time: u.show_time,
          price,
          total_seats: room.total_seats,
          replaced_movie_id: u.movie_id,
          replaced_movie_title: u.title,
          replaced_movie_remaining_that_day: conLai.get(khoaNgay),
          replaced_movie_recent_tickets: Number(u.ve_gan_day),
        });
      }
    }

    ketQua.sort((a, b) => `${a.show_date} ${a.show_time}`.localeCompare(`${b.show_date} ${b.show_time}`));
    const soDaXep = ketQua.length;
    return {
      success: true,
      preview: xemTruoc,
      movie: movie.title,
      requested: additionalShowtimes,
      inserted: soDaXep,
      insertedNew: ketQua.filter((r) => r.kind === 'new').length,
      replaced: ketQua.filter((r) => r.kind === 'replaced').length,
      notInserted: additionalShowtimes - soDaXep,
      schedule: ketQua.map((r) => ({
        id: r.id ?? null,
        kind: r.kind,
        show_date: r.show_date,
        show_time: String(r.show_time).slice(0, 5),
        end_time: this._congPhut(r.show_time, r.duration),
        cinema_name: r.cinema_name,
        room_name: r.room_name,
        room_type: r.room_type,
        total_seats: r.total_seats,
        price: Number(r.price),
        replaced_movie_title: r.replaced_movie_title ?? null,
        replaced_movie_remaining_that_day: r.replaced_movie_remaining_that_day ?? null,
        replaced_movie_recent_tickets: r.replaced_movie_recent_tickets ?? null,
      })),
    };
  }

  /** "HH:MM" + số phút → "HH:MM" (giờ kết thúc phim, không tính dọn phòng) */
  _congPhut(time, phut) {
    const [h, m] = String(time).split(':').map(Number);
    const tong = h * 60 + m + Number(phut || 0);
    return `${String(Math.floor(tong / 60) % 24).padStart(2, '0')}:${String(tong % 60).padStart(2, '0')}`;
  }

  /**
   * Tìm các suất có thể nhường cho phim hot. Mỗi điều kiện bảo vệ một bên:
   *  - Chưa từng có vé nào (kể cả vé đã huỷ, để lịch sử vé không bị đổi phim)
   *    và không ai đang giữ ghế → không khách nào bị ảnh hưởng.
   *  - Còn ≥ MIN_LEAD_HOURS mới chiếu → khách đang xem lịch không bị đổi
   *    phim ngay trước giờ chiếu.
   *  - Phim bị lấy suất có điểm phổ biến THẤP HƠN phim hot, và không phải
   *    phim đang lên banner (banner là lời hứa quảng bá của rạp). So bằng
   *    cột movies.popularity_score của CẢ HAI phim — cùng một thang điểm
   *    (tính lại mỗi giờ); không so với điểm _scoreMovie() vì đó là thang khác.
   *  - Ưu tiên lấy của phim ế nhất trước, rồi suất sớm nhất (phim hot cần
   *    thêm suất càng sớm càng tốt).
   * Các điều kiện phụ thuộc thứ tự lấy (số suất phim bị lấy còn giữ trong
   * ngày, mỗi phim bị lấy tối đa bao nhiêu suất, phim hot có vừa khít thời
   * lượng không) được xét ở boostMovie.
   */
  async _timSuatCoTheThay(movieId, roomIds, days) {
    if (!roomIds.length || !days.length) return [];
    const cfgSwap = this.config.TREND_BOOST.SWAP;
    const [rows] = await pool.query(`
      SELECT s.id, s.movie_id, mv.title, s.room_id, s.cinema_id,
             DATE_FORMAT(s.show_date, '%Y-%m-%d') AS show_date,
             TIME_FORMAT(s.show_time, '%H:%i') AS show_time,
             (SELECT COUNT(*) FROM showtimes s2 WHERE s2.movie_id = s.movie_id AND s2.show_date = s.show_date) AS suat_cung_ngay,
             (SELECT COUNT(*) FROM tickets t2 JOIN showtimes s3 ON s3.id = t2.showtime_id
              WHERE s3.movie_id = s.movie_id AND t2.payment_status = 'paid' AND t2.booking_status = 'confirmed'
                AND t2.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS ve_gan_day
      FROM showtimes s JOIN movies mv ON mv.id = s.movie_id
      WHERE s.movie_id <> ?
        AND s.room_id IN (?)
        AND s.show_date BETWEEN ? AND ?
        AND TIMESTAMP(s.show_date, s.show_time) >= DATE_ADD(NOW(), INTERVAL ? HOUR)
        AND mv.featured_order IS NULL
        AND COALESCE(mv.popularity_score, 0) < (SELECT COALESCE(popularity_score, 0) FROM movies WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.showtime_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM seat_locks sl WHERE sl.showtime_id = s.id AND sl.expires_at > NOW())
      ORDER BY COALESCE(mv.popularity_score, 0) ASC, s.show_date ASC, s.show_time ASC
    `, [cfgSwap.NO_DEMAND_LOOKBACK_DAYS, movieId, roomIds, days[0], days[days.length - 1],
        cfgSwap.MIN_LEAD_HOURS, movieId]);
    return rows;
  }

  // ═══════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════

  generateDateRange(startDate, days) {
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      // KHÔNG dùng d.toISOString() — quy đổi sang UTC trước khi cắt chuỗi
      // khiến nửa đêm giờ địa phương (UTC+7) lùi về 17h hôm TRƯỚC theo UTC,
      // làm TOÀN BỘ lịch tạo tự động bị lùi 1 ngày so với ngày admin chọn.
      dates.push(formatLocalDateString(d));
    }
    return dates;
  }

  // [RB-M3] Giảm số suất theo tuổi phim
  getAgeDecayMultiplier(weeks) {
    const d = this.config.AGE_DECAY_MULTIPLIER;
    if (weeks <= 1) return d.WEEK_1;
    if (weeks <= 3) return d.WEEK_2_3;
    return d.WEEK_4_PLUS;
  }

  // [RB-M6] Phim hot ưu tiên phòng cao cấp (ưu tiên, không loại trừ)
  filterRoomsByPopularity(rooms, tier) {
    if (!this.config.ENABLE_ROOM_PRIORITY) return rooms;
    const preferred = this.config.ROOM_PRIORITY[`${tier}_POPULARITY`] || [];
    const khop = (r) => r.room_type && preferred.some(p => r.room_type.toLowerCase().includes(p.toLowerCase()));
    const matched = rooms.filter(khop);

    if (matched.length) {
      // ƯU TIÊN chứ KHÔNG loại trừ: trả phòng hợp gu lên TRƯỚC, rồi nối phần
      // còn lại phía sau. Vòng lặp sinh suất duyệt phòng theo đúng thứ tự này
      // và dừng khi đủ chỉ tiêu, nên phòng ưu tiên vẫn được dùng trước.
      //
      // Trước đây hàm trả về DUY NHẤT mảng matched, biến bảng ưu tiên thành danh
      // sách trắng. Hậu quả: phim tier HIGH chỉ được dùng imax/vip/4dx (5
      // phòng) và BỊ CẤM khỏi 5 phòng thường, trong khi phim tier MEDIUM lại
      // được dùng standard/vip (8 phòng). Kết quả thực đo: một phim MEDIUM
      // chưa bán được vé nào chiếm 256/708 suất (36%) vì độc chiếm cả 5 phòng
      // thường, còn phim bán chạy nhất chỉ được 121 suất — ngược hoàn toàn với
      // mục đích của việc xếp hạng độ phổ biến.
      //
      // Ngoài đời loại phòng quyết định GIÁ VÉ, không quyết định phim nào được
      // chiếu ở đó: bom tấn vẫn chiếu ở phòng thường, chỉ là chiếu thêm ở
      // phòng cao cấp.
      return [...matched, ...rooms.filter((r) => !khop(r))];
    }

    // Fallback (không rạp nào có đúng room_type ưu tiên): chia theo capacity
    // NHƯNG PHẢI LÀM RIÊNG TỪNG RẠP, không gộp rooms của mọi rạp lại rồi cắt
    // theo 1/3 tổng — nếu gộp chung, rạp có phòng nhỏ hơn 2 rạp còn lại có
    // thể bị loại HOÀN TOÀN khỏi tier HIGH (chính là lỗi đã gặp khiến 1 phim
    // chỉ chiếu được ở 1-2/3 rạp — xem _ensureBaseline). Chia theo capacity
    // TRONG PHẠM VI TỪNG RẠP đảm bảo rạp nào cũng có ít nhất 1 phòng cho mỗi tier.
    const byCinema = new Map();
    for (const room of rooms) {
      if (!byCinema.has(room.cinema_id)) byCinema.set(room.cinema_id, []);
      byCinema.get(room.cinema_id).push(room);
    }
    const result = [];
    for (const cinemaRooms of byCinema.values()) {
      const sorted = [...cinemaRooms].sort((a, b) => b.total_seats - a.total_seats);
      if (tier === 'HIGH') {
        result.push(...sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3))));
      } else if (tier === 'MEDIUM') {
        // Math.max(lo + 1, ...) đảm bảo rạp chỉ có 1-2 phòng loại này vẫn có
        // ít nhất 1 phòng lọt vào tier MEDIUM — trước đây với đúng 1 phòng,
        // Math.floor(1/3)=0 và Math.floor(2/3)=0 cho slice(0,0) rỗng, khiến
        // rạp đó bị loại hoàn toàn khỏi tier MEDIUM trong nhánh fallback này.
        const lo = Math.floor(sorted.length / 3);
        const hi = Math.max(lo + 1, Math.floor(sorted.length * 2 / 3));
        result.push(...sorted.slice(lo, hi));
      } else {
        result.push(...sorted.slice(Math.floor(sorted.length * 2 / 3)));
      }
    }
    return result;
  }

  calculatePrice(timeSlot, roomType, dateStr) {
    const [h] = timeSlot.split(':').map(Number);
    const base = this.config.PRICE_BASE;
    const mod  = this.config.PRICE_MODIFIERS;
    let price;
    const band = this.config.TIME_BANDS;
    if (h >= band.PRIME_FROM_HOUR && h < band.PRIME_TO_HOUR) price = base * mod.PRIME_TIME;
    else if (h >= band.MEDIUM_FROM_HOUR)                     price = base * mod.MEDIUM_TIME;
    else                   price = base * mod.LOW_PEAK;

    // Phòng cao cấp (VIP/IMAX/4DX) tính thêm phụ phí — phòng xịn hơn phải đắt hơn
    const roomMod = this.config.ROOM_TYPE_PRICE_MODIFIERS[(roomType || 'standard').toLowerCase()]
      ?? this.config.ROOM_TYPE_PRICE_MODIFIERS.standard;
    price *= roomMod;

    // Phụ phí cuối tuần — nhu cầu cao hơn (WEEKEND_SHOWTIME_MULTIPLIER đã tăng
    // SỐ suất chiếu cuối tuần, giá cũng nên nhích lên theo đúng thực tế rạp thật)
    if (dateStr && this._isWeekend(dateStr)) price *= mod.WEEKEND_PRICE_MODIFIER;

    return Math.round(price / 1000) * 1000; // làm tròn đến nghìn đồng
  }

  /**
   * Sắp phòng theo thứ tự XOAY VÒNG QUA TỪNG RẠP (rạp 1 phòng 1, rạp 2 phòng
   * 1, rạp 3 phòng 1, rồi rạp 1 phòng 2...) thay vì random — dùng khi cần trải
   * đều suất bổ sung (boostMovie) qua nhiều rạp/phòng một cách công bằng và có
   * thể tái lập, không phụ thuộc may rủi của Math.random().
   */
  _roundRobinByCinema(rooms) {
    const byCinema = new Map();
    for (const room of rooms) {
      if (!byCinema.has(room.cinema_id)) byCinema.set(room.cinema_id, []);
      byCinema.get(room.cinema_id).push(room);
    }
    const buckets = [...byCinema.values()];
    const result = [];
    for (let i = 0; result.length < rooms.length; i++) {
      for (const bucket of buckets) {
        if (i < bucket.length) result.push(bucket[i]);
      }
    }
    return result;
  }

  log(msg, level = 'INFO') {
    if (!this.config.LOGGING_ENABLED) return;
    const icon = { INFO: '📝', WARN: '⚠️', ERROR: '❌' }[level] || 'ℹ️';
    console.log(`[${new Date().toISOString()}] ${icon} ${msg}`);
  }
}

module.exports = ShowtimeGeneratorService;
