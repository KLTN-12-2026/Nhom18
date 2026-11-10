-- ============================================================================
-- 40 — ẢNH ĐỒ ĂN/NƯỚC UỐNG ĐÚNG SẢN PHẨM
-- ============================================================================
-- Ảnh combo trước đây trỏ tới Unsplash và PHẦN LỚN SAI SẢN PHẨM. Kiểm tra bằng
-- cách tải từng ảnh về xem tận mắt (15/09/2026):
--
--   Bắp Rang Bơ (M)  -> thùng KẸO Snickers, Mars, KitKat
--   Coca Cola (L)    -> BURGER và khoai tây chiên
--   Combo Solo       -> một quả TÁO
--   Combo Couple     -> BÁNH SNACK khoai tây
--   Pepsi (M)        -> lon SPRITE
--
-- Nay dùng ảnh đúng sản phẩm và LƯU TRONG DỰ ÁN (frontend/public/combos/)
-- thay vì gọi ra Unsplash — trang đồ ăn không còn phụ thuộc đường truyền,
-- quan trọng khi demo.
--
-- Các ảnh đã được xác minh bằng mắt trước khi đưa vào:
--   bap-rang.jpg  bắp rang bơ cận cảnh
--   bap-hop.jpg   bắp rang trong hộp giấy sọc đỏ trắng
--   coca.jpg      lon Coca-Cola trên đá
--   pepsi.jpg     lon Pepsi
--   7up.jpg       lon nước chanh ga màu xanh
--   snack.jpg     bánh quy
--
-- HẠN CHẾ ĐÃ BIẾT: ba combo dùng chung ảnh bắp rang vì ảnh "bắp + nước" đúng
-- nghĩa trên Unsplash đều là bản trả phí. Nếu có ảnh combo thật thì thay file
-- trong frontend/public/combos/ là xong, không cần sửa CSDL.
-- ============================================================================

UPDATE combos SET image_url = '/combos/bap-hop.jpg'  WHERE id = 1;   -- Combo Solo
UPDATE combos SET image_url = '/combos/bap-rang.jpg' WHERE id = 2;   -- Combo Couple
UPDATE combos SET image_url = '/combos/bap-hop.jpg'  WHERE id = 3;   -- Combo Family
UPDATE combos SET image_url = '/combos/bap-hop.jpg'  WHERE id = 4;   -- Bắp Rang Bơ (M)
UPDATE combos SET image_url = '/combos/bap-rang.jpg' WHERE id = 5;   -- Bắp Rang Bơ (L)
UPDATE combos SET image_url = '/combos/coca.jpg'     WHERE id = 6;   -- Coca Cola (M)
UPDATE combos SET image_url = '/combos/coca.jpg'     WHERE id = 7;   -- Coca Cola (L)
UPDATE combos SET image_url = '/combos/pepsi.jpg'    WHERE id = 8;   -- Pepsi (M)
UPDATE combos SET image_url = '/combos/7up.jpg'      WHERE id = 9;   -- 7Up (M)
UPDATE combos SET image_url = '/combos/snack.jpg'    WHERE id = 10;  -- Snack Mix
