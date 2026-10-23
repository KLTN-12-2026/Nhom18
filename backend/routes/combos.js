const express = require("express")
const router = express.Router()
const comboController = require("../controllers/comboController")
const { verifyToken, requireAdmin } = require("../middleware/auth")
const { cacheMiddleware } = require("../middleware/cache")

// Public routes - Cache 5 minutes (combos don't change often)
router.get("/", cacheMiddleware(300), comboController.getAllCombos)
router.get("/popular", cacheMiddleware(300), comboController.getPopularCombos)
router.get("/:id", cacheMiddleware(300), comboController.getComboById)

// Admin routes
router.post("/", verifyToken, requireAdmin, comboController.createCombo)
router.put("/:id", verifyToken, requireAdmin, comboController.updateCombo)
router.delete("/:id", verifyToken, requireAdmin, comboController.deleteCombo)
router.put("/:id/toggle", verifyToken, requireAdmin, comboController.toggleComboAvailability)

module.exports = router
