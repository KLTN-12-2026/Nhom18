-- ============================================================================
-- 39 — SỨC CHỨA PHÒNG CHIẾU THEO THỰC TẾ
-- ============================================================================
-- Ba vấn đề được sửa:
--
-- 1. 5/10 phòng khai báo số ghế KHÁC sơ đồ ghế thật. Sơ đồ được sinh theo bậc
--    sức chứa (backend/config/seatTiers.config.js), nên phòng IMAX ghi 200 ghế
--    chỉ vẽ ra 156 ghế — 44 ghế "ma" mà available_seats vẫn đếm nhưng khách
--    không bao giờ chọn được. Nay MỌI phòng có total_seats = đúng số ghế vẽ ra.
--
-- 2. Phòng VIP đang TO HƠN phòng thường (150/130/140 so với 100/120), ngược với
--    thực tế: ghế ngả chiếm nhiều diện tích hơn nên phòng Premium của
--    CGV/Lotte/Galaxy luôn ít ghế hơn phòng thường. Hạ cả 3 phòng VIP về 80.
--
-- 3. cinemas.total_seats = 80 cho cả 3 rạp — sai hoàn toàn (tổng phòng là
--    570/330/360). Tính lại từ tổng sức chứa các phòng.
--
-- Bậc sơ đồ ghế sau migration:
--    60 =  6 hàng x 10   |  80 =  8 hàng x 10  |  100 = 10 hàng x 10
--   120 = 10 hàng x 12   | 140 = 10 hàng x 14  |  156 = 12 hàng x 13
--   224 = 14 hàng x 16  (IMAX — bậc lớn nhất, thêm mới)
--
-- An toàn dữ liệu: tại thời điểm chạy chỉ có 1 suất chiếu tương lai đã bán ghế
-- (suất 20165, phòng 4, ghế D11/D12/E11/F11/F12). Phòng 4 được MỞ RỘNG nên cả
-- 5 ghế vẫn nằm trong sơ đồ mới. Suất đã chiếu giữ nguyên total_seats lịch sử.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sức chứa phòng
-- ---------------------------------------------------------------------------
-- CGV Vincom Đà Nẵng
UPDATE rooms SET total_seats = 120 WHERE id = 1;   -- Phòng 1 standard (giữ nguyên)
UPDATE rooms SET total_seats = 100 WHERE id = 2;   -- Phòng 2 standard (giữ nguyên)
UPDATE rooms SET total_seats =  80 WHERE id = 3;   -- Phòng 3 VIP    150 -> 80
UPDATE rooms SET total_seats = 224 WHERE id = 4;   -- Phòng 4 IMAX   200 -> 224

-- Lotte Cinema Đà Nẵng
UPDATE rooms SET total_seats = 120 WHERE id = 5;   -- Phòng A standard 110 -> 120
UPDATE rooms SET total_seats =  80 WHERE id = 6;   -- Phòng B VIP      130 -> 80
UPDATE rooms SET total_seats = 100 WHERE id = 7;   -- Phòng C 4DX       90 -> 100

-- Galaxy Cinema Đà Nẵng
UPDATE rooms SET total_seats = 100 WHERE id = 8;   -- Phòng 1 standard (giữ nguyên)
UPDATE rooms SET total_seats = 120 WHERE id = 9;   -- Phòng 2 standard (giữ nguyên)
UPDATE rooms SET total_seats =  80 WHERE id = 10;  -- Phòng 3 VIP      140 -> 80

-- ---------------------------------------------------------------------------
-- 2. Mô tả phòng cho khớp loại phòng
-- ---------------------------------------------------------------------------
UPDATE rooms SET features = '["Ghế ngả Premium", "Dolby Atmos", "3D"]'
  WHERE room_type = 'vip';
UPDATE rooms SET features = '["IMAX", "Màn hình khổ lớn", "Dolby Atmos", "3D"]'
  WHERE room_type = 'imax';
UPDATE rooms SET features = '["4DX", "Ghế chuyển động", "Hiệu ứng môi trường", "3D"]'
  WHERE room_type = '4dx';

-- ---------------------------------------------------------------------------
-- 3. Suất chiếu TƯƠNG LAI: đồng bộ total_seats và available_seats
--    available_seats = sức chứa mới − số ghế đã bán (chưa huỷ) của chính suất đó
-- ---------------------------------------------------------------------------
UPDATE showtimes s
JOIN rooms r ON r.id = s.room_id
SET s.total_seats = r.total_seats,
    s.available_seats = r.total_seats - (
      SELECT COUNT(*) FROM ticket_seats ts
      WHERE ts.showtime_id = s.id AND ts.status <> 'cancelled'
    )
WHERE s.show_date >= CURDATE();

-- ---------------------------------------------------------------------------
-- 4. Tổng sức chứa của rạp = tổng các phòng
-- ---------------------------------------------------------------------------
UPDATE cinemas c
SET c.total_seats = (SELECT COALESCE(SUM(r.total_seats), 0) FROM rooms r WHERE r.cinema_id = c.id);
