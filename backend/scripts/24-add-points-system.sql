-- Hệ thống điểm thưởng: tích điểm khi mua vé (thật, theo số tiền đã thanh
-- toán) và khi đánh giá phim được duyệt, đổi điểm lấy voucher cá nhân.

ALTER TABLE users
  ADD COLUMN points INT NOT NULL DEFAULT 0;

-- Lịch sử tích/đổi điểm — nguồn sự thật duy nhất cho số dư (users.points là
-- giá trị suy ra/cache), dùng UNIQUE(reference_type, reference_id) cho các
-- giao dịch CỘNG điểm để 1 vé/1 review không bao giờ được cộng điểm 2 lần dù
-- job/route bị gọi lại (vd webhook thanh toán gọi trùng, admin bấm duyệt 2 lần).
CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount INT NOT NULL, -- dương = tích điểm, âm = đổi điểm
  type ENUM('earn', 'redeem') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reference_type VARCHAR(50) DEFAULT NULL, -- 'ticket' | 'review' | 'reward'
  reference_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_point_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_point_earn_source (type, reference_type, reference_id),
  INDEX idx_point_tx_user (user_id, created_at)
);

-- Danh mục phần thưởng đổi điểm — admin quản lý ở /admin/points. Mỗi phần
-- thưởng ánh xạ sang 1 mẫu voucher (discount_type/discount_value...); lúc đổi
-- sẽ tạo ra 1 voucher THẬT gắn riêng cho user đó (xem vouchers.assigned_user_id).
CREATE TABLE IF NOT EXISTS point_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description VARCHAR(500) NOT NULL,
  points_cost INT NOT NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  max_discount_amount DECIMAL(10,2) DEFAULT NULL,
  validity_days INT NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Voucher CÁ NHÂN sinh ra khi đổi điểm — assigned_user_id NULL nghĩa là
-- voucher công khai như cũ (không đổi hành vi của toàn bộ hệ thống voucher
-- hiện có); khi có giá trị, CHỈ user đó dùng được (kiểm tra ở Voucher.validate()).
ALTER TABLE vouchers
  ADD COLUMN assigned_user_id INT DEFAULT NULL,
  ADD CONSTRAINT fk_voucher_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE CASCADE;

INSERT INTO point_rewards (title, description, points_cost, discount_type, discount_value, max_discount_amount, validity_days) VALUES
('Giảm 15.000đ', 'Đổi 150 điểm lấy mã giảm 15.000đ cho đơn đặt vé bất kỳ', 150, 'fixed', 15000, NULL, 30),
('Giảm 10%', 'Đổi 300 điểm lấy mã giảm 10% (tối đa 30.000đ)', 300, 'percent', 10, 30000, 30),
('Giảm 50.000đ', 'Đổi 600 điểm lấy mã giảm 50.000đ cho đơn đặt vé bất kỳ', 600, 'fixed', 50000, NULL, 45);
