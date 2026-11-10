const User = require("../models/User")
const Showtime = require("../models/Showtime")
const Ticket = require("../models/Ticket")
const Cinema = require("../models/Cinema")
const Notification = require("../models/Notification")
const { pool } = require("../config/database")
const { getScopedCinemaId } = require("../middleware/cinemaScope")
const { validateShowtimeSlot } = require("../utils/showtimeValidation")
const { getSystemSettings, updateSystemSettings } = require("../services/systemSettings.service")
const birthdayVoucherService = require("../services/birthdayVoucher.service")

const getDashboardStats = async (req, res) => {
  try {
    // Quản lý chi nhánh CHỈ thấy số liệu rạp mình — phạm vi lấy từ DB
    // (req.user.cinema_id), ĐÈ LÊN tham số cinemaId client gửi lên. Nếu tin
    // query string thì quản lý chỉ cần sửa URL là xem được doanh thu rạp khác.
    // Admin không bị giới hạn nên vẫn dùng bộ lọc trên giao diện như cũ.
    const scoped = getScopedCinemaId(req)
    const cinemaId = scoped ?? (req.query.cinemaId || null)

    const stats = await Ticket.getDashboardStats(cinemaId)
    const recentBookings = await Ticket.getRecentBookings(10, cinemaId)
    const operational = await Ticket.getOperationalCounts(cinemaId)

    // Bắp nước: doanh thu, món bán chạy và cảnh báo hết hàng. Với quản lý chi
    // nhánh, cinemaId đã bị ghi đè theo rạp của họ ở trên nên các số này tự
    // động chỉ còn của rạp mình.
    const ComboInventory = require("../models/ComboInventory")
    const BranchRequest = require("../models/BranchRequest")
    const [comboStats, comboCanhBao, yeuCau] = await Promise.all([
      ComboInventory.thongKeBanHang(cinemaId, 30),
      ComboInventory.canhBao(cinemaId),
      BranchRequest.demChoXuLy(cinemaId),
    ])

    const ticketChange = stats.ticketsYesterday > 0
      ? ((stats.ticketsToday - stats.ticketsYesterday) / stats.ticketsYesterday * 100).toFixed(1)
      : stats.ticketsToday > 0 ? '100.0' : '0.0'

    const revenueChange = stats.revenueYesterday > 0
      ? ((stats.revenueToday - stats.revenueYesterday) / stats.revenueYesterday * 100).toFixed(1)
      : stats.revenueToday > 0 ? '100.0' : '0.0'

    res.json({
      stats: {
        users: {
          total: stats.totalUsers,
          today: stats.newUsersToday,
          monthChange: stats.totalUsers > 0 
            ? ((stats.newUsersThisMonth / stats.totalUsers) * 100).toFixed(1)
            : '0.0'
        },
        movies: {
          total: stats.totalMovies,
          monthNew: stats.newMoviesThisMonth
        },
        tickets: {
          today: stats.ticketsToday,
          change: ticketChange
        },
        revenue: {
          today: parseFloat(stats.revenueToday),
          change: revenueChange
        },
        // Tổng thật toàn hệ thống (lọc theo rạp nếu có) — không suy ra từ mẫu
        // 10 booking gần nhất như trước, tránh hiển thị "0" khi thực tế có vé tồn.
        pendingCount: operational.pendingCount,
        pendingRevenue: parseFloat(operational.pendingRevenue),
        cancelledRecentCount: operational.cancelledRecentCount,
        recentBookings,
        // Bắp nước — thẻ mới ở trang Tổng quan
        combo: {
          revenue30d: comboStats.doanh_thu,
          orders30d: comboStats.so_don_co_combo,
          topItems: comboStats.top_mon,
          outOfStock: comboCanhBao.filter((x) => x.tinh_trang !== 'sap_het').length,
          lowStock: comboCanhBao.filter((x) => x.tinh_trang === 'sap_het').length,
          alerts: comboCanhBao.slice(0, 8),
        },
        // Yêu cầu chi nhánh gửi lên (admin thấy cả chuỗi, quản lý thấy của mình)
        branchRequests: yeuCau,
      }
    })
  } catch (error) {
    console.error("Get dashboard stats error:", error)
    res.status(500).json({ error: "Không thể tải thống kê tổng quan" })
  }
}

