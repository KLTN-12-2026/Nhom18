-- ================================================================
-- MIGRATION 16: Cho phép thu hồi JWT (session invalidation) khi logout
-- ================================================================
-- Chạy: mysql -u root -p movie_booking < database/scripts/16-add-token-version.sql
--
-- JWT theo thiết kế là STATELESS — server không lưu danh sách token đang có
-- hiệu lực, nên trước đây "logout" chỉ là hành động phía FRONTEND (xoá token
-- khỏi sessionStorage), token vẫn còn nguyên giá trị sử dụng được suốt 7 ngày
-- (thời hạn JWT) nếu ai đó có được nó (token rò rỉ qua log/XSS/máy dùng
-- chung...). "Đăng xuất" trên máy đó không hề chặn được kẻ đang cầm token bị
-- rò rỉ tiếp tục dùng.
--
-- Thêm "token_version" — nhúng vào JWT lúc tạo, kiểm tra lại mỗi request lúc
-- verifyToken (so với giá trị hiện tại trong DB). Logout/đổi mật khẩu tăng
-- token_version lên 1 → MỌI token cũ (kể cả token bị rò rỉ) lập tức vô hiệu,
-- không cần lưu danh sách token đã thu hồi (blacklist) tốn kém.
-- ================================================================

ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0;

SELECT 'Migration 16 completed successfully' AS status;
