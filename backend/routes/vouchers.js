const express = require('express');
const router = express.Router();
const Voucher = require('../models/Voucher');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { getActiveBirthdayVoucher, formatDiscountText } = require('../services/birthdayVoucher.service');

// Thông tin CÔNG KHAI (chỉ các trường an toàn — không lộ used_count/usage_limit
// nội bộ) của mã ưu đãi sinh nhật đang bật, để banner sinh nhật ở frontend
// hiển thị ĐÚNG nội dung admin đang cấu hình thay vì hardcode sẵn trong code
// (trước đây "HAPPYBIRTHDAY"/"20%/50k" viết cứng ở frontend — sửa mã trong
// /admin/vouchers không hề cập nhật lại banner, 2 nơi lệch nhau ngay lập tức).
// Đặt TRƯỚC route GET '/' (admin-only) — không đụng độ vì '/' và '/active-birthday'
// là 2 path khác nhau, nhưng đặt gần /validate cho dễ đọc.
router.get('/active-birthday', verifyToken, async (req, res) => {
  try {
    const voucher = await getActiveBirthdayVoucher();
    if (!voucher) return res.json({ voucher: null });

    res.json({
      voucher: {
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
        max_discount_amount: voucher.max_discount_amount,
        min_order_amount: voucher.min_order_amount,
        valid_until: voucher.valid_until,
        discount_text: formatDiscountText(voucher),
      },
    });
  } catch (error) {
    console.error('Get active birthday voucher error:', error);
    res.status(500).json({ error: 'Không thể tải thông tin ưu đãi sinh nhật' });
  }
});

/**
 * VOUCHER CÁ NHÂN CỦA CHÍNH KHÁCH — voucher bồi thường khi hoàn tiền, voucher
 * đổi từ điểm thưởng, voucher sinh nhật.
 *
 * Trước endpoint này, phát voucher bồi thường cho khách xong thì khách chỉ
 * biết mã qua email/thông báo — mất email là mất tiền, vì không có chỗ nào
 * trong tài khoản tra lại được. Với voucher bồi thường (đúng bằng số tiền vé)
 * thì đó là mất tiền thật của khách.
 *
 * Chỉ trả voucher GÁN RIÊNG cho người đang đăng nhập (assigned_user_id), không
 * trả voucher khuyến mãi chung — cái đó đã hiện ở trang chủ.
 */
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const [rows] = await pool.query(
      `SELECT v.id, v.code, v.description, v.discount_type, v.discount_value,
              v.max_discount_amount, v.min_order_amount, v.valid_from, v.valid_until,
              v.is_active, v.usage_limit, v.used_count, v.per_user_limit,
              (SELECT COUNT(*) FROM voucher_redemptions vr
                WHERE vr.voucher_id = v.id AND vr.user_id = ?) AS da_dung,
              (SELECT r.id FROM refunds r WHERE r.voucher_id = v.id LIMIT 1) AS refund_id
         FROM vouchers v
        WHERE v.assigned_user_id = ?
        ORDER BY v.valid_until DESC`,
      [req.user.id, req.user.id],
    );

    const bayGio = new Date();
    res.json({
      vouchers: rows.map((v) => {
        const hetHan = new Date(v.valid_until) < bayGio;
        const daDungHet = v.per_user_limit != null && Number(v.da_dung) >= Number(v.per_user_limit);
        return {
          id: v.id,
          code: v.code,
          description: v.description,
          discount_type: v.discount_type,
          discount_value: Number(v.discount_value),
          min_order_amount: Number(v.min_order_amount),
          valid_until: v.valid_until,
          // Voucher bồi thường sinh ra từ một lệnh hoàn tiền — để giao diện
          // hiện đúng "đây là tiền hoàn của bạn", không phải khuyến mãi.
          la_boi_thuong: v.refund_id != null,
          con_dung_duoc: Boolean(v.is_active) && !hetHan && !daDungHet,
          trang_thai: !v.is_active ? 'Đã bị vô hiệu hoá'
            : daDungHet ? 'Đã sử dụng'
            : hetHan ? 'Đã hết hạn'
            : 'Còn dùng được',
        };
      }),
    });
  } catch (error) {
    console.error('Get my vouchers error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách mã của bạn' });
  }
});

