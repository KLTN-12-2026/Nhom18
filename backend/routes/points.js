const express = require("express")
const router = express.Router()
const { pool } = require("../config/database")
const { verifyToken, requireAdmin } = require("../middleware/auth")
const pointsService = require("../services/points.service")

// ── Người dùng (đăng nhập) ──────────────────────────────────────────────
router.get("/balance", verifyToken, async (req, res) => {
  try {
    res.json({ points: await pointsService.getBalance(req.user.id) })
  } catch (error) {
    console.error("Get points balance error:", error)
    res.status(500).json({ error: "Không thể tải số điểm" })
  }
})

router.get("/history", verifyToken, async (req, res) => {
  try {
    res.json({ history: await pointsService.getHistory(req.user.id, req.query.limit) })
  } catch (error) {
    console.error("Get points history error:", error)
    res.status(500).json({ error: "Không thể tải lịch sử điểm" })
  }
})

// Danh sách phần thưởng ĐANG BẬT — công khai cho user đã đăng nhập xem để đổi
router.get("/rewards", verifyToken, async (req, res) => {
  try {
    const [rewards] = await pool.query(
      "SELECT id, title, description, points_cost, discount_type, discount_value, max_discount_amount, validity_days FROM point_rewards WHERE is_active = 1 ORDER BY points_cost ASC",
    )
    res.json({ rewards })
  } catch (error) {
    console.error("List point rewards error:", error)
    res.status(500).json({ error: "Không thể tải danh sách phần thưởng" })
  }
})

router.post("/rewards/:id/redeem", verifyToken, async (req, res) => {
  try {
    const result = await pointsService.redeemReward(req.user.id, req.params.id)
    if (!result.ok) {
      const messages = {
        NOT_FOUND: "Phần thưởng không tồn tại hoặc đã ngừng cung cấp",
        INSUFFICIENT_POINTS: "Bạn không đủ điểm để đổi phần thưởng này",
        CODE_GENERATION_FAILED: "Không thể tạo mã voucher, vui lòng thử lại",
      }
      return res.status(400).json({ error: messages[result.reason] || "Không thể đổi điểm" })
    }
    res.json({
      message: `Đổi điểm thành công! Mã voucher của bạn: ${result.code}`,
      code: result.code,
      validUntil: result.validUntil,
    })
  } catch (error) {
    console.error("Redeem reward error:", error)
    res.status(500).json({ error: "Không thể đổi điểm" })
  }
})

// ── Admin — quản lý danh mục phần thưởng ────────────────────────────────
router.get("/admin/rewards", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [rewards] = await pool.query("SELECT * FROM point_rewards ORDER BY points_cost ASC")
    res.json({ rewards })
  } catch (error) {
    console.error("Admin list point rewards error:", error)
    res.status(500).json({ error: "Không thể tải danh sách phần thưởng" })
  }
})

function validateRewardBody(body, { partial = false } = {}) {
  const { title, description, points_cost, discount_type, discount_value } = body
  if (!partial && (!title || !description || !points_cost || !discount_type || !discount_value)) {
    return "Vui lòng điền đầy đủ thông tin bắt buộc"
  }
  if (points_cost !== undefined && Number(points_cost) <= 0) return "Số điểm cần đổi phải lớn hơn 0"
  if (discount_type !== undefined && !["percent", "fixed"].includes(discount_type)) return "Loại giảm giá không hợp lệ"
  if (discount_type === "percent" && discount_value !== undefined && (discount_value <= 0 || discount_value > 100)) {
    return "Phần trăm giảm giá phải trong khoảng 1-100"
  }
  return null
}

router.post("/admin/rewards", verifyToken, requireAdmin, async (req, res) => {
  try {
    const err = validateRewardBody(req.body)
    if (err) return res.status(400).json({ error: err })

    const { title, description, points_cost, discount_type, discount_value, max_discount_amount, validity_days, is_active } = req.body
    const [result] = await pool.query(
      `INSERT INTO point_rewards (title, description, points_cost, discount_type, discount_value, max_discount_amount, validity_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, points_cost, discount_type, discount_value, max_discount_amount ?? null, validity_days || 30, is_active === false ? 0 : 1],
    )
    res.status(201).json({ id: result.insertId, message: "Đã tạo phần thưởng" })
  } catch (error) {
    console.error("Create point reward error:", error)
    res.status(500).json({ error: "Không thể tạo phần thưởng" })
  }
})

router.put("/admin/rewards/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const err = validateRewardBody(req.body, { partial: true })
    if (err) return res.status(400).json({ error: err })

    const settable = ["title", "description", "points_cost", "discount_type", "discount_value", "max_discount_amount", "validity_days", "is_active"]
    const fields = []
    const params = []
    for (const key of settable) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        params.push(key === "is_active" ? (req.body[key] ? 1 : 0) : req.body[key])
      }
    }
    if (!fields.length) return res.status(400).json({ error: "Không có thông tin nào để cập nhật" })
    params.push(req.params.id)
    const [result] = await pool.query(`UPDATE point_rewards SET ${fields.join(", ")} WHERE id = ?`, params)
    if (result.affectedRows === 0) return res.status(404).json({ error: "Không tìm thấy phần thưởng" })
    res.json({ message: "Đã cập nhật phần thưởng" })
  } catch (error) {
    console.error("Update point reward error:", error)
    res.status(500).json({ error: "Không thể cập nhật phần thưởng" })
  }
})

router.delete("/admin/rewards/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM point_rewards WHERE id = ?", [req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ error: "Không tìm thấy phần thưởng" })
    res.json({ message: "Đã xoá phần thưởng" })
  } catch (error) {
    console.error("Delete point reward error:", error)
    res.status(500).json({ error: "Không thể xoá phần thưởng" })
  }
})

module.exports = router
