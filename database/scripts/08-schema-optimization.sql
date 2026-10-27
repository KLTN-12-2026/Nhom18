-- ================================================================
-- MIGRATION 08: Schema Optimization & Table Decomposition
-- ================================================================
-- Mục tiêu:
--   1. Tách JSON seats/combo_items ra các bảng riêng
--   2. Bổ sung bảng còn thiếu (ratings, reviews, favorites)
--   3. Thêm indexes còn thiếu để tăng tốc query
--   4. Migrate data hiện có từ JSON sang bảng mới
--   5. Tạo view tính available_seats chính xác
--
-- Yêu cầu: MySQL 8.0.3+ (dùng CREATE INDEX IF NOT EXISTS)
-- Chạy: mysql -u root -p movie_booking < 08-schema-optimization.sql
-- ================================================================

-- ----------------------------------------------------------------
-- PHẦN 1: TẠO BẢNG MỚI
-- ----------------------------------------------------------------

-- 1a. ticket_seats — thay thế JSON seats trong tickets
--     UNIQUE(showtime_id, seat_code) ngăn double-booking ở tầng DB
CREATE TABLE IF NOT EXISTS ticket_seats (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT NOT NULL,
  showtime_id INT NOT NULL,
  seat_code   VARCHAR(10) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id)   REFERENCES tickets(id)   ON DELETE CASCADE,
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id) ON DELETE CASCADE,
  UNIQUE KEY  uq_showtime_seat  (showtime_id, seat_code),
  INDEX       idx_ts_ticket_id  (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1b. ticket_combos — thay thế JSON combo_items trong tickets
CREATE TABLE IF NOT EXISTS ticket_combos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT NOT NULL,
  combo_id    INT NOT NULL,
  quantity    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2)   NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (combo_id)  REFERENCES combos(id),
  INDEX idx_tc_ticket_id (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1c. movie_ratings — đánh giá sao của user
CREATE TABLE IF NOT EXISTS movie_ratings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  movie_id   INT NOT NULL,
  user_id    INT NOT NULL,
  rating     DECIMAL(2,1) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  UNIQUE KEY uq_user_movie_rating (user_id, movie_id),
  INDEX idx_mr_movie_id (movie_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1d. movie_reviews — bình luận của user
CREATE TABLE IF NOT EXISTS movie_reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  movie_id    INT NOT NULL,
  user_id     INT NOT NULL,
  rating      DECIMAL(2,1) NULL,
  review_text TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  UNIQUE KEY uq_user_movie_review  (user_id, movie_id),
  INDEX      idx_rev_movie_created (movie_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1e. review_helpful — user đánh dấu review hữu ích
CREATE TABLE IF NOT EXISTS review_helpful (
  review_id  INT NOT NULL,
  user_id    INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, user_id),
  FOREIGN KEY (review_id) REFERENCES movie_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1f. favorites — phim yêu thích của user
CREATE TABLE IF NOT EXISTS favorites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  movie_id   INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_movie_fav (user_id, movie_id),
  INDEX      idx_fav_movie_id  (movie_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- PHẦN 2: THÊM INDEXES CÒN THIẾU
-- (CREATE INDEX IF NOT EXISTS yêu cầu MySQL 8.0.3+)
-- ----------------------------------------------------------------

-- tickets: hai index quan trọng nhất cho seat queries và user history
CREATE INDEX IF NOT EXISTS idx_t_user_id         ON tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_t_showtime_status ON tickets (showtime_id, booking_status);

-- movies: lọc theo trạng thái, ngày chiếu, độ phổ biến
CREATE INDEX IF NOT EXISTS idx_m_status       ON movies (status);
CREATE INDEX IF NOT EXISTS idx_m_release_date ON movies (release_date);
CREATE INDEX IF NOT EXISTS idx_m_popularity   ON movies (popularity_score);

-- showtimes: lịch chiếu theo phim+ngày và rạp+ngày
CREATE INDEX IF NOT EXISTS idx_s_movie_date  ON showtimes (movie_id,  show_date);
CREATE INDEX IF NOT EXISTS idx_s_cinema_date ON showtimes (cinema_id, show_date);

-- ----------------------------------------------------------------
-- PHẦN 3: MIGRATE DỮ LIỆU JSON → BẢNG MỚI
-- ----------------------------------------------------------------

-- 3a. Chuyển JSON seats từ tickets sang ticket_seats
--     Hỗ trợ tối đa 10 ghế/vé (có thể tăng bằng cách thêm UNION)
INSERT IGNORE INTO ticket_seats (ticket_id, showtime_id, seat_code)
SELECT
  t.id,
  t.showtime_id,
  JSON_UNQUOTE(JSON_EXTRACT(t.seats, CONCAT('$[', n.n, ']'))) AS seat_code
FROM tickets t
CROSS JOIN (
  SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
  UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
) n
WHERE t.seats IS NOT NULL
  AND t.booking_status != 'cancelled'
  AND n.n < JSON_LENGTH(t.seats)
  AND JSON_EXTRACT(t.seats, CONCAT('$[', n.n, ']')) IS NOT NULL;

-- 3b. Chuyển JSON combo_items từ tickets sang ticket_combos
INSERT IGNORE INTO ticket_combos (ticket_id, combo_id, quantity, unit_price)
SELECT
  t.id,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(t.combo_items, CONCAT('$[', n.n, '].combo_id'))) AS UNSIGNED),
  COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.combo_items, CONCAT('$[', n.n, '].quantity'))) AS UNSIGNED), 1),
  COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.combo_items, CONCAT('$[', n.n, '].price')))    AS DECIMAL(10,2)), 0)
FROM tickets t
CROSS JOIN (
  SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
) n
WHERE t.combo_items IS NOT NULL
  AND t.combo_items != 'null'
  AND t.combo_items != '[]'
  AND n.n < JSON_LENGTH(t.combo_items)
  AND JSON_EXTRACT(t.combo_items, CONCAT('$[', n.n, '].combo_id')) IS NOT NULL;

-- ----------------------------------------------------------------
-- PHẦN 4: CÂN CHỈNH LẠI available_seats (sync với dữ liệu thực)
-- ----------------------------------------------------------------

UPDATE showtimes s
SET s.available_seats = (
  s.total_seats - (
    SELECT COUNT(*)
    FROM ticket_seats ts
    JOIN tickets t ON ts.ticket_id = t.id
    WHERE ts.showtime_id = s.id
      AND t.booking_status IN ('confirmed', 'pending')
  )
)
WHERE s.total_seats IS NOT NULL;

-- ----------------------------------------------------------------
-- PHẦN 5: VIEW TÍNH SỐ GHẾ TRỐNG (LUÔN CHÍNH XÁC)
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW vw_showtime_availability AS
SELECT
  s.id          AS showtime_id,
  s.total_seats,
  COUNT(ts.id)                  AS booked_seats,
  s.total_seats - COUNT(ts.id)  AS available_seats_live
FROM showtimes s
LEFT JOIN ticket_seats ts ON ts.showtime_id = s.id
  AND EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ts.ticket_id
      AND t.booking_status IN ('confirmed', 'pending')
  )
GROUP BY s.id, s.total_seats;

-- ----------------------------------------------------------------
-- HOÀN TẤT
-- ----------------------------------------------------------------
SELECT 'Migration 08 completed successfully' AS result;
