-- Cho phép người dùng khai ngày sinh + hệ thống mã ưu đãi sinh nhật — thực tế
-- các rạp/thương hiệu thật đều có chương trình tặng ưu đãi vào tháng sinh
-- nhật của khách hàng thân thiết, trước đây web hoàn toàn không có.

ALTER TABLE users
  ADD COLUMN date_of_birth DATE DEFAULT NULL;

-- Đánh dấu voucher nào là loại "chỉ dùng được trong tháng sinh nhật" — kiểm
-- tra thêm logic riêng ở Voucher.validate() (so khớp tháng sinh với tháng
-- hiện tại), khác với voucher thường chỉ phụ thuộc valid_from/valid_until.
ALTER TABLE vouchers
  ADD COLUMN is_birthday_voucher TINYINT(1) NOT NULL DEFAULT 0;

-- Mã ưu đãi sinh nhật mặc định — còn hiệu lực nhiều năm vì bản thân điều
-- kiện "đúng tháng sinh" đã giới hạn khi nào dùng được, không cần tạo lại mỗi
-- năm. per_user_limit=1 nhưng Voucher.validate() chỉ đếm lượt dùng TRONG NĂM
-- HIỆN TẠI cho voucher sinh nhật, nên mỗi năm tới tháng sinh nhật lại dùng
-- được 1 lần mới, không bị khoá vĩnh viễn sau lần đầu.
INSERT INTO vouchers (code, description, discount_type, discount_value, max_discount_amount, min_order_amount, usage_limit, per_user_limit, valid_from, valid_until, is_active, is_birthday_voucher)
VALUES (
  'HAPPYBIRTHDAY',
  'Ưu đãi sinh nhật — giảm 20% (tối đa 50.000đ) trong tháng sinh nhật của bạn',
  'percent', 20, 50000, 0, NULL, 1, NOW(), DATE_ADD(NOW(), INTERVAL 10 YEAR), 1, 1
)
ON DUPLICATE KEY UPDATE code = code;