// Xem trước mã giảm giá có dùng được không cho đơn hàng hiện tại — dùng ở
// trang đặt vé/thanh toán TRƯỚC khi tạo vé thật (chỉ validate, không trừ lượt).
router.post('/validate', verifyToken, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    if (!code || orderAmount == null) {
      return res.status(400).json({ error: 'Thiếu mã giảm giá hoặc số tiền đơn hàng' });
    }

    const result = await Voucher.validate(code, req.user.id, Number(orderAmount));
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.reason });
    }

    res.json({
      valid: true,
      code: result.voucher.code,
      description: result.voucher.description,
      discount_amount: result.discountAmount,
    });
  } catch (error) {
    console.error('Validate voucher error:', error);
    res.status(500).json({ error: 'Không thể kiểm tra mã giảm giá' });
  }
});

// Dùng cho tạo mới — bắt buộc đủ mọi trường.
function validateVoucherCreate(body) {
  const { code, description, discount_type, discount_value, valid_from, valid_until } = body;
  if (!code || !description || !['percent', 'fixed'].includes(discount_type) || !discount_value || !valid_from || !valid_until) {
    return 'Thiếu thông tin bắt buộc (mã, mô tả, loại/giá trị giảm, thời hạn)';
  }
  return validateVoucherFieldRules(body);
}

// Dùng cho cập nhật — PUT nhận cả patch TOÀN BỘ form (dialog sửa) lẫn patch
// MỘT TRƯỜNG DUY NHẤT (nút bật/tắt is_active ở danh sách chỉ gửi
// { is_active }) — trước đây route PUT không kiểm tra gì cả, cho phép sửa 1
// voucher percent thành discount_value=5000 (giảm "5000%") hoặc valid_until
// đứng trước valid_from (mã không bao giờ dùng được) mà vẫn lưu thành công.
// Chỉ kiểm tra những trường THỰC SỰ có mặt trong payload, không được bắt buộc
// đủ mọi trường như create — nếu không, patch 1 trường (vd is_active) sẽ luôn
// bị từ chối vì "thiếu" các trường khác vốn không hề được gửi lên.
function validateVoucherUpdate(body) {
  if (body.discount_type !== undefined && !['percent', 'fixed'].includes(body.discount_type)) {
    return 'Loại giảm giá không hợp lệ';
  }
  return validateVoucherFieldRules(body);
}

function validateVoucherFieldRules(body) {
  const { discount_type, discount_value, valid_from, valid_until } = body;
  if (discount_value !== undefined) {
    if (discount_type === 'percent' && (discount_value <= 0 || discount_value > 100)) {
      return 'Phần trăm giảm giá phải trong khoảng 1-100';
    }
    if (discount_type === 'fixed' && discount_value <= 0) {
      return 'Số tiền giảm phải lớn hơn 0';
    }
  }
  if (valid_from !== undefined && valid_until !== undefined && new Date(valid_until) <= new Date(valid_from)) {
    return 'Hạn dùng phải sau ngày bắt đầu hiệu lực';
  }
  return null;
}

// ── Admin CRUD ────────────────────────────────────
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    res.json({ vouchers: await Voucher.findAll() });
  } catch (error) {
    console.error('List vouchers error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách mã giảm giá' });
  }
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const validationError = validateVoucherCreate(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const id = await Voucher.create(req.body);
    res.status(201).json({ success: true, id });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Mã giảm giá này đã tồn tại' });
    }
    console.error('Create voucher error:', error);
    res.status(500).json({ error: 'Không thể tạo mã giảm giá' });
  }
});

router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const validationError = validateVoucherUpdate(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const ok = await Voucher.update(req.params.id, req.body);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy mã giảm giá' });
    res.json({ success: true });
  } catch (error) {
    console.error('Update voucher error:', error);
    res.status(500).json({ error: 'Không thể cập nhật mã giảm giá' });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ok = await Voucher.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy mã giảm giá' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete voucher error:', error);
    res.status(500).json({ error: 'Không thể xoá mã giảm giá' });
  }
});

module.exports = router;
