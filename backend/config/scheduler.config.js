/**
 * Showtime Generator Configuration
 * Centralized configuration for automatic showtime generation
 * All magic numbers and business rules are defined here for easy maintenance
 */

module.exports = {
  // Popularity Score Calculation Weights
  POPULARITY_WEIGHTS: {
    TICKET_COUNT: 0.6,      // 60% weight for ticket sales
    AVERAGE_RATING: 0.3,    // 30% weight for ratings
    FAVORITE_COUNT: 0.1     // 10% weight for favorites
  },

  // "Cold start" baseline (TMDb/thể loại) được CỘNG vào điểm nội bộ với trọng số
  // 1/(1 + sampleSize/HALF_LIFE), sampleSize = ticket_count+rating_count+favorite_count.
  // Giá trị này = sampleSize cần để baseline giảm còn 50% ảnh hưởng. Thấp hơn =
  // baseline mất ảnh hưởng nhanh hơn (tin dữ liệu thật sớm hơn).
  POPULARITY_COLD_START_HALF_LIFE: 8,

  // Movie Popularity Tiers — số suất chiếu MỖI PHÒNG mỗi ngày
  // (Đã bỏ PRIME/MEDIUM/LOW_TIME_RATIO: khai báo nhưng thuật toán chưa từng đọc.
  // Việc phân giờ vàng/thường thực tế do _slotDemandScore quyết định theo số
  // vé bán thật từng khung giờ — xem ràng buộc mềm RB-M5.)
  POPULARITY_TIERS: {
    HIGH: {
      MIN_SCORE: 100,
      SHOWTIMES_PER_DAY: { MIN: 4, MAX: 6 },  // per room
    },
    MEDIUM: {
      MIN_SCORE: 30,
      SHOWTIMES_PER_DAY: { MIN: 3, MAX: 5 },  // per room
    },
    LOW: {
      MIN_SCORE: 0,
      SHOWTIMES_PER_DAY: { MIN: 2, MAX: 4 },  // per room
    }
  },

  // Tier HIGH không có ngưỡng điểm trên (không có tier nào cao hơn để suy ra
  // biên) — dùng khoảng điểm cố định này để nội suy vị trí của phim trong tier
  // HIGH khi tính số suất/phòng (xem _showtimesForScore trong ShowtimeGeneratorService).
  // 60 điểm ~ khoảng cách MEDIUM->HIGH (30->100=70), giữ tỉ lệ tương đương.
  TOP_TIER_SCORE_SPAN: 60,

  // ── RB-C2: GIỜ HOẠT ĐỘNG CỦA RẠP (ràng buộc CỨNG) ──────────────────────
  // NGUỒN SỰ THẬT DUY NHẤT cho cả 3 nơi kiểm giờ: bộ sinh lịch
  // (ShowtimeGeneratorService), bộ kiểm lịch khi admin tạo suất tay
  // (utils/showtimeValidation) và bộ soát lỗi (scripts/_audit-logic). Trước đây
  // mỗi nơi tự viết cứng một bản — bộ kiểm lịch tạo tay còn QUÊN mốc "suất cuối",
  // nên admin tạo được suất 23:50 mà bộ soát lỗi lại báo chính suất đó vi phạm.
  // Tất cả cộng thêm độ lệch theo rạp (CINEMA_TIME_OFFSET_*: 0/10/20 phút).
  OPERATING_HOURS: {
    OPEN_HOUR: 9,             // 09:00 (cuối tuần mở sớm hơn WEEKEND_EXTRA_OPEN_MINUTES)
    MUST_END_BY_HOUR: 25,     // phim phải CHIẾU XONG trước 01:00 hôm sau (25 = 24 + 1)
    LAST_START_HOUR: 23,      // mốc tính giờ mở suất CUỐI CÙNG trong ngày...
    LAST_START_OFFSET_MINUTES: { weekday: -30, weekend: 15 }, // ...= 22:30 ngày thường, 23:15 cuối tuần
  },

  // ── Khung giờ tính giá & xếp hạng khung giờ ────────────────────────────
  // Thay cho TIME_SLOTS cũ (danh sách giờ cố định 19:00–22:00 là giờ vàng...)
  // vốn KHÔNG nơi nào đọc — mã thật dùng mốc 18h–23h, nên file cấu hình từng
  // nói một đằng, thuật toán làm một nẻo. Nay mã đọc đúng các mốc dưới đây.
  TIME_BANDS: {
    PRIME_FROM_HOUR: 18,      // 18:00–22:59 = giờ vàng (giá ×PRICE_MODIFIERS.PRIME_TIME)
    PRIME_TO_HOUR: 23,
    MEDIUM_FROM_HOUR: 15,     // 15:00–17:59 và từ 23:00 = giờ trung bình; trước 15:00 = thấp điểm
  },

  // Movie Age Decay (weeks from release date)
  AGE_DECAY_MULTIPLIER: {
    WEEK_1: 1.0,      // Full showtimes in first week
    WEEK_2_3: 0.85,   // 85% showtimes in week 2-3
    WEEK_4_PLUS: 0.7, // 70% showtimes from week 4+
    // Ý định ban đầu của giá trị này là "không loại phim theo tuổi" (giữ phim
    // demo/cũ vẫn đủ điều kiện sinh suất chiếu) — nhưng 999 tuần (~19 năm) vẫn
    // loại mất phim thật lâu năm hơn thế (vd suất chiếu lại classic như Harry
    // Potter 2001, ~25 năm tính tới hiện tại) — phát hiện khi 4/8 phim trong
    // seri không có suất chiếu nào dù đủ điều kiện mọi mặt khác. Rạp thật vẫn
    // chiếu lại phim kinh điển bất kể phát hành bao lâu (suất chiếu lại,
    // marathon...), nên STOP_AT_WEEK không nên chặn theo tuổi thật — chỉ
    // AGE_DECAY_MULTIPLIER (giảm số suất, không loại hẳn) mới nên áp dụng.
    STOP_AT_WEEK: 999999  // Không loại phim theo tuổi — chỉ áp hệ số giảm suất
  },

  // Cinema Room Priorities (assign popular movies to larger rooms)
  // Phải khớp với giá trị room_type thật trong DB: standard, vip, imax, 4dx
  // (trước đây dùng nhãn 'Large'/'Medium'/'Small'/'Compact' không tồn tại trong DB
  // nên phòng VIP/IMAX/4DX gần như không được phân suất chiếu, gây lãng phí công suất)
  ROOM_PRIORITY: {
    HIGH_POPULARITY: ['imax', 'vip', '4dx'],   // Phim hot ưu tiên phòng cao cấp
    MEDIUM_POPULARITY: ['standard', 'vip'],     // Phim tầm trung: phòng thường, có thể dùng VIP
    LOW_POPULARITY: ['standard', '4dx']         // Phim ít phổ biến: phòng thường/4dx
  },

  // Movie Status Filters
  ELIGIBLE_STATUSES: ['NOW_SHOWING', 'COMING_SOON'], // Only generate for these statuses
  // (Đã bỏ EXCLUDED_STATUSES: trùng ý với ELIGIBLE_STATUSES ở trên — mọi trạng thái
  // không có trong danh sách đó vốn đã bị loại, và không nơi nào đọc mục này.)

  // Generation Settings
  DAYS_PER_WEEK: 7,
  MIN_BUFFER_MINUTES: 20,  // Khoảng nghỉ giữa các suất (dọn phòng) - 20 phút để nhét nhiều suất hơn
  // Giá nền = suất SỚM NHẤT, NGÀY THƯỜNG, phòng thường, ghế thường.
  // Mọi hệ số bên dưới NHÂN DỒN lên con số này, và cuối cùng còn nhân tiếp hệ
  // số bậc ghế (tối đa x1,35 cho ghế Premium) ở utils/ticketPricing.js. Trước
  // đây nền 80.000 khiến trường hợp cao nhất lên tới 309.000đ/ghế — gấp hơn
  // 2 lần giá thực tế của CGV/Lotte/Galaxy. Hạ nền xuống 65.000 đưa toàn dải
  // giá về khoảng 55.000 - 220.000đ, khớp với mặt bằng rạp Việt Nam.
  PRICE_BASE: 65000,       // Giá vé nền (VNĐ)
  PRICE_MODIFIERS: {
    PRIME_TIME: 1.3,       // +30% for prime time
    MEDIUM_TIME: 1.15,     // +15% for medium time
    LOW_PEAK: 0.85,        // -15% for low peak
    // Phụ phí cuối tuần — nhu cầu cao hơn (đã phản ánh qua WEEKEND_SHOWTIME_MULTIPLIER
    // ở SỐ LƯỢNG suất chiếu) cũng nên phản ánh qua GIÁ vé, giống rạp thật (CGV/Lotte
    // đều niêm yết giá cuối tuần cao hơn ngày thường).
    WEEKEND_PRICE_MODIFIER: 1.1, // +10% cuối tuần
  },
  // Phụ phí theo loại phòng — phòng càng cao cấp giá càng cao
  // LƯU Ý: các hệ số này còn được nhân tiếp với hệ số bậc ghế (x1,0 / x1,2 /
  // x1,35). Vì vậy chúng phải khiêm tốn hơn mức chênh lệch giá cuối cùng mong
  // muốn — để x2,0 cho 4DX rồi nhân thêm x1,35 sẽ ra x2,7 so với ghế thường.
  ROOM_TYPE_PRICE_MODIFIERS: {
    standard: 1.0,
    vip: 1.25,   // +25%
    imax: 1.6,   // +60%
    '4dx': 1.75, // +75%
  },

  // Advanced Settings
  ENABLE_COMING_SOON: true,  // Generate for COMING_SOON if release within week
  ENABLE_AGE_DECAY: true,    // Apply age-based showtime reduction
  ENABLE_ROOM_PRIORITY: true, // Assign rooms by popularity
  LOGGING_ENABLED: true,

  // Đa dạng theo ngày trong tuần — cuối tuần (tính cả tối Thứ 6, thói quen đi
  // xem phim VN đã đông từ tối Thứ 6) nhu cầu cao hơn ngày thường, phòng cần
  // mở sớm hơn/đóng muộn hơn và chạy nhiều suất hơn để tránh vừa lủng giờ
  // trống vừa bỏ lỡ doanh thu cao điểm cuối tuần.
  WEEKEND_DAYS: [5, 6, 0], // Date.getDay(): 5=Thứ 6, 6=Thứ 7, 0=Chủ nhật
  WEEKEND_SHOWTIME_MULTIPLIER: 1.3,
  WEEKEND_EXTRA_OPEN_MINUTES: 45,  // Mở cửa sớm hơn (phút)
  // (Đã bỏ WEEKEND_EXTRA_CLOSE_MINUTES: 45 — ghi "cuối tuần đóng cửa muộn 45 phút" nhưng
  // thuật toán CỐ Ý không nới giờ đóng cửa; cuối tuần chỉ được mở suất cuối muộn
  // hơn — 23:15 thay vì 22:30 — xem OPERATING_HOURS.LAST_START_OFFSET_MINUTES.)

  // Lệch giờ chiếu giữa các RẠP KHÁC NHAU — thực tế CGV/Lotte/Galaxy không bao
  // giờ chiếu cùng 1 phim đúng cùng 1 phút, lệch nhau vài chục phút tạo cảm
  // giác tự nhiên hơn thay vì mọi rạp "đẹp giờ" giống hệt nhau mỗi ngày.
  CINEMA_TIME_OFFSET_STEP_MINUTES: 10,
  CINEMA_TIME_OFFSET_VARIANTS: 3, // offset = (cinema_id % 3) * step -> 0/10/20 phút

  // Lấp lỗ hổng giờ trống trong phòng sau khi đã phân bổ theo phim — rạp thật
  // hiếm khi để phòng trống nhiều giờ liền giữa 2 suất; backfill bằng cách lặp
  // lại phim phù hợp phòng đó (ưu tiên phim phổ biến hơn), có giới hạn số lần
  // lặp/phim/phòng/ngày để tránh 1 phim độc chiếm cả phòng.
  ENABLE_GAP_FILL: true,
  MAX_REPEATS_PER_MOVIE_PER_ROOM_PER_DAY: 3,
  // Trần lấp đầy theo NGÀY THƯỜNG/CUỐI TUẦN — áp dụng cho CẢ vòng 2 (suất
  // thêm theo độ phổ biến) LẪN vòng 3 (lấp lỗ hổng), không riêng gì gap-fill.
  // Lý do phải chặn từ vòng 2: hệ thống hiện có ~19-20 phim NOW_SHOWING cạnh
  // tranh chỉ 10 phòng vật lý — nếu không có trần, vòng 2 một mình đã đủ lấp
  // gần kín phòng CẢ NGÀY THƯỜNG (vì có quá nhiều phim cùng xin suất), khiến
  // ngày thường và cuối tuần cùng chạm trần vật lý và trông giống hệt nhau dù
  // WEEKEND_SHOWTIME_MULTIPLIER đã nhân hệ số đúng. Rạp thật không lấp kín
  // phòng ngày thường vì không đủ khách, chỉ cuối tuần mới gần kín — trần này
  // mô phỏng đúng điều đó. Giá trị là tỉ lệ tối đa số khung giờ/phòng/ngày
  // được lấp (tính trên tổng số khung giờ CÓ THỂ chiếu trong ngày đó).
  ROOM_FILL_MAX_FRACTION: {
    weekday: 0.3,
    weekend: 1.0,
  },

  // "Đôn suất chiếu" thủ công cho phim mới ra rạp bất ngờ tăng nhiệt — chỉ
  // TÍNH TOÁN GỢI Ý, admin tự xem số liệu và bấm áp dụng (không tự động chèn).
  TREND_BOOST: {
    LOOKBACK_RECENT_DAYS: 3,     // Vé xác nhận trong 3 ngày gần nhất
    // Cửa sổ "trước đó" luôn dài ĐÚNG BẰNG cửa sổ gần nhất (N ngày liền trước),
    // nên không có khoá LOOKBACK_PRIOR_DAYS riêng — so hai khoảng lệch độ dài là
    // so khập khiễng (3 ngày gần nhất với 7 ngày trước thì phim nào cũng "giảm").
    MIN_RECENT_TICKETS: 3,       // Đủ mẫu để tin số liệu, tránh nhiễu vì 1-2 vé
    MOMENTUM_THRESHOLD: 1.5,     // Tăng ít nhất 50% mới coi là "đang lên"
    MAX_RELEASE_AGE_DAYS: 21,    // Tín hiệu ĐÀ TĂNG chỉ xét phim mới chiếu trong 3 tuần gần nhất
    MAX_SUGGESTED_ADDITIONAL: 6,

    // Tín hiệu thứ hai: TỈ LỆ LẤP ĐẦY — thứ rạp thật dùng để quyết định thêm
    // suất. Không giới hạn tuổi phim, nên bắt được cả phim cũ chiếu lại mà
    // hot, phim "truyền miệng" nổi lên muộn, và phim hot ĐỀU (đà tăng ≈ 1 nên
    // tín hiệu đà tăng bỏ sót, dù suất nào cũng kín).
    OCCUPANCY: {
      NEAR_FULL_RATIO: 0.85,         // Một suất bán ≥ 85% ghế coi là "gần kín"
      MIN_NEAR_FULL_SHOWTIMES: 2,    // Cần ≥ 2 suất gần kín — 1 suất có thể chỉ là may mắn
      AVG_THRESHOLD: 0.7,            // Hoặc: trung bình các suất ĐÃ CHIẾU lấp đầy ≥ 70%
      MIN_FINISHED_SHOWTIMES: 3,     // Cần ≥ 3 suất đã chiếu thì mức trung bình mới đáng tin
      TARGET_RATIO: 0.7,             // Thêm suất cho tới khi lấp đầy dự kiến về quanh 70%
    },

    // Khi mọi phòng đã kín giờ, đôn suất bằng cách THAY suất của phim ế —
    // đúng cách rạp thật làm. Chỉ lấy suất chưa bán vé nào và còn đủ xa giờ
    // chiếu để không khách nào bị ảnh hưởng.
    SWAP: {
      MIN_LEAD_HOURS: 3,             // Suất bị thay phải còn ≥ 3 giờ nữa mới chiếu
      MIN_KEEP_PER_DAY: 1,           // Phim CÓ khách giữ ≥ 1 suất trong ngày đó
      // Phim 7 ngày qua không bán được vé nào thì được nhường cả suất duy nhất
      // của một ngày — giữ suất trống cho phim không ai xem trong khi khách
      // của phim hot bị từ chối là phí phòng. Các ngày khác vẫn còn nguyên.
      NO_DEMAND_LOOKBACK_DAYS: 7,
      MAX_TAKE_PER_MOVIE: 1,         // Mỗi lần đôn chỉ lấy tối đa 1 suất của mỗi phim — chia đều thiệt hại
    },
  },
};
