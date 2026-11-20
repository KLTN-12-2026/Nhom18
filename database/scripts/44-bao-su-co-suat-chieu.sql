-- ============================================================================
-- 44 — BÁO SỰ CỐ SUẤT CHIẾU (mất điện, hỏng máy chiếu, thời tiết...)
-- ============================================================================
-- Yêu cầu nghiệp vụ: khi rạp gặp sự cố trước giờ chiếu, quản lý phải thông
-- báo được tới MỌI khách đã mua vé suất đó qua email (và thông báo trong web),
-- và nếu phải huỷ suất thì hoàn tiền tự động.
--
-- 1. showtimes.status — suất bị huỷ vì sự cố KHÔNG được xoá (vé đã bán còn
--    trỏ tới nó, khách vẫn phải xem lại được vé đã hoàn tiền), chỉ đánh dấu
--    CANCELLED để ẩn khỏi mọi danh sách khách duyệt và chặn đặt vé mới.
--
-- 2. showtime_incidents — nhật ký sự cố: ai báo, lý do gì, bao nhiêu vé bị
--    ảnh hưởng, gửi được bao nhiêu email. Hội đồng/quản lý cấp trên cần tra
--    lại được "suất đó bị huỷ vì sao, khách có được báo không".
-- ============================================================================

ALTER TABLE showtimes
  ADD COLUMN status ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE' AFTER available_seats;

CREATE TABLE IF NOT EXISTS showtime_incidents (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  showtime_id     INT NOT NULL,
  -- cancelled = huỷ suất + hoàn tiền mọi vé; notice = chỉ thông báo (chậm giờ, đổi phòng...)
  incident_type   ENUM('cancelled', 'notice') NOT NULL,
  reason          VARCHAR(100) NOT NULL,          -- nhóm sự cố: mất điện, máy chiếu...
  message         TEXT NULL,                      -- lời nhắn riêng của quản lý gửi khách
  delay_minutes   INT NULL,                       -- chỉ dùng cho 'notice' khi suất chiếu trễ giờ
  reported_by     INT NULL,
  affected_tickets INT NOT NULL DEFAULT 0,
  emails_sent     INT NOT NULL DEFAULT 0,
  emails_failed   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_incident_showtime (showtime_id),
  INDEX idx_incident_created (created_at),
  CONSTRAINT fk_incident_showtime FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
  CONSTRAINT fk_incident_reporter FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hoàn tác:
--   DROP TABLE showtime_incidents;
--   ALTER TABLE showtimes DROP COLUMN status;
