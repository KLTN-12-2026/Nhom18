const express = require("express")
const { getSystemSettings, toPublicContact } = require("../services/systemSettings.service")

const router = express.Router()

// GET /api/settings/public — email/tổng đài hiện ở chân trang, trang Liên hệ và
// trang thanh toán thất bại. Lấy từ trang Cài đặt của admin thay vì ghi cứng
// "1900 xxxx" rải rác trong mã nguồn. Chỉ trả các trường không nhạy cảm.
router.get("/public", async (req, res) => {
  try {
    res.json(toPublicContact(await getSystemSettings()))
  } catch (error) {
    console.error("Get public settings error:", error)
    res.status(500).json({ error: "Không thể tải thông tin liên hệ" })
  }
})

module.exports = router
