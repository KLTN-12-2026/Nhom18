const express = require("express")
const { getAllCinemas, getCinemaById } = require("../controllers/cinemaController")
const { cacheMiddleware } = require("../middleware/cache")

const router = express.Router()

// Cache cinemas for 10 minutes (they don't change often)
router.get("/", cacheMiddleware(600), getAllCinemas)
router.get("/:id", cacheMiddleware(600), getCinemaById)

module.exports = router
