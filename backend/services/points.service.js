/**
 * Hệ thống điểm thưởng: tích điểm khi mua vé thật (theo số tiền đã thanh
 * toán) và khi đánh giá phim được duyệt, đổi điểm lấy voucher cá nhân thật
 * (ghi vào bảng vouchers, không phải mô phỏng).
 */
const { pool } = require("../config/database")
const { withTransaction } = require("../utils/db")
const Notification = require("../models/Notification")

const POINTS_PER_VND = 10000 // 1 điểm / 10.000đ chi tiêu
const REVIEW_APPROVED_BONUS = 20

function pointsForAmount(vndAmount) {
  return Math.floor(Number(vndAmount) / POINTS_PER_VND)
}

/**
 * Cộng điểm cho user — idempotent nhờ UNIQUE(type, reference_type,
 * reference_id) ở point_transactions: gọi lại với cùng reference (vd webhook
 * thanh toán gọi trùng, admin bấm duyệt review 2 lần) sẽ bị DB từ chối insert
 * (ER_DUP_ENTRY) thay vì cộng điểm lần 2.
 * @returns {Promise<{ awarded: boolean, amount?: number, newBalance?: number }>}
 */
async function awardPoints(userId, amount, reason, { referenceType, referenceId } = {}) {
  if (!amount || amount <= 0) return { awarded: false }
  try {
    await pool.query(
      "INSERT INTO point_transactions (user_id, amount, type, reason, reference_type, reference_id) VALUES (?, ?, 'earn', ?, ?, ?)",
      [userId, amount, reason, referenceType || null, referenceId || null],
    )
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return { awarded: false, reason: "ALREADY_AWARDED" }
    throw e
  }

  await pool.query("UPDATE users SET points = points + ? WHERE id = ?", [amount, userId])
  const [[{ points: newBalance }]] = await pool.query("SELECT points FROM users WHERE id = ?", [userId])

  Notification.create({
    userId,
    type: "points_earned",
    title: "🌟 Bạn vừa nhận được điểm thưởng!",
    message: `+${amount} điểm — ${reason}. Số dư hiện tại: ${newBalance} điểm.`,
    data: { amount, reason, newBalance },
  }).catch((e) => console.error("⚠️ Không tạo được thông báo tích điểm:", e.message))

  return { awarded: true, amount, newBalance }
}

/**
 * Thu hồi điểm đã cộng cho 1 sự kiện (vé bị huỷ/hoàn tiền sau khi đã tích
 * điểm) — đối xứng với awardPoints(), cũng idempotent nhờ cùng UNIQUE(type,
 * reference_type, reference_id) (type='revoke' lần này) nên gọi lại nhiều lần
 * cho cùng 1 vé không bị trừ điểm 2 lần. Nếu vé đó chưa từng được tích điểm
 * (vd bị huỷ khi còn 'pending', chưa thanh toán) thì không có gì để thu hồi —
 * trả về ngay, không đụng tới bảng users.
 *
 * Số điểm bị trừ bị chặn ở LEAST(số đã cộng, số dư hiện có) — nếu user đã
 * tiêu hết/1 phần số điểm đó để đổi voucher trước khi vé bị huỷ, chỉ trừ tới
 * 0 chứ không cho số dư âm; ledger (point_transactions) vẫn ghi đúng số thực
 * trừ được để tổng ledger luôn khớp với users.points.
 * @returns {Promise<{ revoked: boolean, amount?: number }>}
 */
async function revokePoints(userId, referenceType, referenceId, reason) {
  return withTransaction(async (connection) => {
    const [[earned]] = await connection.query(
      "SELECT amount FROM point_transactions WHERE type = 'earn' AND reference_type = ? AND reference_id = ?",
      [referenceType, referenceId],
    )
    if (!earned || earned.amount <= 0) return { revoked: false }

    const [[user]] = await connection.query("SELECT points FROM users WHERE id = ? FOR UPDATE", [userId])
    const deduct = Math.min(earned.amount, user?.points || 0)

    try {
      await connection.query(
        "INSERT INTO point_transactions (user_id, amount, type, reason, reference_type, reference_id) VALUES (?, ?, 'revoke', ?, ?, ?)",
        [userId, -deduct, reason, referenceType, referenceId],
      )
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return { revoked: false, reason: "ALREADY_REVOKED" }
      throw e
    }

    if (deduct > 0) {
      await connection.query("UPDATE users SET points = points - ? WHERE id = ?", [deduct, userId])
    }
    return { revoked: true, amount: deduct }
  })
}

async function getBalance(userId) {
  const [[row]] = await pool.query("SELECT points FROM users WHERE id = ?", [userId])
  return row?.points || 0
}

async function getHistory(userId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const [rows] = await pool.query(
    "SELECT id, amount, type, reason, reference_type, reference_id, created_at FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, safeLimit],
  )
  return rows
}

function generateVoucherCode() {
  return "PT" + Math.random().toString(36).slice(2, 8).toUpperCase()
}

/**
 * Đổi điểm lấy 1 voucher CÁ NHÂN (vouchers.assigned_user_id = userId) — trừ
 * điểm và tạo voucher thật trong CÙNG 1 transaction DB (khoá dòng users bằng
 * FOR UPDATE để 2 request đổi điểm gần như đồng thời không cùng vượt qua
 * kiểm tra số dư rồi trừ âm điểm).
 * @returns {Promise<{ ok: boolean, reason?: string, code?: string, validUntil?: Date }>}
 */
async function redeemReward(userId, rewardId) {
  return withTransaction(async (connection) => {
    const [[reward]] = await connection.query("SELECT * FROM point_rewards WHERE id = ? AND is_active = 1", [rewardId])
    if (!reward) return { ok: false, reason: "NOT_FOUND" }

    const [[user]] = await connection.query("SELECT points FROM users WHERE id = ? FOR UPDATE", [userId])
    if (!user || user.points < reward.points_cost) return { ok: false, reason: "INSUFFICIENT_POINTS" }

    await connection.query(
      "INSERT INTO point_transactions (user_id, amount, type, reason, reference_type, reference_id) VALUES (?, ?, 'redeem', ?, 'reward', ?)",
      [userId, -reward.points_cost, `Đổi điểm lấy "${reward.title}"`, reward.id],
    )
    await connection.query("UPDATE users SET points = points - ? WHERE id = ?", [reward.points_cost, userId])

    let code = null
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateVoucherCode()
      const [[dup]] = await connection.query("SELECT id FROM vouchers WHERE code = ?", [candidate])
      if (!dup) code = candidate
    }
    if (!code) return { ok: false, reason: "CODE_GENERATION_FAILED" }

    const validUntil = new Date(Date.now() + reward.validity_days * 24 * 60 * 60 * 1000)

    await connection.query(
      `INSERT INTO vouchers (code, description, discount_type, discount_value, max_discount_amount, min_order_amount,
        usage_limit, per_user_limit, valid_from, valid_until, is_active, assigned_user_id)
       VALUES (?, ?, ?, ?, ?, 0, 1, 1, NOW(), ?, 1, ?)`,
      [code, reward.title, reward.discount_type, reward.discount_value, reward.max_discount_amount, validUntil, userId],
    )

    return { ok: true, code, validUntil }
  })
}

module.exports = {
  POINTS_PER_VND,
  REVIEW_APPROVED_BONUS,
  pointsForAmount,
  awardPoints,
  revokePoints,
  getBalance,
  getHistory,
  redeemReward,
}