const getAllUsers = async (req, res) => {
  try {
    const { page, limit } = req.query
    const { rows, total, page: currentPage, limit: pageSize } = await User.findAll({ page, limit })

    // Thống kê tính bằng SQL trên TOÀN BỘ bảng users, không phải đếm trên mảng
    // `rows` của trang hiện tại. Trước đây trang admin tự đếm từ `rows` nên 4 ô
    // thống kê (tổng/quản trị viên/mới tháng này/đã khoá) chỉ phản ánh trang
    // đang xem — sang trang 2 là các con số đổi hết, và luôn bị chặn ở tối đa
    // 200 (giới hạn mỗi trang) dù hệ thống có nhiều người dùng hơn.
    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(role = 'admin') AS admins,
         SUM(is_blocked = 1) AS blocked,
         SUM(YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())) AS newThisMonth
       FROM users`,
    )

    res.json({
      users: rows,
      pagination: { page: currentPage, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
      stats: {
        total: Number(stats.total) || 0,
        admins: Number(stats.admins) || 0,
        blocked: Number(stats.blocked) || 0,
        newThisMonth: Number(stats.newThisMonth) || 0,
      },
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ error: "Không thể tải danh sách người dùng" })
  }
}

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params
    const { role, cinema_id } = req.body

    if (!["user", "cinema_manager", "admin"].includes(role)) {
      return res.status(400).json({ error: "Vai trò không hợp lệ" })
    }

    // Quản lý chi nhánh BẮT BUỘC phải gắn với đúng 1 rạp. Không ràng buộc ở
    // đây thì tài khoản quản lý "không rạp" sẽ bị requireCinemaAssigned chặn
    // mọi thao tác — admin gán xong lại tưởng hệ thống hỏng.
    let scopedCinemaId = null
    if (role === "cinema_manager") {
      if (!cinema_id) {
        return res.status(400).json({ error: "Vui lòng chọn rạp mà người này quản lý" })
      }
      const [[cinema]] = await pool.query("SELECT id FROM cinemas WHERE id = ?", [cinema_id])
      if (!cinema) {
        return res.status(400).json({ error: "Rạp được chọn không tồn tại" })
      }
      scopedCinemaId = cinema.id
    }
    // Chuyển sang admin/user thì XOÁ phạm vi rạp cũ — nếu để sót, người đó
    // sau này bị hạ lại xuống quản lý sẽ âm thầm thừa hưởng rạp cũ.

    const updated = await User.updateRole(id, role, scopedCinemaId)
    if (!updated) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" })
    }

    res.json({ message: "Cập nhật vai trò người dùng thành công" })
  } catch (error) {
    console.error("Update user role error:", error)
    res.status(500).json({ error: "Không thể cập nhật vai trò người dùng" })
  }
}

const toggleUserBlock = async (req, res) => {
  try {
    const { id } = req.params

    const updated = await User.toggleBlock(id)
    if (!updated) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" })
    }

    res.json({ message: "Cập nhật trạng thái khoá tài khoản thành công" })
  } catch (error) {
    console.error("Toggle user block error:", error)
    res.status(500).json({ error: "Không thể cập nhật trạng thái khoá tài khoản" })
  }
}

// --- Showtimes ------------------------------------------------------------
const getAllShowtimes = async (req, res) => {
  try {
    // Mặc định chỉ trả suất từ 7 ngày trước tới nay trở đi.
    //
    // Trước đây trả về TẤT CẢ 4.700+ suất, kể cả suất từ nhiều tháng trước —
    // gần 2MB JSON mỗi lần mở trang, và trang quản lý thì mặc định đã ẩn suất
    // đã qua rồi. Muốn tra cứu lịch sử thì truyền ?from= hoặc ?all=1.
    const { from, to, all } = req.query
    let khoang = {}
    if (!all) {
      const mocMacDinh = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      khoang = { from: from || mocMacDinh, ...(to ? { to } : {}) }
    } else if (from || to) {
      khoang = { ...(from ? { from } : {}), ...(to ? { to } : {}) }
    }

    // Quản lý chi nhánh chỉ thấy suất chiếu của rạp mình.
    const showtimes = await Showtime.getAllWithBookingStats(getScopedCinemaId(req), khoang)
    res.json({ showtimes })
  } catch (error) {
    console.error("Get showtimes error:", error)
    res.status(500).json({ error: "Không thể tải danh sách suất chiếu" })
  }
}

const createShowtime = async (req, res) => {
  try {
    const { movie_id, cinema_id, room_id, show_date, show_time, price, total_seats } = req.body
    if (!movie_id || !cinema_id || !show_date || !show_time) {
      return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
    }

    const normalizedPrice = Number(price || 90000)

    // Toàn bộ ràng buộc VẬT LÝ của một suất chiếu (phòng đúng rạp, không chồng
    // giờ trong cùng phòng theo thời lượng phim, không vượt sức chứa, nằm trong
    // giờ mở cửa, không ở quá khứ) nằm trong validateShowtimeSlot — dùng chung
    // hằng số với ShowtimeGeneratorService để lịch tạo tay và lịch tự động
    // không đá nhau. Trước đây đường tạo tay chỉ loại phòng TRÙNG KHÍT giờ, nên
    // vẫn xếp được 2 phim chồng lên nhau trong cùng 1 phòng chỉ cần lệch 30 phút.
    const check = await validateShowtimeSlot({
      movieId: movie_id, cinemaId: cinema_id, roomId: room_id || null,
      showDate: show_date, showTime: show_time,
      totalSeats: total_seats, price: normalizedPrice,
    })
    if (!check.ok) return res.status(check.status).json({ error: check.error })

    const id = await Showtime.create({
      movie_id, cinema_id, room_id: check.roomId, show_date, show_time,
      price: normalizedPrice, total_seats: check.totalSeats,
    })
    // Không xoá cache thì suất chiếu vừa tạo BỊ ẨN với người dùng tới 3 phút
    // (danh sách lịch chiếu đang cache) — admin dễ tưởng thao tác thất bại rồi
    // tạo lại lần nữa, sinh ra suất chiếu trùng.
    require("../middleware/cache").invalidateCache("showtimes")
    res.json({ id, message: "Tạo suất chiếu thành công" })
  } catch (error) {
    console.error("Create showtime error:", error)

    if (error && error.code === 'ER_DUP_ENTRY') {
      // Ràng buộc uq_showtimes_room_slot (room_id, show_date, show_time) — chạm
      // tới đây nghĩa là một request khác vừa chèn đúng khung giờ đó xong TRONG
      // KHOẢNG giữa lúc validateShowtimeSlot kiểm tra và lúc ghi (đua). Nói rõ
      // theo PHÒNG, vì khoá không hề có movie_id.
      return res.status(409).json({ error: "Phòng này vừa có suất chiếu khác được tạo đúng khung giờ đó. Vui lòng chọn giờ khác." })
    }

    res.status(500).json({ error: "Không thể tạo suất chiếu" })
  }
}

const deleteShowtime = async (req, res) => {
  try {
    const { id } = req.params
    const hasTickets = await Showtime.hasTickets(id)
    if (hasTickets) {
      return res.status(400).json({ error: "Không thể xoá suất chiếu đã có người đặt vé" })
    }
    await Showtime.delete(id)
    require("../middleware/cache").invalidateCache("showtimes")
    res.json({ message: "Xoá suất chiếu thành công" })
  } catch (error) {
    console.error("Delete showtime error:", error)
    res.status(500).json({ error: "Không thể xoá suất chiếu" })
  }
}

const updateShowtime = async (req, res) => {
  try {
    const { id } = req.params
    const existing = await Showtime.findById(id)
    if (!existing) return res.status(404).json({ error: "Không tìm thấy suất chiếu" })

    const { show_date, show_time, price, total_seats } = req.body
    const hasTickets = await Showtime.hasTickets(id)

    if (hasTickets) {
      // Đã có người đặt vé — đổi ngày/giờ/số ghế sẽ làm sai lệch vé khách đã mua,
      // chỉ cho phép sửa giá vé (áp dụng cho lượt đặt mới, không ảnh hưởng vé cũ).
      //
      // QUAN TRỌNG: chỉ chặn khi các trường này THẬT SỰ khác giá trị hiện tại
      // — trước đây chỉ cần các trường này XUẤT HIỆN trong request là chặn,
      // nhưng form phía admin luôn gửi kèm show_date/show_time/total_seats
      // (kể cả khi admin chỉ sửa giá vé), nên MỌI lượt sửa giá cho suất chiếu
      // đã có vé đều bị chặn oan. So sánh giờ chuẩn hoá về "HH:MM" vì input
      // type="time" của form trả về không có giây, trong khi DB trả về có giây.
      const normalizeTime = (t) => (t || "").toString().slice(0, 5)
      const changingDate = show_date !== undefined && String(show_date) !== String(existing.show_date)
      const changingTime = show_time !== undefined && normalizeTime(show_time) !== normalizeTime(existing.show_time)
      const changingSeats = total_seats !== undefined && Number(total_seats) !== Number(existing.total_seats)
      if (changingDate || changingTime || changingSeats) {
        return res.status(400).json({
          error: "Suất chiếu đã có người đặt vé — chỉ có thể sửa giá vé, không thể đổi ngày/giờ/số ghế",
        })
      }
      if (price === undefined) return res.status(400).json({ error: "Không có thông tin nào để cập nhật" })

      const normalizedPrice = Number(price)
      if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
        return res.status(400).json({ error: "Giá vé không hợp lệ" })
      }

      await Showtime.update(id, {
        movie_id: existing.movie_id, cinema_id: existing.cinema_id, room_id: existing.room_id,
        show_date: existing.show_date, show_time: existing.show_time,
        price: normalizedPrice, total_seats: existing.total_seats,
      })
      require("../middleware/cache").invalidateCache("showtimes")
      return res.json({ message: "Đã cập nhật giá vé thành công" })
    }

    // Chưa có vé nào — cho sửa đầy đủ
    const normalizedPrice = price !== undefined ? Number(price) : existing.price
    const normalizedTotalSeats = total_seats !== undefined ? Number(total_seats) : existing.total_seats

    // Đổi ngày/giờ của một suất chưa bán vé vẫn có thể đẩy nó chồng lên suất
    // khác trong CÙNG PHÒNG — kiểm tra lại đúng bộ luật của lúc tạo, nhưng bỏ
    // qua chính suất đang sửa (excludeShowtimeId) để nó không tự xung đột với
    // bản ghi cũ của mình. allowPast: cho phép sửa GIÁ của suất cũ mà không bị
    // chặn vì ngày đã qua; đổi sang một mốc quá khứ MỚI vẫn bị chặn ở trên bởi
    // chính ràng buộc ngày/giờ hợp lệ của form quản trị.
    const check = await validateShowtimeSlot({
      movieId: existing.movie_id, cinemaId: existing.cinema_id, roomId: existing.room_id,
      showDate: show_date || existing.show_date,
      showTime: show_time || existing.show_time,
      totalSeats: normalizedTotalSeats, price: normalizedPrice,
      excludeShowtimeId: Number(id), allowPast: true,
    })
    if (!check.ok) return res.status(check.status).json({ error: check.error })

    await Showtime.update(id, {
      movie_id: existing.movie_id, cinema_id: existing.cinema_id, room_id: check.roomId,
      show_date: show_date || existing.show_date,
      show_time: show_time || existing.show_time,
      price: normalizedPrice,
      total_seats: check.totalSeats,
    })
    // Chưa bán vé nào nên ghế trống luôn bằng tổng ghế sau khi sửa
    await Showtime.setAvailableSeats(id, check.totalSeats)

    require("../middleware/cache").invalidateCache("showtimes")
    res.json({ message: "Đã cập nhật suất chiếu thành công" })
  } catch (error) {
    console.error("Update showtime error:", error)
    res.status(500).json({ error: "Cập nhật suất chiếu thất bại" })
  }
}

// --- Cinemas --------------------------------------------------------------
const getAllCinemas = async (req, res) => {
  try {
    const all = await Cinema.getAllWithStats()
    // Quản lý chi nhánh chỉ thấy rạp mình trong trang "Quản lý rạp chiếu" —
    // trước đây danh sách trả về cả 3 rạp nên nhìn giao diện cứ tưởng quản lý
    // được toàn chuỗi (dù các thao tác ghi đã bị chặn ở tầng route).
    const scoped = getScopedCinemaId(req)
    const cinemas = scoped ? all.filter((c) => Number(c.id) === Number(scoped)) : all
    res.json({ cinemas })
  } catch (error) {
    console.error("Get cinemas error:", error)
    res.status(500).json({ error: "Không thể tải danh sách rạp" })
  }
}

const createCinema = async (req, res) => {
  try {
    const { name, location, address } = req.body
    const cinemaLocation = location || address
    if (!name || !cinemaLocation) return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
    const id = await Cinema.create({ name, location: cinemaLocation })
    // GET /api/cinemas cache 10 PHÚT ở server. Không xoá cache thì admin tạo
    // rạp xong tải lại trang vẫn không thấy rạp mới — tưởng thao tác thất bại.
    // (Payload này nhúng kèm danh sách phòng nên CRUD phòng cũng cần xoá.)
    require("../middleware/cache").invalidateCache("cinemas")
    res.json({ id, message: "Tạo rạp thành công" })
  } catch (error) {
    console.error("Create cinema error:", error)
    res.status(500).json({ error: "Không thể tạo rạp" })
  }
}

const updateCinema = async (req, res) => {
  try {
    const { id } = req.params
    const { name, location, address, is_active } = req.body
    const cinemaLocation = location || address

    const updated = await Cinema.update(id, { name, location: cinemaLocation, is_active })
    if (!updated) return res.status(400).json({ error: "Không có thông tin nào để cập nhật" })

    // Bao gồm cả bật/tắt trạng thái rạp — không xoá cache thì bật/tắt xong tải
    // lại trang sẽ thấy trạng thái "nhảy về như cũ".
    require("../middleware/cache").invalidateCache("cinemas", "showtimes")
    res.json({ message: "Cập nhật rạp thành công" })
  } catch (error) {
    console.error("Update cinema error:", error)
    res.status(500).json({ error: "Không thể cập nhật rạp" })
  }
}

const deleteCinema = async (req, res) => {
  try {
    const { id } = req.params
    const inUse = await Cinema.hasUsage(id)

    if (inUse) {
      // Rạp đã có phòng/suất chiếu (có thể kèm vé đã bán) — xoá cứng sẽ CASCADE
      // xoá luôn lịch sử vé do ràng buộc khoá ngoại. Thay vào đó chỉ ngừng hoạt động.
      const updated = await Cinema.update(id, { is_active: false })
      if (!updated) return res.status(404).json({ error: "Không tìm thấy rạp" })
      require("../middleware/cache").invalidateCache("cinemas", "showtimes")
      return res.json({
        message: "Rạp đã có dữ liệu suất chiếu/phòng nên không thể xoá vĩnh viễn — đã chuyển sang trạng thái ngừng hoạt động.",
      })
    }

    const deleted = await Cinema.delete(id)
    if (!deleted) return res.status(404).json({ error: "Không tìm thấy rạp" })
    require("../middleware/cache").invalidateCache("cinemas", "showtimes")
    res.json({ message: "Đã xoá rạp thành công" })
  } catch (error) {
    console.error("Delete cinema error:", error)
    res.status(500).json({ error: "Xoá rạp thất bại" })
  }
}

// --- Settings -------------------------------------------------------------
const getSettings = async (req, res) => {
  try {
    const settings = await getSystemSettings()
    res.json({ settings })
  } catch (error) {
    console.error("Get settings error:", error)
    res.status(500).json({ error: "Không thể tải cài đặt hệ thống" })
  }
}

const updateSettings = async (req, res) => {
  try {
    const settings = await updateSystemSettings(req.body || {})
    res.json({ message: "Cập nhật cài đặt hệ thống thành công", settings })
  } catch (error) {
    console.error("Update settings error:", error)
    res.status(500).json({ error: "Không thể cập nhật cài đặt hệ thống" })
  }
}

// --- Bookings -------------------------------------------------------------
const getBookings = async (req, res) => {
  try {
    // Trang quản lý đặt vé tự tính các ô thống kê (tổng đơn, đã huỷ, doanh thu)
    // TỪ CHÍNH mảng trả về này, nên trần cứng 100 sẽ âm thầm làm sai toàn bộ
    // số liệu ngay khi hệ thống vượt 100 vé (hiện đã 78) — admin không hề được
    // báo là danh sách bị cắt. Cho phép truyền limit, mặc định 1000 và chặn
    // trần 5000 để không kéo cả bảng.
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 1000, 1), 5000)
    // Quản lý chi nhánh chỉ thấy đơn đặt vé thuộc rạp mình.
    const bookings = await Ticket.getAllBookingsDetailed(limit, getScopedCinemaId(req))
    res.json({ bookings })
  } catch (error) {
    console.error('Get bookings error:', error)
    res.status(500).json({ error: 'Không thể tải danh sách đặt vé' })
  }
}

const cancelBooking = async (req, res) => {
  try {
    const { reference } = req.params
    const result = await Ticket.cancelByAdmin(reference)

    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return res.status(404).json({ error: "Không tìm thấy vé" })
      if (result.reason === "ALREADY_CANCELLED") return res.status(400).json({ error: "Vé đã được hủy trước đó" })
    }

    // Ghi lệnh hoàn tiền vào sổ (migration 49). Nhân viên huỷ vé hộ khách
    // KHÔNG đồng thời duyệt được khoản tiền đó — nguồn 'admin' không nằm trong
    // danh sách tự động duyệt, nên lệnh luôn dừng ở "chờ duyệt".
    let hoan = null
    try {
      const [[ve]] = await pool.query("SELECT id FROM tickets WHERE booking_reference = ?", [reference])
      if (ve) {
        const { deNghiHoan } = require("../services/refund.service")
        hoan = await deNghiHoan({
          ticketId: ve.id,
          nguon: "admin",
          lyDo: "Nhân viên huỷ vé theo yêu cầu",
          nguoiDeNghiId: req.user?.id,
        })
      }
    } catch (e) {
      console.error(`⚠️ KHÔNG GHI ĐƯỢC LỆNH HOÀN cho vé ${reference}:`, e.message)
    }

    res.json({
      message: "Đã hủy vé thành công",
      refund: hoan?.refundId ? { id: hoan.refundId, choDuyet: !hoan.tuDongDuyet } : null,
    })
  } catch (error) {
    console.error('Cancel booking error:', error)
    res.status(500).json({ error: 'Hủy vé thất bại' })
  }
}

// --- Birthday voucher (tự động + thủ công) ---------------------------------
// Phần "thủ công" của chương trình sinh nhật — job tự động chạy mỗi giờ (xem
// app.js/birthdayVoucher.service.js), 3 endpoint dưới đây cho admin CAN
// THIỆP TAY khi cần: xem hôm nay ai sinh nhật/đã gửi ai gần đây, ép chạy lại
// job ngay (không đợi tới lượt setInterval kế tiếp), hoặc gửi bù cho 1 khách
// cụ thể (vd khách báo chưa nhận được email, hoặc admin muốn ưu ái gửi sớm).
const getBirthdayOverview = async (req, res) => {
  try {
    const [todayBirthdays] = await pool.query(
      `SELECT id, username, full_name, email, date_of_birth FROM users
       WHERE date_of_birth IS NOT NULL
         AND MONTH(date_of_birth) = MONTH(CURDATE()) AND DAY(date_of_birth) = DAY(CURDATE())`,
    )
    const [recentGreetings] = await pool.query(
      `SELECT n.id, n.user_id, n.data, n.created_at, u.username, u.full_name, u.email
       FROM notifications n JOIN users u ON n.user_id = u.id
       WHERE n.type = 'birthday_greeting'
       ORDER BY n.created_at DESC LIMIT 30`,
    )
    const [[{ missingDobCount }]] = await pool.query(
      "SELECT COUNT(*) as missingDobCount FROM users WHERE date_of_birth IS NULL",
    )
    const activeVoucher = await birthdayVoucherService.getActiveBirthdayVoucher()

    // Cột `data` (JSON) đã được mysql2 tự parse thành object sẵn — không
    // JSON.parse lại (xem giải thích ở models/Notification.js).
    res.json({
      todayBirthdays,
      recentGreetings,
      missingDobCount,
      activeVoucher,
    })
  } catch (error) {
    console.error("Get birthday overview error:", error)
    res.status(500).json({ error: "Không thể tải dữ liệu chương trình sinh nhật" })
  }
}

const runBirthdayCheckNow = async (req, res) => {
  try {
    const result = await birthdayVoucherService.runBirthdayGreetings()
    res.json({ message: `Đã kiểm tra ${result.checked} người dùng, gửi mới cho ${result.sent} người`, ...result })
  } catch (error) {
    console.error("Run birthday check error:", error)
    res.status(500).json({ error: "Không thể chạy kiểm tra sinh nhật" })
  }
}

const sendBirthdayToUser = async (req, res) => {
  try {
    const { userId } = req.params
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: "Không tìm thấy người dùng" })

    const result = await birthdayVoucherService.greetUser(user)
    if (!result.ok) {
      return res.status(400).json({
        error: result.reason === "NO_ACTIVE_VOUCHER"
          ? "Chưa có mã ưu đãi sinh nhật nào đang bật — hãy bật ít nhất 1 mã ở trang Mã giảm giá trước"
          : "Không thể gửi ưu đãi sinh nhật",
      })
    }
    res.json({ message: `Đã gửi ưu đãi sinh nhật (mã ${result.voucherCode}) cho ${user.username}` })
  } catch (error) {
    console.error("Send birthday to user error:", error)
    res.status(500).json({ error: "Không thể gửi ưu đãi sinh nhật" })
  }
}

module.exports = {
  // Dashboard
  getDashboardStats,
  // Users
  getAllUsers,
  updateUserRole,
  toggleUserBlock,
  // Showtimes
  getAllShowtimes,
  createShowtime,
  updateShowtime,
  deleteShowtime,
  // Cinemas
  getAllCinemas,
  createCinema,
  updateCinema,
  deleteCinema,
  // Settings
  getSettings,
  updateSettings
  ,
  // Bookings
  getBookings,
  cancelBooking,
  // Birthday
  getBirthdayOverview,
  runBirthdayCheckNow,
  sendBirthdayToUser
}
