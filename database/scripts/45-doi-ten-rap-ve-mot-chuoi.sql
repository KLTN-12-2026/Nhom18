-- ============================================================================
-- 45 — ĐƯA 3 RẠP VỀ CÙNG MỘT CHUỖI "CinemaGold"
-- ============================================================================
-- Đề tài là "hệ thống bán vé cho CHUỖI rạp chiếu phim" — chuỗi nghĩa là MỘT
-- thương hiệu, nhiều chi nhánh. Dữ liệu cũ đặt tên 3 rạp theo 3 thương hiệu
-- thật KHÁC NHAU (CGV, Lotte Cinema, Galaxy Cinema): vừa mâu thuẫn với khái
-- niệm chuỗi, vừa dùng tên thương mại của doanh nghiệp khác.
--
-- Đặt tên chi nhánh theo quy tắc "thương hiệu + khu vực" như các chuỗi thật.
-- Chỉ đổi TÊN — địa chỉ, phòng, suất chiếu, vé đều giữ nguyên (mọi bảng khác
-- tham chiếu rạp bằng cinema_id, không lưu bản sao tên rạp).
-- ============================================================================

UPDATE cinemas SET name = 'CinemaGold Vincom Sơn Trà' WHERE id = 1 AND name = 'Rạp CGV Vincom Đà Nẵng';
UPDATE cinemas SET name = 'CinemaGold Hải Châu'       WHERE id = 2 AND name = 'Lotte Cinema Đà Nẵng';
UPDATE cinemas SET name = 'CinemaGold Thanh Khê'      WHERE id = 3 AND name = 'Galaxy Cinema Đà Nẵng';

-- Hoàn tác:
--   UPDATE cinemas SET name = 'Rạp CGV Vincom Đà Nẵng' WHERE id = 1;
--   UPDATE cinemas SET name = 'Lotte Cinema Đà Nẵng'   WHERE id = 2;
--   UPDATE cinemas SET name = 'Galaxy Cinema Đà Nẵng'  WHERE id = 3;
