const express = require("express")
const {
  bookTicket,
  getUserTickets,
  getTicketDetail,
  getAllTickets,
  cancelTicket,
  getTicketStats,
  cancelMyTicket,
} = require("../controllers/ticketController")
const { verifyToken, requireUser, requireAdmin } = require("../middleware/auth")
const { bookingLimiter } = require("../middleware/rateLimiter")
const { validateCreateTicket } = require("../middleware/inputValidation")

const router = express.Router()

// User routes with rate limiting and validation
router.post("/book", 
  verifyToken, 
  requireUser, 
  bookingLimiter,
  validateCreateTicket,
  bookTicket
)
router.get("/my-tickets", verifyToken, requireUser, getUserTickets)

/**
 * LỆNH HOÀN TIỀN CỦA CHÍNH KHÁCH (migration 49).
 *
 * Trước endpoint này, khách huỷ vé xong không có chỗ nào tra được tiền của
 * mình đang ở đâu — chỉ thấy vé đổi thành "đã huỷ" rồi im lặng. Sổ hoàn tiền
 * là dữ liệu nội bộ, nhưng phần liên quan tới khách thì khách phải xem được.
 *
 * Chỉ trả về các trường khách cần, KHÔNG trả phản hồi nguyên văn của cổng hay
 * tên người duyệt — đó là dữ liệu đối soát nội bộ.
 */
router.get("/my-refunds", verifyToken, requireUser, async (req, res) => {
  try {
    const { pool } = require("../config/database")
    const cauHinhHoan = require("../config/refund.config")
    const [rows] = await pool.query(
      `SELECT r.id, r.so_tien, r.kenh, r.trang_thai, r.ly_do, r.ma_giao_dich_hoan,
              r.created_at, r.duyet_luc,
              t.booking_reference, m.title AS movie_title,
              DATE_FORMAT(s.show_date, '%Y-%m-%d') AS show_date,
              TIME_FORMAT(s.show_time, '%H:%i') AS show_time,
              c.name AS cinema_name,
              v.code AS voucher_code, v.valid_until AS voucher_han,
              r.phuong_thuc_goc, r.kenh_khach_chon, r.khach_chon_luc,
              -- Mã giao dịch THANH TOÁN gốc: luôn có sẵn ngay từ lúc trả tiền,
              -- khác với mã giao dịch HOÀN (chỉ có sau khi cổng chấp nhận lệnh).
              -- Khách cần cả hai khi đi đối chiếu với ngân hàng.
              r.ma_giao_dich_goc
         FROM refunds r
         JOIN tickets t ON t.id = r.ticket_id
         LEFT JOIN showtimes s ON s.id = t.showtime_id
         LEFT JOIN movies m ON m.id = s.movie_id
         LEFT JOIN cinemas c ON c.id = r.cinema_id
         LEFT JOIN vouchers v ON v.id = r.voucher_id
        WHERE t.user_id = ?
        ORDER BY r.created_at DESC`,
      [req.user.id],
    )

    // Diễn giải cho khách hiểu — khách không cần biết mã trạng thái nội bộ.
    const NHAN = {
      cho_duyet: { nhan: "Đang chờ duyệt", moTa: "Yêu cầu hoàn tiền đã được ghi nhận, rạp đang xử lý." },
      da_duyet: { nhan: "Đã duyệt, đang xử lý", moTa: "Rạp đã duyệt hoàn tiền, đang thực hiện." },
      dang_gui_cong: { nhan: "Đang gửi tới ngân hàng", moTa: "Lệnh hoàn đã được gửi sang cổng thanh toán." },
      thanh_cong: { nhan: "Đã hoàn tiền", moTa: null },
      that_bai: { nhan: "Cần hỗ trợ", moTa: "Hoàn tiền chưa thực hiện được, rạp sẽ liên hệ với bạn." },
      tu_choi: { nhan: "Không được hoàn", moTa: "Yêu cầu hoàn tiền không được chấp nhận. Liên hệ quầy vé để biết thêm." },
    }
    const MO_TA_KENH = {
      cong_thanh_toan: "Hoàn về phương thức thanh toán ban đầu",
      voucher: "Bồi thường bằng voucher",
      diem_thuong: "Cộng vào điểm thưởng",
      tien_mat: "Nhận tiền mặt tại quầy",
    }

    res.json({
      cauHinh: {
        // Nói thật về môi trường thay vì hứa "tiền về thẻ trong 3–7 ngày".
        la_thu_nghiem: cauHinhHoan.MOI_TRUONG.LA_SANDBOX,
        ghi_chu_thu_nghiem: cauHinhHoan.MOI_TRUONG.LA_SANDBOX
          ? cauHinhHoan.MOI_TRUONG.GHI_CHU_SANDBOX
          : null,
      },
      refunds: rows.map((r) => ({
        ...r,
        so_tien: Number(r.so_tien),
        // Khách còn đổi được cách nhận tiền khi khoản đó chưa thực hiện xong.
        duoc_chon_lai:
          cauHinhHoan.KHACH_CHON.BAT &&
          ["cho_duyet", "da_duyet", "that_bai"].includes(r.trang_thai),
        trang_thai_nhan: NHAN[r.trang_thai]?.nhan || r.trang_thai,
        trang_thai_mo_ta: NHAN[r.trang_thai]?.moTa || null,
        kenh_nhan: MO_TA_KENH[r.kenh] || r.kenh,
        // Tiền về thẻ là việc của ngân hàng phát hành, cổng không quyết định được
        ghi_chu_thoi_gian:
          r.trang_thai === "thanh_cong" && r.kenh === "cong_thanh_toan"
            ? cauHinhHoan.MOI_TRUONG.LA_SANDBOX
              ? "Lệnh hoàn đã được cổng thanh toán tiếp nhận. Đây là môi trường thử nghiệm nên không có tiền thật chuyển về thẻ."
              : "Tiền về tài khoản/thẻ trong 3–7 ngày làm việc tuỳ ngân hàng."
            : null,
      })),
    })
  } catch (e) {
    console.error("Lấy lệnh hoàn tiền của khách lỗi:", e)
    res.status(500).json({ error: "Không lấy được thông tin hoàn tiền" })
  }
})

