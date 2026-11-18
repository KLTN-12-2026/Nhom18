-- ============================================================================
-- 32 — GỠ CHỈ MỤC THỪA TRÊN BẢNG showtimes
-- ============================================================================
--
-- showtimes là bảng LỚN NHẤT hệ thống (3.393 dòng) và cũng là bảng bị GHI
-- nhiều nhất: mỗi lần chạy bộ sinh lịch tuần chèn hàng trăm dòng một lúc.
-- Trước migration này bảng có 7 chỉ mục, tổng dung lượng chỉ mục lớn gấp
-- ~2,1 lần dung lượng dữ liệu thật — mỗi lệnh ghi phải cập nhật cả 7 cây B-tree.
--
-- idx_showtimes_room (room_id) là TIỀN TỐ của uq_showtimes_room_slot
-- (room_id, show_date, show_time) — chỉ mục ghép dùng được cho mọi truy vấn chỉ
-- lọc theo room_id, nên chỉ mục ngắn hơn không phục vụ thêm truy vấn nào cả.
-- Nó chỉ làm chậm ghi và tốn dung lượng.
--
-- LƯU Ý về các chỉ mục KHÁC trông như "vô dụng": thống kê độ phân biệt
-- (CARDINALITY) của MySQL bằng 0 hoặc 1 ở nhiều chỉ mục khác trong CSDL này là
-- do BẢNG ĐANG RỖNG hoặc rất ít dòng (vd voucher_redemptions có 0 dòng), KHÔNG
-- phải do chỉ mục sai. Không được gỡ chúng dựa trên con số đó.
-- ============================================================================

DROP INDEX idx_showtimes_room ON showtimes;

-- Gỡ bỏ nếu cần:
--   ALTER TABLE showtimes ADD INDEX idx_showtimes_room (room_id);
-- ============================================================================
