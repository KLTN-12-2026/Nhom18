-- Lỗi cùng dạng với migration 25 (payment_status thiếu 'refunded'): cột
-- point_transactions.type là ENUM('earn','redeem') — KHÔNG có 'revoke'. Bản vá
-- vừa thêm points.service.revokePoints() (thu hồi điểm khi vé đã tích điểm bị
-- huỷ/hoàn tiền — trước đây hoàn toàn không có bước này, vé hoàn tiền vẫn giữ
-- nguyên điểm thưởng đổi được voucher thật) insert type='revoke', bị MySQL
-- strict mode từ chối ngay ("Data truncated for column 'type'"). Vì lệnh này
-- nằm trong try/catch dạng "side effect không nghiêm trọng" (giống email/socket
-- ở paymentController), lỗi bị NUỐT ÂM THẦM — huỷ vé vẫn báo thành công nhưng
-- điểm không hề được thu hồi. Phát hiện qua smoke test thật trước khi lỗi này
-- kịp xảy ra với dữ liệu thật.
ALTER TABLE point_transactions
  MODIFY COLUMN type ENUM('earn', 'redeem', 'revoke') NOT NULL;

-- Nhân tiện chuẩn hoá collation — bảng này thêm sau đợt chuẩn hoá
-- utf8mb4_unicode_ci trước đó (xem migration DB optimization 2026-07-29) nên
-- bị bỏ sót, vẫn ở utf8mb4_0900_ai_ci mặc định của MySQL 8.
ALTER TABLE point_transactions
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
