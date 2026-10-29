-- ================================================================
-- MIGRATION 11: Chống brute-force mã xác thực đăng ký (6 số)
-- ================================================================
-- Chạy: mysql -u root -p movie_booking < database/scripts/11-add-registration-code-attempts.sql
--
-- Trước đây: registration_codes chỉ có expires_at, không giới hạn số lần
-- thử sai -> kẻ tấn công có thể đoán mã 6 số (1 triệu khả năng) miễn là
-- vượt qua được rate-limit theo IP. Thêm cột "attempts" để khoá mã sau
-- một số lần thử sai nhất định, bất kể request đến từ IP nào.
--
-- FIX 2026: bảng registration_codes (dùng bởi backend/models/RegistrationCode.js
-- cho toàn bộ luồng gửi/xác minh mã đăng ký) chưa từng có CREATE TABLE ở bất
-- kỳ migration nào — file này trước đây chỉ ALTER TABLE, ngầm giả định bảng
-- đã tồn tại sẵn. Trên DB cài mới hoàn toàn từ đầu, ALTER TABLE này sẽ lỗi
-- "table doesn't exist" ngay, chặn đứng toàn bộ đăng ký tài khoản mới — cùng
-- loại lỗi với sự cố ticket_combos đã sửa trước đó. Thêm CREATE TABLE IF NOT
-- EXISTS trước khi ALTER để migration tự đủ, không phụ thuộc bảng đã có sẵn.
-- ================================================================

CREATE TABLE IF NOT EXISTS registration_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE registration_codes
  ADD COLUMN attempts INT NOT NULL DEFAULT 0;

SELECT 'Migration 11 completed successfully' AS status;
