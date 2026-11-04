-- Hệ thống thông báo trong app cho từng người dùng — trước đây web hoàn toàn
-- không có nơi nào để "báo" cho user biết việc gì đó vừa xảy ra (vd được tặng
-- ưu đãi sinh nhật, cần cập nhật hồ sơ...) ngoài banner tạm thời trên trang.
-- `data` lưu JSON tuỳ loại thông báo (vd mã voucher, hạn dùng) để frontend
-- hiển thị chi tiết mà không cần thêm cột riêng cho mỗi loại.

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSON DEFAULT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, created_at)
);
