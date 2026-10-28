const express = require("express")
const {
  register, sendRegistrationCode, login, getProfile, updateProfile,
  changePassword, sendChangePasswordCode, logout,
  forgotPassword, resetPassword, googleAuth, googleCallback, exchangeGoogleCode,
} = require("../controllers/authController")
const { verifyToken } = require("../middleware/auth")
const { authLimiter, strictAuthLimiter } = require("../middleware/rateLimiter")
const { validateRegister, validateLogin } = require("../middleware/inputValidation")

const router = express.Router()

// Public routes with rate limiting and validation
router.post("/register/send-code", authLimiter, sendRegistrationCode)
router.post("/register", authLimiter, validateRegister, register)
router.post("/login", strictAuthLimiter, validateLogin, login)

// Forgot password routes
router.post("/forgot-password", authLimiter, forgotPassword)
router.post("/reset-password", authLimiter, resetPassword)

// Google OAuth routes
router.get("/google", googleAuth)
router.get("/google/callback", googleCallback)
router.post("/google/exchange", authLimiter, exchangeGoogleCode)

// Protected routes
router.get("/profile", verifyToken, getProfile)
router.put("/profile", verifyToken, updateProfile)
router.post("/change-password/send-code", verifyToken, authLimiter, sendChangePasswordCode)
router.put("/change-password", verifyToken, changePassword)
router.post("/logout", verifyToken, logout)

module.exports = router
