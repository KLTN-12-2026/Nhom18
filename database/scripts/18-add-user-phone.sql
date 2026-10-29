-- Cột `phone` đã được định nghĩa trong 01-create-tables.sql (dòng 42) nhưng
-- DB đang chạy thực tế KHÔNG có cột này — script gốc rõ ràng đã được sửa
-- thêm dòng này SAU KHI database dev đã được tạo từ 1 phiên bản cũ hơn, và
-- chưa ai chạy lại để đồng bộ. Hậu quả: toàn bộ code (đăng ký, cập nhật hồ
-- sơ) đọc/ghi `phone` đều bị bỏ qua âm thầm hoặc lỗi SQL tuỳ chỗ.
-- Dùng cú pháp an toàn chạy lại nhiều lần (bỏ qua nếu cột đã tồn tại), theo
-- đúng pattern đã dùng ở 05-add-rooms.sql cho cùng loại thay đổi.

ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL;
