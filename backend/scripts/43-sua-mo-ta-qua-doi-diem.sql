-- ============================================================================
-- 43 — SỬA MÔ TẢ QUÀ ĐỔI ĐIỂM CHO KHỚP SỐ ĐIỂM THẬT
-- ============================================================================
-- Mô tả hiển thị cho khách ghi một đằng, hệ thống trừ một nẻo:
--
--   Quà 1: mô tả "Đổi 150 điểm"  nhưng points_cost = 40
--   Quà 2: mô tả "Đổi 300 điểm"  nhưng points_cost = 80
--   Quà 3: mô tả "Đổi 600 điểm"  nhưng points_cost = 130
--
-- Khách đọc thấy cần 150 điểm nên tưởng chưa đủ điều kiện, trong khi thực tế
-- chỉ cần 40. Sửa MÔ TẢ theo số điểm thật (không đổi points_cost, vì đổi giá
-- sẽ làm lệch mọi tính toán và thống kê đã có).
-- ============================================================================

UPDATE point_rewards
SET description = 'Đổi 40 điểm lấy mã giảm 15.000đ cho đơn đặt vé bất kỳ'
WHERE id = 1;

UPDATE point_rewards
SET description = 'Đổi 80 điểm lấy mã giảm 10% (tối đa 30.000đ)'
WHERE id = 2;

UPDATE point_rewards
SET description = 'Đổi 130 điểm lấy mã giảm 50.000đ cho đơn đặt vé bất kỳ'
WHERE id = 3;
