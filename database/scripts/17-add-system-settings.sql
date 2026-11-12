-- Bảng cấu hình toàn hệ thống (1 dòng duy nhất, id=1) — trước đây trang "Cài
-- đặt hệ thống" của admin chỉ trả về object tĩnh và không lưu gì, các công tắc
-- maintenance_mode/booking_enabled không có tác dụng thật. Bảng này được
-- backend/services/systemSettings.service.js tự tạo (CREATE TABLE IF NOT
-- EXISTS) ở lần gọi đầu tiên nên script này chỉ cần chạy nếu muốn khởi tạo
-- trước qua migration thay vì chờ request đầu tiên.

CREATE TABLE IF NOT EXISTS system_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(255) NOT NULL DEFAULT 'CinemaGold',
  site_description VARCHAR(500) NOT NULL DEFAULT 'Hệ thống đặt vé xem phim trực tuyến',
  maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
  booking_enabled TINYINT(1) NOT NULL DEFAULT 1,
  max_seats_per_booking TINYINT UNSIGNED NOT NULL DEFAULT 10,
  contact_email VARCHAR(255) NOT NULL DEFAULT 'support@cinemagold.com',
  support_phone VARCHAR(50) NOT NULL DEFAULT '1900-0000',
  terms_conditions TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO system_settings (id) VALUES (1);
