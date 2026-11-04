-- ============================================================================
-- 42 — SỬA RÀNG BUỘC KHIẾN KHÔNG AI ĐỔI ĐIỂM ĐƯỢC NỮA
-- ============================================================================
-- TRIỆU CHỨNG: bấm "Đổi điểm" luôn nhận lỗi 500 "Không thể đổi điểm", dù tài
-- khoản thừa điểm.
--
-- NGUYÊN NHÂN: bảng point_transactions có ràng buộc
--     UNIQUE KEY uq_point_earn_source (type, reference_type, reference_id)
-- Ràng buộc này sinh ra để chống CỘNG ĐIỂM TRÙNG: khi cổng thanh toán gọi lại
-- webhook nhiều lần cho cùng một vé, dòng 'earn' thứ hai bị chặn. Ở đó
-- reference_id = mã VÉ nên mỗi vé một khoá — hoàn toàn đúng.
--
-- Nhưng dòng ĐỔI ĐIỂM lại dùng reference_id = mã QUÀ (1, 2, 3) — giống nhau
-- với MỌI người dùng. Hệ quả: người đầu tiên đổi quà số 1 chiếm luôn khoá
-- 'redeem-reward-1', và từ đó TẤT CẢ mọi người đều không đổi được quà đó nữa.
--
-- Thực tế đã xảy ra đúng như vậy:
--     quà 1 — user 16 đổi ngày 06/09  -> khoá
--     quà 2 — user 16 đổi ngày 06/09  -> khoá
--     quà 3 — user 32 đổi ngày 15/09  -> khoá
-- Toàn bộ 3 phần quà của hệ thống đều đã chết.
--
-- CÁCH SỬA: giữ nguyên tác dụng chống cộng điểm trùng, nhưng CHỈ áp cho dòng
-- 'earn' và 'revoke' (nơi reference_id là mã vé, thật sự duy nhất). Dòng
-- 'redeem' không tham gia ràng buộc nữa.
--
-- Dùng cột SINH TỰ ĐỘNG trả về NULL cho dòng 'redeem' — MySQL cho phép nhiều
-- NULL trùng nhau trong UNIQUE, nên đổi điểm bao nhiêu lần cũng được. Đây đúng
-- kỹ thuật đã dùng thành công ở ticket_seats.active_seat_key.
-- ============================================================================

ALTER TABLE point_transactions
  DROP INDEX uq_point_earn_source;

ALTER TABLE point_transactions
  ADD COLUMN khoa_chong_cong_trung VARCHAR(80)
    GENERATED ALWAYS AS (
      CASE
        WHEN type IN ('earn', 'revoke')
             AND reference_type IS NOT NULL
             AND reference_id IS NOT NULL
        THEN CONCAT(type, ':', reference_type, ':', reference_id)
        ELSE NULL
      END
    ) STORED;

ALTER TABLE point_transactions
  ADD UNIQUE KEY uq_point_earn_source (khoa_chong_cong_trung);
