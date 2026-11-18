-- ================================================================
-- MIGRATION 15: Chống brute-force mã đặt lại mật khẩu (6 số)
-- ================================================================
-- Chạy: mysql -u root -p movie_booking < database/scripts/15-add-reset-code-attempts.sql
--
-- users.reset_code chỉ có reset_expires (10 phút), không giới hạn số lần thử
-- sai — cùng lỗ hổng đã sửa cho registration_codes ở migration 11 (chống đoán
-- mã 6 số/1 triệu khả năng bất kể request đến từ IP nào, rate-limit theo IP
-- một mình không đủ). Thêm cột "reset_attempts", khoá mã sau 1 số lần thử sai
-- nhất định, và tự reset về 0 mỗi khi gửi mã mới (saveResetCode).
-- ================================================================

-- LƯU Ý: "ADD COLUMN IF NOT EXISTS" (dùng ở vài migration cũ, vd 09) thực ra
-- KHÔNG chạy được trên môi trường MySQL 8.0 thực tế của dự án (lỗi cú pháp
-- ngay cả khi cột chưa tồn tại) — đã verify trực tiếp. Dùng ADD COLUMN thường;
-- script này chỉ chạy 1 lần nên không cần idempotent ở mức SQL.
ALTER TABLE users
  ADD COLUMN reset_attempts INT NOT NULL DEFAULT 0;

SELECT 'Migration 15 completed successfully' AS status;
