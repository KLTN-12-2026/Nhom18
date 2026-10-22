const express = require("express")
const router = express.Router()
const roomController = require("../controllers/roomController")
const { verifyToken, requireAdmin } = require("../middleware/auth")

// Public routes
router.get("/", roomController.getAllRooms)
router.get("/:id", roomController.getRoomById)
router.get("/cinema/:cinema_id", roomController.getRoomsByCinema)
router.get("/:id/schedule", roomController.getRoomSchedule)
router.get("/cinema/:cinema_id/available", roomController.getAvailableRooms)

// Admin routes
router.post("/", verifyToken, requireAdmin, roomController.createRoom)
router.put("/:id", verifyToken, requireAdmin, roomController.updateRoom)
router.delete("/:id", verifyToken, requireAdmin, roomController.deleteRoom)
router.get("/:id/statistics", verifyToken, requireAdmin, roomController.getRoomStatistics)

module.exports = router
