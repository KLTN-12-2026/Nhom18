-- Hệ thống mã giảm giá/voucher — trước đây web không có bất kỳ cơ chế khuyến
-- mãi nào (mọi vé bán đúng giá niêm yết), không thực tế so với rạp chiếu phim
-- thật (CGV/Lotte/Galaxy đều có mã giảm giá/ưu đãi thành viên định kỳ).

CREATE TABLE IF NOT EXISTS vouchers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  -- Trần giảm giá tối đa cho loại 'percent' (vd giảm 20% nhưng tối đa 50k) —
  -- không áp trần cho loại 'fixed'.
  max_discount_amount DECIMAL(10,2) DEFAULT NULL,
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- Tổng số lượt được dùng trên TOÀN HỆ THỐNG, NULL = không giới hạn.
  usage_limit INT DEFAULT NULL,
  used_count INT NOT NULL DEFAULT 0,
  -- Số lượt 1 user được dùng MÃ NÀY, NULL = không giới hạn riêng cho user.
  per_user_limit INT DEFAULT 1,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lịch sử áp dụng — chặn 1 user dùng cùng 1 mã nhiều lần vượt per_user_limit,
-- và cho phép tra cứu vé nào đã dùng mã nào.
CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  voucher_id INT NOT NULL,
  user_id INT NOT NULL,
  ticket_id INT DEFAULT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  INDEX idx_voucher_redemptions_voucher_user (voucher_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tickets
  ADD COLUMN voucher_code VARCHAR(30) DEFAULT NULL AFTER combo_total,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER voucher_code;

-- Vài mã mẫu để test/demo ngay sau khi chạy migration.
INSERT INTO vouchers (code, description, discount_type, discount_value, max_discount_amount, min_order_amount, usage_limit, per_user_limit, valid_from, valid_until, is_active)
VALUES
  ('CHAOMUNG10', 'Giảm 10% cho đơn hàng đầu tiên (tối đa 30.000đ)', 'percent', 10, 30000, 0, NULL, 1, NOW(), DATE_ADD(NOW(), INTERVAL 6 MONTH), 1),
  ('GIAM20K', 'Giảm ngay 20.000đ cho đơn từ 150.000đ', 'fixed', 20000, NULL, 150000, NULL, NULL, NOW(), DATE_ADD(NOW(), INTERVAL 6 MONTH), 1)
ON DUPLICATE KEY UPDATE code = code;
