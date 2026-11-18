/**
 * AI Chatbot Routes
 */

const express = require("express");
const router = express.Router();
const {
  chatWithAI,
  search,
  getRecommendations,
  health,
  submitFeedback,
  getAnalytics,
  resetMarkovLearning,
  getChatbotRuntimeConfig,
  updateChatbotRuntimeConfig,
} = require("../controllers/chatbotAI.controller");
const { optionalAuth, verifyToken, requireStaff, requireAdmin } = require("../middleware/auth");

// Main AI chat endpoint — optionalAuth: khách vẫn chat được, nhưng nếu có
// đăng nhập thì danh tính (req.user) PHẢI lấy từ token đã xác thực, không
// được tin userId do client tự gửi trong body (tránh giả mạo xem vé người khác).
router.post("/chat", optionalAuth, chatWithAI);

// Người dùng đánh giá 1 câu trả lời (👍/👎) — không cần đăng nhập, chỉ log
// ẩn danh gắn với interactionId đã trả về từ /chat.
router.post("/feedback", submitFeedback);

// Quick movie search (legacy support)
router.get("/search", search);

// AI-powered recommendations
router.get("/recommendations", getRecommendations);

// Health check
router.get("/health", health);

// Trang admin "trend" chatbot (thống kê ẩn danh) — mọi nhân viên (admin +
// cinema_manager) được xem, cùng mức quyền với /api/admin/reports.
// Thống kê hội thoại chatbot là dữ liệu toàn hệ thống (không tách được theo
// rạp vì phần lớn câu hỏi không gắn với rạp nào) — chỉ admin.
router.get("/analytics", verifyToken, requireAdmin, getAnalytics);

// Reset dữ liệu học của Markov chain — hành động phá huỷ dữ liệu học, chỉ
// admin thật (không phải mọi staff) mới được làm.
router.post("/analytics/reset-markov", verifyToken, requireAdmin, resetMarkovLearning);

// Điều khiển chatbot ngay trên Bảng quản trị: chọn Gemini / luật cứng, xem còn
// bao nhiêu câu hỏi AI trong ngày, dán khoá Gemini mới khi khoá cũ hết hạn mức.
// Khoá API là dữ liệu nhạy cảm nên chỉ admin thật được đọc/ghi.
router.get("/config", verifyToken, requireAdmin, getChatbotRuntimeConfig);
router.post("/config", verifyToken, requireAdmin, updateChatbotRuntimeConfig);

module.exports = router;
