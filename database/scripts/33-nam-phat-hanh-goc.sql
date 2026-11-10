-- ============================================================================
-- 33 — NĂM PHÁT HÀNH GỐC CỦA PHIM (original_year)
-- ============================================================================
--
-- VẤN ĐỀ: giao diện lấy năm của phim từ release_date, nhưng cột này đang được
-- dùng làm NGÀY KHỞI CHIẾU TẠI RẠP — bộ tự chuyển trạng thái phim
-- (movieLifecycle.service) và bộ sinh lịch chiếu đều dựa vào nó. 17 phim cũ
-- được xếp khởi chiếu lại năm 2026 nên banner/trang chi tiết hiện sai năm
-- (vd John Wick hiện 2026 thay vì 2014).
--
-- KHÔNG sửa release_date: đổi Suzume/Your Name (đang "Sắp chiếu" 2026) về
-- 2022/2016 sẽ khiến chúng lập tức bị chuyển sang "Đang chiếu".
--
-- CÁCH SỬA: tách hai ý nghĩa ra hai cột, giống cách rạp thật ghi năm cho phim
-- tái chiếu:
--   release_date  = ngày khởi chiếu tại rạp (giữ nguyên, điều khiển lịch chiếu)
--   original_year = năm phát hành gốc (chỉ để hiển thị)
-- ============================================================================

ALTER TABLE movies
  ADD COLUMN original_year SMALLINT UNSIGNED NULL
    COMMENT 'Năm phát hành gốc (hiển thị). NULL = lấy năm của release_date.'
    AFTER release_date;

UPDATE movies SET original_year = CASE id
  WHEN 1   THEN 2012  -- The Dark Knight Returns
  WHEN 16  THEN 2003  -- The Lord of the Rings: The Return of the King
  WHEN 17  THEN 2014  -- Interstellar
  WHEN 21  THEN 2019  -- Joker
  WHEN 22  THEN 1997  -- Titanic
  WHEN 23  THEN 2012  -- The Avengers
  WHEN 53  THEN 2018  -- Venom
  WHEN 54  THEN 2014  -- John Wick
  WHEN 55  THEN 2007  -- Transformers
  WHEN 59  THEN 2024  -- Dune: Part Two
  WHEN 62  THEN 2024  -- Godzilla x Kong: The New Empire
  WHEN 68  THEN 2024  -- Moana 2
  WHEN 69  THEN 2024  -- Venom: The Last Dance
  WHEN 70  THEN 2023  -- Oppenheimer
  WHEN 72  THEN 2023  -- The Super Mario Bros. Movie
  WHEN 73  THEN 2023  -- Guardians of the Galaxy Vol. 3
  WHEN 74  THEN 2023  -- Spider-Man: Across the Spider-Verse
  WHEN 76  THEN 2022  -- Doctor Strange in the Multiverse of Madness
  WHEN 77  THEN 2013  -- Now You See Me
  WHEN 84  THEN 2001  -- Harry Potter and the Philosopher's Stone
  WHEN 88  THEN 2022  -- Black Panther: Wakanda Forever
  WHEN 89  THEN 2023  -- Aquaman and the Lost Kingdom
  WHEN 91  THEN 2022  -- Suzume
  WHEN 92  THEN 2016  -- Your Name
  WHEN 94  THEN 2002  -- Harry Potter and the Chamber of Secrets
  WHEN 95  THEN 2004  -- Harry Potter and the Prisoner of Azkaban
  WHEN 96  THEN 2005  -- Harry Potter and the Goblet of Fire
  WHEN 97  THEN 2007  -- Harry Potter and the Order of the Phoenix
  WHEN 98  THEN 2009  -- Harry Potter and the Half-Blood Prince
  WHEN 99  THEN 2010  -- Harry Potter and the Deathly Hallows – Part 1
  WHEN 100 THEN 2011  -- Harry Potter and the Deathly Hallows – Part 2
  WHEN 106 THEN 2026  -- Spider-Man: Brand New Day (công chiếu 31/07/2026)
  WHEN 107 THEN 2019  -- Avengers: Endgame
  WHEN 108 THEN 2018  -- Avengers: Infinity War
  WHEN 109 THEN 2021  -- Spider-Man: No Way Home
  WHEN 110 THEN 2024  -- Deadpool & Wolverine
  WHEN 111 THEN 2025  -- Thunderbolts*
  WHEN 112 THEN 2025  -- The Fantastic Four: First Steps
  WHEN 113 THEN 2025  -- Superman
  WHEN 114 THEN 2025  -- Jurassic World Rebirth
  WHEN 115 THEN 2025  -- Avatar: Fire and Ash
  ELSE original_year
END;

-- Gỡ bỏ nếu cần:
--   ALTER TABLE movies DROP COLUMN original_year;
-- ============================================================================
