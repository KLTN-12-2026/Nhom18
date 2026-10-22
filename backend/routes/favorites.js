const express = require("express")
const router = express.Router()
const favoriteController = require("../controllers/favoriteController")
const { verifyToken } = require("../middleware/auth")

// All routes require authentication
router.use(verifyToken)

// Get all user favorites
router.get("/", favoriteController.getUserFavorites)

// Get favorite IDs only (for quick checking)
router.get("/ids", favoriteController.getFavoriteIds)

// Check if specific movie is favorited
router.get("/:movieId", favoriteController.checkFavorite)

// Add to favorites
router.post("/:movieId", favoriteController.addFavorite)

// Remove from favorites
router.delete("/:movieId", favoriteController.removeFavorite)

module.exports = router
