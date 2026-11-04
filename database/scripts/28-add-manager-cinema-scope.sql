-- PHÂN QUYỀN THEO CHI NHÁNH cho vai trò 'cinema_manager'.
--
-- Trước đây vai trò này tồn tại trong ENUM users.role nhưng KHÔNG hề gắn với
-- rạp nào: bảng users không có cột cinema_id, cũng không có bảng nối
-- quản lý ↔ rạp, và không một truy vấn nào lọc dữ liệu theo rạp của người
-- đăng nhập. Hệ quả: "quản lý rạp" thực chất là quản lý TOÀN BỘ chuỗi rạp —
-- xem được doanh thu mọi rạp, sửa/xoá suất chiếu của mọi rạp, huỷ vé của bất
-- kỳ ai, và (nguy hiểm nhất) XOÁ ĐƯỢC CẢ RẠP của chi nhánh khác, vì các route
-- đó chỉ yêu cầu requireStaff.
--
-- Cột này gắn mỗi quản lý vào ĐÚNG MỘT rạp. Quy ước:
--   - role='cinema_manager'  -> cinema_id BẮT BUỘC có giá trị
--   - role='admin'/'user'    -> cinema_id để NULL (không giới hạn / không dùng)
-- Ràng buộc "bắt buộc với quản lý" được kiểm tra ở tầng ứng dụng
-- (adminController.updateUserRole) thay vì CHECK constraint, để còn trả về
-- thông báo lỗi tiếng Việt rõ ràng cho admin thay vì lỗi SQL khó hiểu.
--
-- ON DELETE SET NULL: xoá một rạp thì quản lý của rạp đó KHÔNG bị xoá theo —
-- tài khoản vẫn còn, chỉ mất phạm vi quản lý và admin gán lại rạp khác.
-- (Dùng SET NULL thay vì CASCADE để không bao giờ mất tài khoản người thật.)

ALTER TABLE users
  ADD COLUMN cinema_id INT DEFAULT NULL AFTER role,
  ADD CONSTRAINT fk_user_managed_cinema
    FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE SET NULL;

-- Truy vấn "lấy phạm vi rạp của người đang đăng nhập" chạy ở MỌI request của
-- quản lý (middleware), nên đánh index để không phải quét bảng users.
CREATE INDEX idx_users_cinema ON users (cinema_id);
