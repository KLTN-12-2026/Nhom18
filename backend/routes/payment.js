const express = require("express")
const router = express.Router()
const paymentController = require("../controllers/paymentController")
const { verifyToken } = require("../middleware/auth")
const { bookingLimiter } = require("../middleware/rateLimiter")

// Create payment (requires authentication)
router.post("/create", verifyToken, bookingLimiter, paymentController.createPayment)

// Payment gateway callbacks (webhooks - no auth required, verified by signature)
router.get("/callback/vnpay", paymentController.vnpayCallback)

// Xac nhan tu RETURN URL — trinh duyet khach gui len nguyen bo tham so vnp_*
// co chu ky. Lop thu hai ben canh IPN: khi duong ham chet, IPN khong bao gio
// toi, va day la duong duy nhat de biet khach da tra tien.
router.post('/vnpay/confirm-return', paymentController.vnpayReturnConfirm)
router.post("/callback/momo", paymentController.momoCallback)

// Check payment status
router.get("/status/:ticket_id", verifyToken, paymentController.checkPaymentStatus)

// Get payment history
router.get("/history", verifyToken, paymentController.getPaymentHistory)

module.exports = router
