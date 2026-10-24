const Report = require("../models/Report")
// Quản lý chi nhánh chỉ được xem báo cáo của RẠP MÌNH. getScopedCinemaId
// đọc phạm vi từ req.user (DB) và ĐÈ LÊN tham số ?cinemaId= client gửi lên —
// nếu không, quản lý chỉ cần sửa URL (hoặc bỏ trống tham số) là xem được
// doanh thu toàn chuỗi. Admin không bị giới hạn nên vẫn dùng bộ lọc bình thường.
const { getScopedCinemaId } = require("../middleware/cinemaScope")

// Helpers
const parseRange = (req) => {
  const { from, to } = req.query
  return {
    from: from || "1970-01-01",
    to: to || "2999-12-31",
  }
}

const summary = async (req, res) => {
  try {
    const { from, to } = parseRange(req)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)

    const { revenue, tickets, new_users, showtimes } = await Report.getSummary(from, to, cinemaId)

    res.json({ from, to, revenue, tickets, new_users, showtimes })
  } catch (e) {
    console.error("reports.summary error", e)
    res.status(500).json({ error: "Failed to load summary" })
  }
}

const daily = async (req, res) => {
  try {
    const { from, to } = parseRange(req)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)

    const rows = await Report.getDailyRevenue(from, to, cinemaId)
    res.json({ from, to, data: rows })
  } catch (e) {
    console.error("reports.daily error", e)
    res.status(500).json({ error: "Failed to load daily report" })
  }
}

// Drill-down theo phim cho mỗi ngày — dùng trong dialog "Xem chi tiết" của "Doanh thu theo ngày".
const dailyMovieBreakdown = async (req, res) => {
  try {
    const { from, to } = parseRange(req)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)
    const rows = await Report.getDailyMovieBreakdown(from, to, cinemaId)
    res.json({ from, to, data: rows })
  } catch (e) {
    console.error("reports.dailyMovieBreakdown error", e)
    res.status(500).json({ error: "Failed to load daily movie breakdown" })
  }
}

const topMovies = async (req, res) => {
  try {
    const { from, to } = parseRange(req)
    const limit = Number(req.query.limit || 10)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)
    const rows = await Report.getTopMovies(from, to, limit, cinemaId)
    res.json({ from, to, data: rows })
  } catch (e) {
    console.error("reports.topMovies error", e)
    res.status(500).json({ error: "Failed to load top movies" })
  }
}

// Escape CSV value (xử lý dấu phẩy, dấu ngoặc kép)
const escCsv = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
const toCsvRow = (arr) => arr.map(escCsv).join(',')

// Dùng chung cho cả CSV và xem chi tiết trong app — cùng 1 nguồn dữ liệu,
// tránh lệch số liệu giữa file tải về và bảng xem trực tiếp.
const REPORT_TYPES = {
  tickets: {
    label: "Chi tiết vé đặt",
    headers: ["Mã đặt vé", "Tên KH", "Email", "Phim", "Rạp", "Ngày chiếu", "Giờ chiếu", "Ghế", "Tổng tiền", "Combo", "Trạng thái", "Thanh toán", "Thời gian đặt"],
    fetch: (from, to, cinemaId) => Report.getTicketsCsvRows(from, to, cinemaId),
    toRow: (x) => [x.booking_reference, x.username, x.email, x.movie, x.cinema, x.show_date, x.show_time, x.seats || '', x.total_amount, x.combo_total || 0, x.booking_status, x.payment_status, x.created_at],
  },
  "revenue-daily": {
    label: "Doanh thu theo ngày",
    headers: ["Ngày", "Doanh thu (VNĐ)", "Số vé", "Giá vé TB", "Doanh thu combo"],
    fetch: (from, to, cinemaId) => Report.getRevenueDailyCsvRows(from, to, cinemaId),
    toRow: (x) => [x.ngay, x.doanh_thu, x.so_ve, x.gia_tb, x.doanh_thu_combo || 0],
  },
  "top-movies": {
    label: "Top phim doanh thu",
    headers: ["Tên phim", "Doanh thu (VNĐ)", "Số vé", "Giá vé TB", "% Doanh thu"],
    fetch: (from, to, cinemaId) => Report.getTopMoviesCsvRows(from, to, cinemaId),
    toRow: (x) => [x.title, x.doanh_thu, x.so_ve, x.gia_tb, x.phan_tram + '%'],
  },
  "showtime-performance": {
    label: "Hiệu suất suất chiếu",
    headers: ["Phim", "Rạp", "Phòng", "Loại phòng", "Ngày chiếu", "Giờ chiếu", "Tổng ghế", "Đã đặt", "Còn trống", "Tỷ lệ lấp đầy (%)", "Giá vé", "DT ước tính"],
    fetch: (from, to, cinemaId) => Report.getShowtimePerformanceCsvRows(from, to, cinemaId),
    toRow: (x) => [x.phim, x.rap, x.phong || '', x.loai_phong || 'standard', x.ngay, x.gio, x.tong_ghe, x.da_dat, x.con_trong, x.ti_le_lap_day + '%', x.gia_ve, x.doanh_thu_uoc_tinh],
  },
}

async function buildReportTable(type, from, to, cinemaId) {
  const def = REPORT_TYPES[type]
  if (!def) return null
  const rawRows = await def.fetch(from, to, cinemaId)
  return { label: def.label, headers: def.headers, rows: rawRows.map(def.toRow) }
}

const csv = async (req, res) => {
  try {
    const { type } = req.params
    const { from, to } = parseRange(req)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)

    const table = await buildReportTable(type, from, to, cinemaId)
    if (!table) {
      return res.status(400).json({ error: "Loại xuất không hỗ trợ. Dùng: tickets, revenue-daily, top-movies, showtime-performance" })
    }

    // BOM UTF-8 để Excel hiển thị tiếng Việt đúng
    const bom = '﻿'
    const content = bom + [toCsvRow(table.headers), ...table.rows.map(toCsvRow)].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${from.slice(0,10)}-den-${to.slice(0,10)}.csv"`)
    res.send(content)
  } catch (e) {
    console.error("reports.csv error", e)
    res.status(500).json({ error: "Xuất CSV thất bại: " + e.message })
  }
}

// Trả về cùng dữ liệu với CSV nhưng dạng JSON, để hiển thị trực tiếp trong app
// (nút "Xem chi tiết") mà không cần tải file xuống.
const detail = async (req, res) => {
  try {
    const { type } = req.params
    const { from, to } = parseRange(req)
    const cinemaId = getScopedCinemaId(req) ?? (req.query.cinemaId || null)

    const table = await buildReportTable(type, from, to, cinemaId)
    if (!table) {
      return res.status(400).json({ error: "Loại báo cáo không hỗ trợ. Dùng: tickets, revenue-daily, top-movies, showtime-performance" })
    }

    res.json({ from, to, ...table })
  } catch (e) {
    console.error("reports.detail error", e)
    res.status(500).json({ error: "Không thể tải chi tiết báo cáo: " + e.message })
  }
}

module.exports = { summary, daily, topMovies, csv, detail, dailyMovieBreakdown }
