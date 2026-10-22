const crypto = require("crypto")
const Movie = require("../models/Movie")
const Showtime = require("../models/Showtime")

const getAllMovies = async (req, res) => {
  try {
    const { status, genre, search, orderBy, orderDir } = req.query
    const filters = {}
    
    if (status) filters.status = status
    if (genre) filters.genre = genre
    if (search) filters.search = search
    if (orderBy) filters.orderBy = orderBy
    if (orderDir) filters.orderDir = orderDir

    const movies = await Movie.findAll(filters)

    // Stable ETag derived from content so unchanged responses can return 304
    const signature = movies.map(m => `${m.id}:${m.updated_at || m.created_at}`).join(",")
    const etag = `W/"movies-${crypto.createHash("md5").update(signature).digest("hex")}"`

    res.set({
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      'ETag': etag,
    })

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end()
    }

    res.json({ movies })
  } catch (error) {
    console.error("Get movies error:", error)
    res.status(500).json({ error: "Failed to fetch movies" })
  }
}

const getMoviesByStatus = async (req, res) => {
  try {
    const { status } = req.params
    const validStatuses = ['NOW_SHOWING', 'COMING_SOON', 'UPCOMING']
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    const movies = await Movie.findByStatus(status)
    res.json({ movies, count: movies.length })
  } catch (error) {
    console.error("Get movies by status error:", error)
    res.status(500).json({ error: "Failed to fetch movies" })
  }
}

const getPopularMovies = async (req, res) => {
  try {
    // Chặn trần — không như findAll (đã có safeLimit riêng), route này trước
    // đây nhận thẳng limit từ client không giới hạn trên, cho phép 1 request
    // ?limit=999999999 kéo toàn bộ bảng movies mỗi lần gọi.
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50)
    const movies = await Movie.getPopularMovies(limit)
    res.json({ movies })
  } catch (error) {
    console.error("Get popular movies error:", error)
    res.status(500).json({ error: "Failed to fetch popular movies" })
  }
}

const getMovieById = async (req, res) => {
  try {
    const { id } = req.params
    const movie = await Movie.findById(id)

    if (!movie) {
      return res.status(404).json({ error: "Movie not found" })
    }

    res.json({ movie })
  } catch (error) {
    console.error("Get movie error:", error)
    res.status(500).json({ error: "Failed to fetch movie" })
  }
}

const createMovie = async (req, res) => {
  try {
    const movieData = req.body
    const movieId = await Movie.create(movieData)
    const movie = await Movie.findById(movieId)

    // Danh sách phim đang cache tới 10 PHÚT — không xoá thì phim vừa thêm
    // không xuất hiện với người dùng suốt thời gian đó dù DB đã có.
    require("../middleware/cache").invalidateCache("movies")
    res.status(201).json({
      message: "Movie created successfully",
      movie,
    })
  } catch (error) {
    console.error("Create movie error:", error)
    res.status(500).json({ error: "Failed to create movie" })
  }
}

const updateMovie = async (req, res) => {
  try {
    const { id } = req.params
    const movieData = req.body

    const updated = await Movie.update(id, movieData)
    if (!updated) {
      return res.status(404).json({ error: "Movie not found" })
    }

    const movie = await Movie.findById(id)
    // Sửa phim đổi cả tên/poster/trạng thái hiển thị trong danh sách lẫn trang
    // chi tiết, và trạng thái phim quyết định phim có hiện ở mục đang chiếu hay
    // không — phải xoá cache 'movies' lẫn 'showtimes' (trang lịch chiếu nhúng
    // kèm tên/poster phim).
    require("../middleware/cache").invalidateCache("movies", "showtimes")
    res.json({
      message: "Movie updated successfully",
      movie,
    })
  } catch (error) {
    console.error("Update movie error:", error)
    res.status(500).json({ error: "Failed to update movie" })
  }
}

const deleteMovie = async (req, res) => {
  try {
    const { id } = req.params

    // showtimes/tickets đều CASCADE theo movie_id — xoá cứng 1 phim đã có vé
    // bán ra sẽ xoá LUÔN toàn bộ lịch sử vé/doanh thu của phim đó, không cách
    // nào khôi phục. Chặn trường hợp này, chỉ cho xoá thẳng khi phim chưa
    // từng phát sinh vé nào (cùng nguyên tắc đã áp dụng cho xoá rạp chiếu).
    const hasHistory = await Movie.hasTicketHistory(id)
    if (hasHistory) {
      return res.status(400).json({
        error: "Phim này đã có vé được bán — không thể xoá vĩnh viễn vì sẽ mất lịch sử vé/doanh thu. Hãy chuyển trạng thái phim sang ngừng chiếu thay vì xoá.",
      })
    }

    const deleted = await Movie.delete(id)
    if (!deleted) {
      return res.status(404).json({ error: "Movie not found" })
    }

    // Xoá phim kéo theo xoá suất chiếu (CASCADE) — phải làm mới cả 2 nhóm,
    // nếu không phim đã xoá vẫn hiện trong danh sách tới 10 phút và bấm vào
    // sẽ ra trang lỗi.
    require("../middleware/cache").invalidateCache("movies", "showtimes")
    res.json({ message: "Movie deleted successfully" })
  } catch (error) {
    console.error("Delete movie error:", error)
    res.status(500).json({ error: "Failed to delete movie" })
  }
}

const getMovieShowtimes = async (req, res) => {
  try {
    const { id } = req.params
    // Ensure movie exists
    const movie = await Movie.findById(id)
    if (!movie) {
      return res.status(404).json({ error: "Movie not found" })
    }

    const showtimes = await Showtime.findByMovie(id)
    res.json({ showtimes })
  } catch (error) {
    console.error("Get movie showtimes error:", error)
    res.status(500).json({ error: "Failed to fetch showtimes" })
  }
}

module.exports = {
  getAllMovies,
  getMovieById,
  getMoviesByStatus,
  getPopularMovies,
  createMovie,
  updateMovie,
  deleteMovie,
  getMovieShowtimes,
}
