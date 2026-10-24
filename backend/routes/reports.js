const express = require('express')
const { verifyToken, requireStaff } = require('../middleware/auth')
const { summary, daily, topMovies, csv, detail, dailyMovieBreakdown } = require('../controllers/reportController')

const router = express.Router()

router.use(verifyToken, requireStaff)

router.get('/summary', summary)
router.get('/daily', daily)
router.get('/daily/movie-breakdown', dailyMovieBreakdown)
router.get('/top-movies', topMovies)
router.get('/exports/:type.csv', csv)
router.get('/detail/:type', detail)

module.exports = router
