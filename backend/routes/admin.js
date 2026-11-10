const express = require("express")
const {
	getDashboardStats,
	getAllUsers,
	updateUserRole,
	toggleUserBlock,
	getAllShowtimes,
	createShowtime,
	updateShowtime,
	deleteShowtime,
	getAllCinemas,
	createCinema,
	updateCinema,
	deleteCinema,
	getSettings,
	updateSettings,
	getBookings,
	cancelBooking,
	getBirthdayOverview,
	runBirthdayCheckNow,
	sendBirthdayToUser
} = require("../controllers/adminController")
const {
	generateWeeklyShowtimes,
	previewGeneration,
	getGenerationStats,
	deleteWeekShowtimes,
	getTrendingMovies,
	boostMovieShowtimes
} = require("../controllers/showtimeGeneratorController")
const { verifyToken, requireAdmin, requireStaff } = require("../middleware/auth")
const { requireCinemaAssigned, requireOwnCinema } = require("../middleware/cinemaScope")
const { pool } = require("../config/database")

const router = express.Router()

// All admin routes require authentication
// Tra rạp mà một suất chiếu / một đơn đặt vé thuộc về — dùng cho
// requireOwnCinema ở các route sửa/xoá, nơi client chỉ gửi id chứ không gửi
// cinema_id. Trả null nếu không tìm thấy để handler tự trả 404 đúng ngữ cảnh.
const cinemaIdOfShowtime = async (req) => {
  const [[row]] = await pool.query('SELECT cinema_id FROM showtimes WHERE id = ?', [req.params.id])
  return row?.cinema_id ?? null
}

const cinemaIdOfBooking = async (req) => {
  const [[row]] = await pool.query(
    `SELECT s.cinema_id FROM tickets t
     JOIN showtimes s ON s.id = t.showtime_id
     WHERE t.booking_reference = ?`,
    [req.params.reference],
  )
  return row?.cinema_id ?? null
}

router.use(verifyToken)

// Dashboard (admin + cinema manager)
router.get("/dashboard", requireStaff, getDashboardStats)

// User management (admin only)
router.get("/users", requireAdmin, getAllUsers)
router.put("/users/:id/role", requireAdmin, updateUserRole)
router.put("/users/:id/toggle-block", requireAdmin, toggleUserBlock)

// ── Suất chiếu ────────────────────────────────────────────────────────────
// Quản lý chi nhánh chỉ thao tác được trên rạp MÌNH QUẢN LÝ:
//  - danh sách: lọc sẵn trong controller (getScopedCinemaId)
//  - tạo mới  : đối chiếu cinema_id trong body
//  - sửa/xoá  : tra rạp của chính suất chiếu đó trong DB rồi đối chiếu
router.get('/showtimes', requireStaff, requireCinemaAssigned, getAllShowtimes)
router.post('/showtimes', requireStaff, requireCinemaAssigned,
  requireOwnCinema((req) => req.body?.cinema_id), createShowtime)
router.put('/showtimes/:id', requireStaff, requireCinemaAssigned,
  requireOwnCinema(cinemaIdOfShowtime), updateShowtime)
router.delete('/showtimes/:id', requireStaff, requireCinemaAssigned,
  requireOwnCinema(cinemaIdOfShowtime), deleteShowtime)

// ── Báo sự cố suất chiếu (mất điện, hỏng máy chiếu...) ─────────────────────
// Quản lý chi nhánh là người biết sự cố đầu tiên nên được quyền báo — nhưng
// chỉ cho suất của rạp mình (requireOwnCinema), giống quy tắc sửa/xoá suất.
// body: { type: 'cancelled'|'notice', reason, message?, delayMinutes?, preview? }
const suCo = require('../services/showtimeIncident.service')
const { getScopedCinemaId } = require('../middleware/cinemaScope')
router.post('/showtimes/:id/incident', requireStaff, requireCinemaAssigned,
  requireOwnCinema(cinemaIdOfShowtime), async (req, res) => {
    try {
      const ketQua = await suCo.baoSuCo({
        showtimeId: Number(req.params.id),
        loai: req.body?.type,
        lyDo: req.body?.reason,
        loiNhan: req.body?.message,
        treMinutes: req.body?.delayMinutes,
        nguoiBaoId: req.user.id,
        nguoiBao: { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email },
        xemTruoc: req.body?.preview === true,
      })
      res.json({ success: true, data: ketQua })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ success: false, error: e.message })
      console.error('Báo sự cố suất chiếu lỗi:', e)
      res.status(500).json({ success: false, error: 'Không xử lý được báo sự cố' })
    }
  })