/**
 * KHÁCH CHỌN CÁCH NHẬN TIỀN HOÀN (migration 50).
 *
 * body: { kenh: 'voucher' | 'cong_thanh_toan' }
 *
 * Quyền sở hữu kiểm bằng dữ liệu trong CSDL (xem khachChonKenh), KHÔNG tin
 * user_id do client gửi — nếu không, ai cũng đổi được kênh hoàn của người khác
 * thành voucher rồi... không lấy được gì, nhưng phá được khoản tiền của họ.
 */
router.put("/my-refunds/:id/chon-kenh", verifyToken, requireUser, async (req, res) => {
  try {
    const { khachChonKenh } = require("../services/refund.service")
    const kq = await khachChonKenh(Number(req.params.id), req.user.id, req.body?.kenh)
    res.json({
      success: true,
      daThucHien: kq.daThucHien === true,
      voucherCode: kq.voucher_code || null,
      trangThai: kq.trang_thai,
      message: kq.daThucHien
        ? "Đã phát voucher bồi thường cho bạn, dùng được ngay cho lần đặt vé sau."
        : "Đã ghi nhận lựa chọn của bạn. Rạp sẽ hoàn tiền theo đúng cách bạn chọn.",
    })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    console.error("Khách chọn kênh hoàn tiền lỗi:", e)
    res.status(500).json({ error: "Không ghi nhận được lựa chọn" })
  }
})
// "/stats" PHẢI khai báo trước "/:id" — Express khớp theo thứ tự, nên trước
// đây GET /stats bị "/:id" bắt mất (coi "stats" là mã vé) và luôn trả 404.
router.get("/stats", verifyToken, requireAdmin, getTicketStats)
router.get("/:id", verifyToken, requireUser, getTicketDetail)
router.put("/:id/cancel-my", verifyToken, requireUser, cancelMyTicket)

// Admin routes
router.get("/", verifyToken, requireAdmin, getAllTickets)
router.put("/:id/cancel", verifyToken, requireAdmin, cancelTicket)

module.exports = router
