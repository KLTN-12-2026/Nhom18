-- ================================================================
-- MIGRATION 12: Lưu tên thật của người dùng (full_name)
-- ================================================================
-- Chạy: mysql -u root -p movie_booking < database/scripts/12-add-user-fullname.sql
--
-- Trước đây: form đăng ký thu thập "Họ và tên đệm" + "Tên", frontend gộp
-- thành full_name gửi lên backend, middleware validate hợp lệ, nhưng
-- authController.register không đọc field này và bảng users cũng không
-- có cột để lưu -> tên thật người dùng nhập bị vứt bỏ hoàn toàn, toàn hệ
-- thống hiển thị username tự sinh từ email thay vì tên thật.
-- ================================================================

ALTER TABLE users
  ADD COLUMN full_name VARCHAR(150) NULL AFTER username;

SELECT 'Migration 12 completed successfully' AS status;
