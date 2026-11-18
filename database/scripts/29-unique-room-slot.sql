-- ============================================================================
-- 29 — MỘT PHÒNG KHÔNG THỂ CÓ HAI SUẤT CHIẾU CÙNG THỜI ĐIỂM BẮT ĐẦU
-- ============================================================================
--
-- VÌ SAO CẦN Ở TẦNG DATABASE, dù ứng dụng đã kiểm tra (utils/showtimeValidation):
-- kiểm tra ở tầng ứng dụng là "đọc rồi mới ghi" — hai request tạo suất chiếu
-- chạy song song đều ĐỌC thấy phòng còn trống trước khi bất kỳ ai kịp GHI, nên
-- cả hai cùng vượt qua và cùng chèn. Đây là đua (race condition) kinh điển, chỉ
-- ràng buộc trong DB mới chặn được vì nó là điểm ghi duy nhất.
--
-- GIỚI HẠN CỦA RÀNG BUỘC NÀY: nó chỉ chặn TRÙNG KHÍT giờ bắt đầu. Hai suất
-- 10:00 và 10:30 trong cùng phòng vẫn chồng lên nhau về mặt vật lý (phim dài
-- 2 tiếng) nhưng KHÔNG vi phạm UNIQUE. Việc chống chồng lấn theo THỜI LƯỢNG
-- vẫn do validateShowtimeSlot đảm nhiệm — ràng buộc này là lớp phòng thủ cuối,
-- không thay thế lớp đó.
--
-- room_id NULL: MySQL cho phép nhiều dòng cùng NULL trong UNIQUE index, nên các
-- suất chiếu chưa gán phòng (nếu còn) không bị ảnh hưởng.
--
-- ĐIỀU KIỆN CHẠY: dữ liệu phải không còn dòng trùng khít. Câu SELECT ngay dưới
-- kiểm tra trước — nếu trả về dòng nào thì xử lý hết rồi mới chạy ALTER TABLE.
-- ============================================================================

-- Bước 1 — kiểm tra trước (phải trả về 0 dòng thì mới chạy tiếp)
SELECT room_id, show_date, show_time, COUNT(*) AS so_suat
FROM showtimes
WHERE room_id IS NOT NULL
GROUP BY room_id, show_date, show_time
HAVING COUNT(*) > 1;

-- Bước 2 — thêm ràng buộc
ALTER TABLE showtimes
  ADD CONSTRAINT uq_showtimes_room_slot UNIQUE (room_id, show_date, show_time);

-- Gỡ bỏ nếu cần:
-- ALTER TABLE showtimes DROP INDEX uq_showtimes_room_slot;
