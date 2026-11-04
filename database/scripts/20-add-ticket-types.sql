-- Phân loại giá vé theo đối tượng (người lớn/trẻ em/sinh viên/cao tuổi) —
-- trước đây mọi ghế trong 1 suất chiếu đều tính đúng 1 giá duy nhất, không
-- thực tế so với rạp chiếu phim thật (CGV/Lotte/Galaxy đều có giá ưu đãi
-- riêng cho trẻ em/sinh viên/người cao tuổi).

ALTER TABLE ticket_seats
  ADD COLUMN ticket_type ENUM('adult', 'student', 'child', 'senior') NOT NULL DEFAULT 'adult' AFTER seat_code,
  ADD COLUMN price DECIMAL(10,2) DEFAULT NULL AFTER ticket_type;
