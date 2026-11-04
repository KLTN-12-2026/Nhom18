-- Kiểm duyệt đánh giá: kết hợp TỰ ĐỘNG (chấm ngay lúc gửi, xem
-- reviewModeration.service.js) và THỦ CÔNG (admin duyệt/từ chối ở
-- /admin/reviews) — trước đây mọi review gửi lên đều hiện công khai ngay lập
-- tức, không có bước kiểm tra nào.

ALTER TABLE movie_reviews
  ADD COLUMN moderation_status ENUM('approved', 'flagged', 'rejected') NOT NULL DEFAULT 'approved',
  ADD COLUMN moderation_reason VARCHAR(255) DEFAULT NULL,
  ADD COLUMN moderated_by INT DEFAULT NULL,
  ADD COLUMN moderated_at TIMESTAMP NULL DEFAULT NULL,
  -- Chống thưởng điểm 2 lần cho cùng 1 review (vd auto-approve lúc gửi rồi
  -- admin lỡ bấm duyệt lại review đã approved) — kiểm tra cờ này trước khi
  -- gọi points.service.js thay vì suy luận lại từ moderation_status.
  ADD COLUMN points_awarded TINYINT(1) NOT NULL DEFAULT 0,
  ADD INDEX idx_reviews_moderation (moderation_status);