// ── Kho bắp nước theo từng rạp ────────────────────────────────────────────
// Danh mục món là cấp chuỗi (chỉ admin sửa qua /api/combos), còn TỒN KHO là
// việc của từng chi nhánh nên quản lý rạp tự cập nhật được — đúng thực tế:
// người đứng quầy mới biết còn bao nhiêu bắp.
const ComboInventory = require('../models/ComboInventory')
const BranchRequest = require('../models/BranchRequest')
const branchNotify = require('../services/branchNotify.service')

/** Rạp đang thao tác: quản lý chi nhánh luôn bị ghim vào rạp mình, admin tự chọn. */
const rapDangXem = (req) => {
  const scoped = getScopedCinemaId(req)
  return scoped ?? (Number(req.query.cinemaId || req.body?.cinemaId) || null)
}

router.get('/combo-inventory', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const cinemaId = rapDangXem(req)
    if (!cinemaId) return res.status(400).json({ success: false, error: 'Vui lòng chọn rạp' })
    res.json({ success: true, data: await ComboInventory.theoRap(cinemaId), cinemaId })
  } catch (e) {
    console.error('Lấy kho bắp nước lỗi:', e)
    res.status(500).json({ success: false, error: 'Không lấy được tồn kho' })
  }
})

router.put('/combo-inventory/:comboId', requireStaff, requireCinemaAssigned,
  requireOwnCinema((req) => req.body?.cinemaId), async (req, res) => {
    try {
      const cinemaId = rapDangXem(req)
      if (!cinemaId) return res.status(400).json({ success: false, error: 'Vui lòng chọn rạp' })
      const comboId = Number(req.params.comboId)
      // Chụp lại giá trị TRƯỚC khi sửa để nhật ký ghi được 'từ X thành Y' —
      // chỉ ghi giá trị mới thì admin không biết chi nhánh đã đổi bao nhiêu.
      const truoc = (await ComboInventory.theoRap(cinemaId)).find((m) => m.id === comboId)
      const ok = await ComboInventory.datTonKho(cinemaId, comboId, {
        tonKho: req.body?.tonKho,
        nguongCanhBao: req.body?.nguongCanhBao,
        tamNgung: req.body?.tamNgung,
      })
      if (!ok) return res.status(400).json({ success: false, error: 'Không có thông tin nào để cập nhật' })

      const nguoiBao = { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email }
      const hanhDong = req.body?.tamNgung !== undefined
        ? (req.body.tamNgung ? 'tam_ngung_mon' : 'mo_ban_mon')
        : 'sua_ton_kho'
      await branchNotify.ghiHoatDong({
        cinemaId, userId: req.user.id, hanhDong, doiTuong: truoc?.name, nguoiBao,
        chiTiet: {
          comboId,
          tonKhoCu: truoc?.ton_kho, tonKhoMoi: req.body?.tonKho != null ? Number(req.body.tonKho) : truoc?.ton_kho,
          nguongCu: truoc?.nguong_canh_bao, nguongMoi: req.body?.nguongCanhBao != null ? Number(req.body.nguongCanhBao) : truoc?.nguong_canh_bao,
        },
      })
      res.json({ success: true, data: await ComboInventory.theoRap(cinemaId) })
    } catch (e) {
      console.error('Cập nhật kho bắp nước lỗi:', e)
      res.status(500).json({ success: false, error: 'Không cập nhật được tồn kho' })
    }
  })

// ── Menu của chi nhánh: thêm / sửa / xoá món ──────────────────────────────
// Quản lý chi nhánh được tự thêm món cho rạp MÌNH (quầy rạp nào có món nấy,
// chờ admin duyệt thì hết ca). Nhưng chỉ được đụng vào món RIÊNG của rạp —
// món chung cả chuỗi (cinema_id NULL) vẫn là quyết định cấp chuỗi.
const Combo = require('../models/Combo')

