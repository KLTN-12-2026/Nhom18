-- Lỗi logic nghiêm trọng phát hiện khi rà soát: UNIQUE KEY uq_showtime_seat
-- (showtime_id, seat_code) trên ticket_seats không hề tính đến trạng thái vé.
-- Ticket.cancelById()/cancelByAdmin() (models/Ticket.js) chỉ đổi
-- tickets.booking_status sang 'cancelled' và cộng lại showtimes.available_seats
-- — KHÔNG xoá hay cập nhật gì trên ticket_seats. Sau đó ai đặt lại đúng ghế đó
-- cho đúng suất chiếu đó sẽ pass được SeatLock.checkSeatsAvailable (đúng, vì
-- hàm này lọc theo booking_status IN ('confirmed','pending')) nhưng
-- INSERT INTO ticket_seats trong Ticket.bookWithTransaction lại ném
-- ER_DUP_ENTRY do dòng cũ (đã huỷ) vẫn còn chiếm unique key — lỗi này KHÔNG
-- được nhận diện là NO_SEATS_AVAILABLE nên rơi xuống catch chung, trả về 500
-- "Failed to book ticket". Kết quả: MỖI LẦN 1 vé bị huỷ (tự huỷ, admin huỷ,
-- hoặc job releaseStalePendingTickets tự động huỷ vé pending quá 20 phút —
-- xảy ra thường xuyên trong vận hành bình thường), đúng ghế đó bị khoá VĨNH
-- VIỄN không ai đặt lại được cho suất chiếu đó nữa, âm thầm co hẹp sức chứa.
--
-- Fix: thêm cột `status` mirror theo tickets.booking_status (chỉ có 2 giá trị
-- thực tế: 'confirmed'/'cancelled' — xem comment trong models/Ticket.js), và
-- cột sinh (generated, STORED) active_seat_key chỉ có giá trị khi
-- status='confirmed', NULL khi đã huỷ. MySQL coi NULL trong unique index là
-- phân biệt với mọi giá trị khác (kể cả NULL khác) — nên nhiều dòng lịch sử
-- đã huỷ có thể cùng NULL mà không đụng độ, trong khi 2 booking ACTIVE cùng 1
-- ghế/suất chiếu vẫn bị chặn atomic ở tầng MySQL y hệt constraint cũ (không
-- làm yếu đi việc chống double-booking, chỉ sửa đúng phần bị rò).

ALTER TABLE ticket_seats
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'confirmed' AFTER price;

-- Backfill: đồng bộ theo trạng thái THẬT của vé cha, để các ghế thuộc vé đã
-- huỷ từ trước migration này cũng được giải phóng ngay, không phải đợi huỷ lại.
UPDATE ticket_seats ts
JOIN tickets t ON t.id = ts.ticket_id
SET ts.status = t.booking_status
WHERE ts.status <> t.booking_status;

ALTER TABLE ticket_seats
  ADD COLUMN active_seat_key VARCHAR(40)
    GENERATED ALWAYS AS (
      CASE WHEN status = 'confirmed' THEN CONCAT(showtime_id, ':', seat_code) ELSE NULL END
    ) STORED
    AFTER status;

ALTER TABLE ticket_seats DROP INDEX uq_showtime_seat;
ALTER TABLE ticket_seats ADD UNIQUE KEY uq_active_seat (active_seat_key);
