-- ============================================================================
-- 47 — MENU ĐỒ ĂN THỨC UỐNG RIÊNG CHO TỪNG RẠP
-- ============================================================================
-- Migration 46 đã tách TỒN KHO theo từng rạp, nhưng DANH MỤC món vẫn dùng
-- chung: rạp nào cũng đúng 10 món y hệt nhau. Thực tế mỗi chi nhánh có món
-- riêng (quầy rạp Sơn Trà có gà rán, rạp Thanh Khê có trà sữa...).
--
-- Cách làm: thêm cột cinema_id vào `combos`.
--    cinema_id IS NULL  -> món BÁN Ở MỌI RẠP (menu chung của chuỗi)
--    cinema_id = <id>   -> món CHỈ CÓ ở rạp đó
--
-- Menu của một rạp = món chung + món riêng của rạp đó. Giữ NULL cho 10 món
-- hiện có nên không rạp nào mất món đang bán.
-- ============================================================================

ALTER TABLE combos
  ADD COLUMN cinema_id INT NULL COMMENT 'NULL = bán ở mọi rạp; có giá trị = món riêng của rạp đó' AFTER category,
  ADD CONSTRAINT fk_combo_rap FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE;

CREATE INDEX idx_combos_cinema ON combos (cinema_id);

-- Hoàn tác:
--   ALTER TABLE combos DROP FOREIGN KEY fk_combo_rap;
--   DROP INDEX idx_combos_cinema ON combos;
--   ALTER TABLE combos DROP COLUMN cinema_id;