/** Món này quản lý chi nhánh có quyền sửa/xoá không? */
const kiemTraQuyenSuaMon = async (req, comboId) => {
  const mon = await Combo.findById(comboId)
  if (!mon) return { loi: 'Không tìm thấy món', status: 404 }
  const scoped = getScopedCinemaId(req)
  if (scoped == null) return { mon } // admin: sửa được mọi món
  if (mon.cinema_id == null) {
    return { loi: 'Đây là món chung của cả chuỗi, chỉ quản trị viên được sửa. Bạn có thể gửi yêu cầu thay vào đó.', status: 403 }
  }
  if (Number(mon.cinema_id) !== Number(scoped)) {
    return { loi: 'Món này thuộc rạp khác', status: 403 }
  }
  return { mon }
}

router.post('/combo-menu', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const scoped = getScopedCinemaId(req)
    // Quản lý chi nhánh: LUÔN gắn món vào rạp mình, không cho tạo món toàn chuỗi.
    const cinemaId = scoped ?? (req.body?.cinema_id ? Number(req.body.cinema_id) : null)
    const { name, price, category, description, image_url } = req.body || {}
    if (!name || !price || !category) {
      return res.status(400).json({ success: false, error: 'Tên, giá và nhóm món là bắt buộc' })
    }
    if (Number(price) <= 0) return res.status(400).json({ success: false, error: 'Giá không hợp lệ' })

    const comboId = await Combo.create({ name, description, price, category, image_url, cinema_id: cinemaId })
    await ComboInventory.khoiTaoChoMon(comboId, cinemaId)

    const nguoiBao = { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email }
    await branchNotify.ghiHoatDong({
      cinemaId: cinemaId ?? Number(req.body?.cinema_id) ?? 0,
      userId: req.user.id, hanhDong: 'them_mon', doiTuong: name, nguoiBao,
      chiTiet: { comboId, gia: price, rapRieng: cinemaId != null },
    })
    res.status(201).json({ success: true, data: await Combo.findById(comboId) })
  } catch (e) {
    console.error('Thêm món lỗi:', e)
    res.status(500).json({ success: false, error: 'Không thêm được món' })
  }
})

router.put('/combo-menu/:id', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const { mon, loi: loiQuyen, status } = await kiemTraQuyenSuaMon(req, req.params.id)
    if (loiQuyen) return res.status(status).json({ success: false, error: loiQuyen })

    const scoped = getScopedCinemaId(req)
    const cinemaIdMoi = scoped != null ? scoped : (req.body?.cinema_id ? Number(req.body.cinema_id) : null)
    await Combo.update(req.params.id, {
      name: req.body?.name ?? mon.name,
      description: req.body?.description ?? mon.description,
      price: req.body?.price ?? mon.price,
      category: req.body?.category ?? mon.category,
      image_url: req.body?.image_url ?? mon.image_url,
      is_available: req.body?.is_available !== undefined ? (req.body.is_available ? 1 : 0) : mon.is_available,
      cinema_id: cinemaIdMoi,
    })
    await ComboInventory.khoiTaoChoMon(req.params.id, cinemaIdMoi)

    const nguoiBao = { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email }
    await branchNotify.ghiHoatDong({
      cinemaId: cinemaIdMoi ?? mon.cinema_id ?? 0,
      userId: req.user.id, hanhDong: 'sua_mon', doiTuong: req.body?.name ?? mon.name, nguoiBao,
      chiTiet: { comboId: Number(req.params.id), gia: req.body?.price ?? mon.price, rapRieng: cinemaIdMoi != null },
    })
    res.json({ success: true, data: await Combo.findById(req.params.id) })
  } catch (e) {
    console.error('Sửa món lỗi:', e)
    res.status(500).json({ success: false, error: 'Không sửa được món' })
  }
})

router.delete('/combo-menu/:id', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const { mon, loi: loiQuyen, status } = await kiemTraQuyenSuaMon(req, req.params.id)
    if (loiQuyen) return res.status(status).json({ success: false, error: loiQuyen })

    // Món đã từng có trong đơn hàng không xoá cứng được — xem Combo.hasOrderHistory
    if (await Combo.hasOrderHistory(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Món này đã có trong đơn hàng — hãy tạm ngưng bán thay vì xoá, để lịch sử đặt vé cũ vẫn tra ra tên món.',
      })
    }
    await Combo.delete(req.params.id)
    const nguoiBao = { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email }
    await branchNotify.ghiHoatDong({
      cinemaId: mon.cinema_id ?? getScopedCinemaId(req) ?? 0,
      userId: req.user.id, hanhDong: 'xoa_mon', doiTuong: mon.name, nguoiBao,
      chiTiet: { comboId: Number(req.params.id) },
    })
    require('../middleware/cache').invalidateCache('combos')
    res.json({ success: true })
  } catch (e) {
    console.error('Xoá món lỗi:', e)
    res.status(500).json({ success: false, error: 'Không xoá được món' })
  }
})

