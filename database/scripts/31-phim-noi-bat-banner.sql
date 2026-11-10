-- ============================================================================
-- 31 — PHIM NỔI BẬT (BANNER TRANG CHỦ) THÀNH DỮ LIỆU THẬT
-- ============================================================================
--
-- VẤN ĐỀ: 5 phim trong banner lớn ở trang chủ được GHIM CỨNG bằng mảng ID
-- trong mã nguồn frontend (components/hero-carousel.tsx: [21, 54, 70, 76, 74]).
-- Hệ quả:
--   1. Muốn đổi phim banner phải sửa mã nguồn rồi build lại toàn bộ frontend.
--   2. Backend KHÔNG THỂ biết banner đang chiếu phim nào, nên bộ sinh lịch
--      chiếu tự động không có cách nào ưu tiên đúng 5 phim đó.
--   3. Nếu một phim trong danh sách bị xoá hoặc chuyển sang "ngừng chiếu",
--      banner lặng lẽ hiển thị thiếu mà không ai biết.
--
-- CÁCH SỬA: đưa "nổi bật" thành thuộc tính của phim trong CSDL. Cả banner lẫn
-- bộ sinh lịch đọc chung MỘT nguồn.
--
-- featured_order:
--   NULL = phim thường
--   1..N = vị trí trong banner (1 hiện đầu tiên)
-- ============================================================================

ALTER TABLE movies
  ADD COLUMN featured_order TINYINT UNSIGNED NULL
    COMMENT 'Vị trí trong banner trang chủ (1 = đầu tiên). NULL = không nổi bật.';

-- Chỉ mục lọc nhanh danh sách nổi bật (số phim nổi bật rất ít so với tổng số
-- phim nên chỉ mục này chọn lọc rất tốt).
CREATE INDEX idx_movies_featured ON movies (featured_order);

-- Giữ nguyên đúng 5 phim và ĐÚNG THỨ TỰ đang hiển thị trên banner hiện tại,
-- để giao diện không đổi sau khi chuyển sang đọc từ CSDL.
UPDATE movies SET featured_order = 1 WHERE id = 21;  -- Joker
UPDATE movies SET featured_order = 2 WHERE id = 54;  -- John Wick
UPDATE movies SET featured_order = 3 WHERE id = 70;  -- Oppenheimer
UPDATE movies SET featured_order = 4 WHERE id = 76;  -- Doctor Strange in the Multiverse of Madness
UPDATE movies SET featured_order = 5 WHERE id = 74;  -- Spider-Man: Brand New Day

-- Đổi phim banner về sau chỉ cần chạy UPDATE, không phải build lại frontend:
--   UPDATE movies SET featured_order = NULL WHERE featured_order IS NOT NULL;
--   UPDATE movies SET featured_order = 1 WHERE id = <id phim mới>;

-- Gỡ bỏ nếu cần:
--   DROP INDEX idx_movies_featured ON movies;
--   ALTER TABLE movies DROP COLUMN featured_order;
-- ============================================================================
