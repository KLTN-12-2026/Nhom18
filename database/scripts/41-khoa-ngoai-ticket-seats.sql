-- ============================================================================
-- 41 — KHOÁ NGOẠI CHO ticket_seats
-- ============================================================================
-- ticket_seats là bảng QUAN TRỌNG NHẤT về chống đặt trùng ghế, nhưng từ đầu
-- chỉ có PRIMARY + UNIQUE, KHÔNG có một khoá ngoại nào tới tickets hay
-- showtimes. Cơ sở dữ liệu vì thế không tự chặn được dòng "mồ côi".
--
-- Thực tế đã tích tụ 14 dòng trỏ tới những vé đã bị xoá khỏi bảng tickets
-- (phát hiện 16/09/2026):
--     id 173-182 -> ticket_id 133..138   (12/08/2026)
--     id 486-489 -> ticket_id 171, 172   (15/09/2026)
--
-- Cả 14 dòng đều status='cancelled' nên KHÔNG chặn ghế của ai — không ảnh
-- hưởng gì tới người dùng. Nhưng nếu một dòng mồ côi có status='confirmed',
-- nó sẽ khoá ghế đó vĩnh viễn mà không truy ra được chủ, vì vé không còn tồn
-- tại. Khoá ngoại sinh ra chính là để ngăn việc đó.
--
-- AN TOÀN: đã rà toàn bộ mã nguồn (.js và .sql) — KHÔNG có chỗ nào chạy
-- "DELETE FROM tickets", nên thêm ràng buộc không làm hỏng luồng nào đang
-- chạy. Huỷ vé trong hệ thống là đổi booking_status, không xoá dòng.
--
-- Hai khoá ngoại có hành vi KHÁC NHAU, và đó là bắt buộc chứ không phải tuỳ ý:
--
--   ticket_id   -> ON DELETE CASCADE. Xoá vé thì các dòng ghế của vé đó tự đi
--                  theo, không nằm lại làm rác như 14 dòng nói trên.
--
--   showtime_id -> KHÔNG có CASCADE. MySQL từ chối CASCADE trên cột mà một cột
--                  SINH TỰ ĐỘNG đang tham chiếu tới, và ticket_seats có đúng
--                  trường hợp đó: cột `active_seat_key` (STORED GENERATED) được
--                  tính từ `showtime_id` + `seat_code`. Thử CASCADE sẽ nhận lỗi
--                  1215 "Cannot add foreign key constraint" mà không nói lý do.
--                  Để mặc định (RESTRICT) lại hợp lý hơn: không cho xoá một
--                  suất chiếu đang có ghế đã bán.
-- ============================================================================

-- 1. Dọn 14 dòng mồ côi (bắt buộc, nếu không thì không thêm được ràng buộc)
DELETE ts FROM ticket_seats ts
LEFT JOIN tickets t ON t.id = ts.ticket_id
WHERE t.id IS NULL;

DELETE ts FROM ticket_seats ts
LEFT JOIN showtimes s ON s.id = ts.showtime_id
WHERE s.id IS NULL;

-- 2. Thêm khoá ngoại
ALTER TABLE ticket_seats
  ADD CONSTRAINT fk_ticket_seats_ticket
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

ALTER TABLE ticket_seats
  ADD CONSTRAINT fk_ticket_seats_showtime
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id);

-- ---------------------------------------------------------------------------
-- 3. Khoá ngoại còn thiếu: rooms -> cinemas
-- ---------------------------------------------------------------------------
-- Bảng `rooms` (đang dùng) KHÔNG có khoá ngoại tới `cinemas`, trong khi bảng
-- chết `_deprecated_unused_cinema_rooms` lại có — dấu vết của lần đổi bảng cũ
-- sang bảng mới mà quên mang ràng buộc theo. Dữ liệu hiện sạch (0 phòng mồ
-- côi) nên thêm được ngay.
ALTER TABLE rooms
  ADD CONSTRAINT fk_rooms_cinema
  FOREIGN KEY (cinema_id) REFERENCES cinemas(id);