/** Nhật ký hoạt động chi nhánh — admin xem cả chuỗi, quản lý xem rạp mình. */
router.get('/branch-activity', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const scoped = getScopedCinemaId(req)
    const cinemaId = scoped ?? (Number(req.query.cinemaId) || null)
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS cinema_name,
              COALESCE(u.full_name, u.username, u.email) AS nguoi_thuc_hien
       FROM branch_activity a
       JOIN cinemas c ON c.id = a.cinema_id
       LEFT JOIN users u ON u.id = a.user_id
       ${cinemaId ? 'WHERE a.cinema_id = ?' : ''}
       ORDER BY a.created_at DESC LIMIT 50`,
      cinemaId ? [cinemaId] : [],
    )
    const NHAN = branchNotify.NHAN_HANH_DONG
    res.json({ success: true, data: rows.map((r) => ({ ...r, hanh_dong_nhan: NHAN[r.hanh_dong] || r.hanh_dong })) })
  } catch (e) {
    console.error('Lấy nhật ký hoạt động lỗi:', e)
    res.status(500).json({ success: false, error: 'Không lấy được nhật ký hoạt động' })
  }
})

// ── Yêu cầu chi nhánh gửi admin ───────────────────────────────────────────
router.get('/requests', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const data = await BranchRequest.danhSach({
      cinemaId: getScopedCinemaId(req) ?? (Number(req.query.cinemaId) || null),
      trangThai: req.query.status || null,
      limit: req.query.limit,
    })
    res.json({ success: true, data })
  } catch (e) {
    console.error('Lấy danh sách yêu cầu lỗi:', e)
    res.status(500).json({ success: false, error: 'Không lấy được danh sách yêu cầu' })
  }
})

router.post('/requests', requireStaff, requireCinemaAssigned,
  requireOwnCinema((req) => req.body?.cinemaId), async (req, res) => {
    try {
      const cinemaId = rapDangXem(req)
      if (!cinemaId) return res.status(400).json({ success: false, error: 'Vui lòng chọn rạp' })
      const id = await BranchRequest.tao({
        cinemaId,
        nguoiGui: req.user.id,
        loai: req.body?.loai,
        comboId: req.body?.comboId,
        soLuong: req.body?.soLuong,
        tieuDe: req.body?.tieuDe,
        noiDung: req.body?.noiDung,
        mucDo: req.body?.mucDo,
      })
      const [yeuCau] = await BranchRequest.danhSach({ cinemaId, limit: 1 })
      await branchNotify.ghiHoatDong({
        cinemaId, userId: req.user.id, hanhDong: 'gui_yeu_cau', doiTuong: yeuCau?.tieu_de,
        chiTiet: { requestId: id, loai: yeuCau?.loai }, chiGhiNhatKy: true,
      })
      await branchNotify.baoYeuCauMoi(yeuCau)
      res.status(201).json({ success: true, data: yeuCau, id })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ success: false, error: e.message })
      console.error('Tạo yêu cầu lỗi:', e)
      res.status(500).json({ success: false, error: 'Không gửi được yêu cầu' })
    }
  })

// Chỉ ADMIN được duyệt: cấp thêm hàng là quyết định chi phí cấp chuỗi.
router.put('/requests/:id', requireAdmin, async (req, res) => {
  try {
    const yeuCau = await BranchRequest.xuLy(Number(req.params.id), {
      trangThai: req.body?.trangThai,
      phanHoi: req.body?.phanHoi,
      nguoiXuLy: req.user.id,
    })
    await branchNotify.baoDaXuLy(yeuCau, {
      trangThai: yeuCau.trang_thai,
      phanHoi: req.body?.phanHoi,
      daCongKho: yeuCau.da_cong_kho,
    })
    res.json({ success: true, data: yeuCau })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Xử lý yêu cầu lỗi:', e)
    res.status(500).json({ success: false, error: 'Không xử lý được yêu cầu' })
  }
})

// Sự cố DIỆN RỘNG: mất điện cả rạp, sửa chữa một dãy phòng… Chọn rạp + phòng
// + khoảng giờ rồi xử lý một lượt thay vì bấm từng suất.
// body: { roomIds?, tuLuc, denLuc, type, reason, message?, delayMinutes?, preview? }
router.post('/incidents/bulk', requireStaff, requireCinemaAssigned,
  requireOwnCinema((req) => req.body?.cinemaId), async (req, res) => {
    try {
      const cinemaId = getScopedCinemaId(req) ?? Number(req.body?.cinemaId)
      if (!cinemaId) return res.status(400).json({ success: false, error: 'Vui lòng chọn rạp' })
      const ketQua = await suCo.baoSuCoHangLoat({
        cinemaId,
        roomIds: req.body?.roomIds,
        tuLuc: req.body?.tuLuc,
        denLuc: req.body?.denLuc,
        loai: req.body?.type,
        lyDo: req.body?.reason,
        loiNhan: req.body?.message,
        treMinutes: req.body?.delayMinutes,
        nguoiBaoId: req.user.id,
        nguoiBao: { role: req.user.role, ten: req.user.full_name || req.user.username || req.user.email },
        xemTruoc: req.body?.preview === true,
      })
      res.json({ success: true, data: ketQua })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ success: false, error: e.message })
      console.error('Báo sự cố hàng loạt lỗi:', e)
      res.status(500).json({ success: false, error: 'Không xử lý được báo sự cố hàng loạt' })
    }
  })

// KHÔI PHỤC SUẤT ĐÃ HUỶ — CHỈ QUẢN TRỊ VIÊN (migration 49).
// Quản lý chi nhánh huỷ được suất của rạp mình (xử lý sự cố phải nhanh), nhưng
// không khôi phục được: nếu người huỷ cũng là người khôi phục thì thao tác
// khẩn cấp không còn ai kiểm soát — bấm nhầm, xoá dấu vết, bấm lại như chưa
// có gì xảy ra. Quyền ghi đè phải nằm ở cấp trên người thực hiện.
// body: { lyDo?, preview? }
router.post('/showtimes/:id/restore', requireAdmin, async (req, res) => {
  try {
    const ketQua = await suCo.khoiPhucSuat({
      showtimeId: Number(req.params.id),
      nguoiKhoiPhucId: req.user.id,
      lyDo: req.body?.lyDo,
      xemTruoc: req.body?.preview === true,
    })
    res.json({ success: true, data: ketQua })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Khôi phục suất chiếu lỗi:', e)
    res.status(500).json({ success: false, error: 'Không khôi phục được suất chiếu' })
  }
})

// ── Hoàn tiền ─────────────────────────────────────────────────────────────
// PHÂN VAI (xem migration 49 và refund.service.js):
//   Xem sổ         : nhân viên — quản lý chi nhánh chỉ thấy rạp mình
//   Đề nghị hoàn   : nhân viên
//   DUYỆT / TỪ CHỐI: CHỈ quản trị viên — người tạo ra lý do hoàn tiền không
//                    được là người phê duyệt khoản tiền đó
const hoanTien = require('../services/refund.service')

router.get('/refunds', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const data = await hoanTien.danhSach({
      cinemaId: getScopedCinemaId(req) ?? (Number(req.query.cinemaId) || null),
      trangThai: req.query.trangThai || null,
      limit: req.query.limit,
    })
    res.json({ success: true, data })
  } catch (e) {
    console.error('Lấy sổ hoàn tiền lỗi:', e)
    res.status(500).json({ success: false, error: 'Không lấy được sổ hoàn tiền' })
  }
})

// Đề nghị hoàn tiền cho một vé cụ thể (ngoài luồng sự cố) — vd khách khiếu nại
// tại quầy. Không tự duyệt: nguồn 'admin' luôn dừng ở "chờ duyệt".
router.post('/refunds', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const ticketId = Number(req.body?.ticketId)
    if (!ticketId) return res.status(400).json({ success: false, error: 'Thiếu mã vé' })
    if (!String(req.body?.lyDo || '').trim()) {
      return res.status(400).json({ success: false, error: 'Phải ghi lý do hoàn tiền' })
    }

    // Quản lý chi nhánh chỉ đề nghị được cho vé của rạp mình.
    const scoped = getScopedCinemaId(req)
    if (scoped) {
      const [[ve]] = await pool.query(
        'SELECT s.cinema_id FROM tickets t JOIN showtimes s ON s.id = t.showtime_id WHERE t.id = ?',
        [ticketId],
      )
      if (!ve) return res.status(404).json({ success: false, error: 'Không tìm thấy vé' })
      if (Number(ve.cinema_id) !== Number(scoped)) {
        return res.status(403).json({ success: false, error: 'Vé này không thuộc rạp bạn quản lý' })
      }
    }

    const kq = await hoanTien.deNghiHoan({
      ticketId,
      nguon: 'admin',
      lyDo: req.body.lyDo,
      kenh: req.body?.kenh,
      nguoiDeNghiId: req.user.id,
    })
    if (!kq.taoMoi && kq.lyDo === 'CHUA_THANH_TOAN') {
      return res.status(400).json({ success: false, error: 'Vé này chưa thanh toán, không có gì để hoàn' })
    }
    if (!kq.taoMoi && kq.lyDo === 'DA_CO_LENH_HOAN') {
      return res.status(409).json({ success: false, error: 'Vé này đã có lệnh hoàn tiền trong sổ' })
    }
    res.json({ success: true, data: kq })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Đề nghị hoàn tiền lỗi:', e)
    res.status(500).json({ success: false, error: 'Không tạo được đề nghị hoàn tiền' })
  }
})

router.put('/refunds/:id/duyet', requireAdmin, async (req, res) => {
  try {
    const kq = await hoanTien.duyet(Number(req.params.id), {
      nguoiDuyetId: req.user.id,
      kenh: req.body?.kenh,
      ghiChu: req.body?.ghiChu,
      ipAddr: req.ip,
      // Bỏ qua bước tra cứu giao dịch trước khi hoàn. Dùng khi cổng trả mã 94
      // ("đang xử lý") cho giao dịch vừa thanh toán xong — mã đó không nói
      // giao dịch có vấn đề, nhưng làm bước tra cứu không kết luận được.
      boQuaTraCuu: req.body?.boQuaTraCuu === true,
    })
    res.json({ success: true, data: kq })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Duyệt hoàn tiền lỗi:', e)
    res.status(500).json({ success: false, error: 'Không duyệt được lệnh hoàn tiền' })
  }
})

router.put('/refunds/:id/tu-choi', requireAdmin, async (req, res) => {
  try {
    const kq = await hoanTien.tuChoi(Number(req.params.id), {
      nguoiDuyetId: req.user.id,
      lyDo: req.body?.lyDo,
    })
    res.json({ success: true, data: kq })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Từ chối hoàn tiền lỗi:', e)
    res.status(500).json({ success: false, error: 'Không từ chối được lệnh hoàn tiền' })
  }
})

// Thu ngân xác nhận đã chi tiền mặt tại quầy — nhân viên làm được vì đây là
// ghi nhận một việc đã xảy ra ngoài đời, không phải quyết định chi tiền
// (quyết định đó nằm ở bước duyệt, chỉ quản trị viên).
router.put('/refunds/:id/da-chi', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const kq = await hoanTien.xacNhanDaChi(Number(req.params.id), {
      nguoiXacNhanId: req.user.id,
      ghiChu: req.body?.ghiChu,
    })
    res.json({ success: true, data: kq })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Xác nhận chi tiền mặt lỗi:', e)
    res.status(500).json({ success: false, error: 'Không xác nhận được' })
  }
})

// Tra cứu giao dịch ở cổng thanh toán — CHỈ ĐỌC, không đụng tới tiền.
// Dùng khi một lệnh hoàn báo "không rõ kết quả": tra trước rồi mới quyết định
// có gửi lại hay không, tránh hoàn tiền hai lần.
router.get('/refunds/:id/tra-cuu-cong', requireAdmin, async (req, res) => {
  try {
    const Refund = require('../models/Refund')
    const r = await Refund.layTheoId(Number(req.params.id))
    if (!r) return res.status(404).json({ success: false, error: 'Không tìm thấy lệnh hoàn tiền' })

    const gd = await hoanTien.layGiaoDichGoc(r.ticket_id)
    if (!gd || gd.payment_method !== 'vnpay') {
      return res.status(400).json({ success: false, error: 'Vé này không có giao dịch VNPay để tra cứu' })
    }
    const { truyVanGiaoDich } = require('../services/vnpayRefund.service')
    const kq = await truyVanGiaoDich({
      txnRef: gd.gateway_order_id,
      transactionNo: gd.gateway_transaction_id,
      payDate: gd.callback?.vnp_PayDate,
      ipAddr: req.ip,
    })
    res.json({ success: true, data: kq })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message })
    console.error('Tra cứu giao dịch lỗi:', e)
    res.status(500).json({ success: false, error: 'Không tra cứu được giao dịch' })
  }
})

router.get('/incidents', requireStaff, requireCinemaAssigned, async (req, res) => {
  try {
    const data = await suCo.lichSu({ cinemaId: getScopedCinemaId(req), limit: req.query.limit })
    res.json({ success: true, data })
  } catch (e) {
    console.error('Lấy nhật ký sự cố lỗi:', e)
    res.status(500).json({ success: false, error: 'Không lấy được nhật ký sự cố' })
  }
})

// ── Rạp chiếu ─────────────────────────────────────────────────────────────
// TẠO và XOÁ rạp chuyển sang CHỈ ADMIN. Trước đây chỉ cần requireStaff, nghĩa
// là một quản lý chi nhánh xoá được rạp của chi nhánh khác — rủi ro lớn nhất
// trong toàn bộ phân quyền cũ (xoá rạp kéo theo phòng/suất chiếu của rạp đó).
// Quản lý vẫn SỬA được thông tin rạp mình (đổi tên/địa chỉ/tạm đóng).
router.get('/cinemas', requireStaff, getAllCinemas)
router.post('/cinemas', requireAdmin, createCinema)
router.put('/cinemas/:id', requireStaff, requireCinemaAssigned,
  requireOwnCinema((req) => req.params.id), updateCinema)
router.delete('/cinemas/:id', requireAdmin, deleteCinema)

// ── Đặt vé ────────────────────────────────────────────────────────────────
router.get('/bookings', requireStaff, requireCinemaAssigned, getBookings)
router.post('/bookings/:reference/cancel', requireStaff, requireCinemaAssigned,
  requireOwnCinema(cinemaIdOfBooking), cancelBooking)

// ── Tự động tạo lịch chiếu — CHỈ ADMIN ────────────────────────────────────
// Generator hoạt động trên TOÀN BỘ chuỗi rạp (ShowtimeGeneratorService lặp
// qua mọi cinemaId), và deleteWeekShowtimes xoá lịch cả tuần của MỌI rạp chứ
// không riêng rạp nào. Để ở mức requireStaff thì một quản lý chi nhánh có thể
// tạo/xoá lịch của các rạp khác — vượt xa phạm vi chi nhánh mình, nguy hiểm
// hơn cả việc xoá rạp. Các thao tác này mang tính điều phối toàn chuỗi nên
// thuộc về admin.
router.post('/showtimes/generate', requireAdmin, generateWeeklyShowtimes)
router.post('/showtimes/preview', requireAdmin, previewGeneration)
router.get('/showtimes/stats', requireAdmin, getGenerationStats)
router.delete('/showtimes/week/:weekStart', requireAdmin, deleteWeekShowtimes)
router.get('/showtimes/trending', requireAdmin, getTrendingMovies)
router.post('/showtimes/boost/:movieId', requireAdmin, boostMovieShowtimes)

// Settings (admin only)
router.get('/settings', requireAdmin, getSettings)
router.post('/settings', requireAdmin, updateSettings)

// Chương trình ưu đãi sinh nhật — phần điều khiển THỦ CÔNG (admin + cinema manager)
// Chiến dịch sinh nhật chạy trên TOÀN BỘ bảng users (không thuộc rạp nào) và
// thực sự GỬI EMAIL kèm ưu đãi — một hành động ở cấp chuỗi, không phải cấp rạp.
router.get('/birthday/overview', requireAdmin, getBirthdayOverview)
router.post('/birthday/run', requireAdmin, runBirthdayCheckNow)
router.post('/birthday/users/:userId/send', requireAdmin, sendBirthdayToUser)

module.exports = router
