const express = require("express")
const router = express.Router()
const Notification = require("../models/Notification")
const { verifyToken } = require("../middleware/auth")

// Tất cả route chỉ trả về thông báo CỦA CHÍNH user đang đăng nhập (lọc theo
// req.user.id lấy từ token, không nhận userId từ client) — tránh xem được
// thông báo (có thể chứa mã voucher riêng) của người khác.
router.use(verifyToken)

router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.findByUser(req.user.id, { limit: req.query.limit })
    res.json({ notifications })
  } catch (error) {
    console.error("List notifications error:", error)
    res.status(500).json({ error: "Không thể tải thông báo" })
  }
})

router.get("/unread-count", async (req, res) => {
  try {
    const count = await Notification.countUnread(req.user.id)
    res.json({ count })
  } catch (error) {
    console.error("Count unread notifications error:", error)
    res.status(500).json({ error: "Không thể đếm thông báo chưa đọc" })
  }
})

router.post("/:id/read", async (req, res) => {
  try {
    const ok = await Notification.markRead(req.params.id, req.user.id)
    if (!ok) {
      return res.status(404).json({ error: "Không tìm thấy thông báo" })
    }
    res.json({ success: true })
  } catch (error) {
    console.error("Mark notification read error:", error)
    res.status(500).json({ error: "Không thể cập nhật thông báo" })
  }
})

router.post("/read-all", async (req, res) => {
  try {
    await Notification.markAllRead(req.user.id)
    res.json({ success: true })
  } catch (error) {
    console.error("Mark all notifications read error:", error)
    res.status(500).json({ error: "Không thể cập nhật thông báo" })
  }
})

module.exports = router
