const { Server } = require("socket.io")
const jwt = require("jsonwebtoken")

let io = null

// Track active seat selections per showtime
// Structure: { showtimeId: { seatId: { userId, socketId, timestamp } } }
const activeSeatSelections = new Map()

// Cleanup interval (every 30 seconds, remove selections older than 5 minutes)
const SELECTION_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const CLEANUP_INTERVAL = 30 * 1000 // 30 seconds

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  })

  // Xác thực TUỲ CHỌN qua JWT — khách vẫn xem được sơ đồ ghế mà không cần
  // đăng nhập (đặt vé thật vẫn được bảo vệ riêng qua verifyToken + SeatLock ở
  // tầng REST API), NHƯNG nếu client claim 1 userId cụ thể, danh tính đó PHẢI
  // được xác thực qua JWT — không tin trực tiếp userId do client tự gửi
  // trong payload của từng event nữa. Trước đây bất kỳ ai kết nối socket đều
  // có thể tự xưng là userId của người khác (vd userId của 1 người đang thật
  // sự chọn ghế) rồi gửi "deselect-seats"/"select-seats" để phá/chiếm lựa
  // chọn ghế đang hiển thị của họ.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.data.authenticatedUserId = decoded.id
      } catch {
        // Token sai/hết hạn — coi như khách, KHÔNG chặn kết nối (chỉ ảnh
        // hưởng khả năng xem ghế trực tiếp, không phải bảo mật đặt vé thật)
      }
    }
    next()
  })

  io.on("connection", (socket) => {
    console.log(`✅ Socket connected: ${socket.id}`)
    // Danh tính THẬT dùng cho mọi thao tác trong phiên kết nối này — ưu tiên
    // userId đã xác thực qua JWT; nếu là khách, dùng 1 định danh gắn với
    // chính socket này (không đoán/giả mạo được) thay vì tin userId client tự khai.
    const identityUserId = socket.data.authenticatedUserId ?? `guest-${socket.id}`

    // Join showtime room
    socket.on("join-showtime", (data) => {
      const { showtimeId } = data
      const userId = identityUserId
      socket.join(`showtime-${showtimeId}`)
      socket.data.showtimeId = showtimeId
      socket.data.userId = userId

      console.log(`User ${userId} joined showtime ${showtimeId}`)

      // Send current active selections for this showtime
      const showtimeSelections = activeSeatSelections.get(showtimeId) || {}
      socket.emit("active-selections", Object.entries(showtimeSelections).map(([seatId, data]) => ({
        seatId,
        userId: data.userId,
        isCurrentUser: data.userId === userId,
        // Kèm mốc hết hạn để khách quay lại tab (hoặc tải lại trang) vẫn thấy
        // đồng hồ chạy tiếp từ đúng chỗ máy chủ đang đếm, không bắt đầu lại.
        expiresAt: data.expiresAt || (data.timestamp + SELECTION_TIMEOUT),
      })))
    })

    // Select seats
    socket.on("select-seats", (data) => {
      const { showtimeId, seats } = data
      const userId = identityUserId

      if (!showtimeId || !seats) {
        socket.emit("error", { message: "Missing required data" })
        return
      }

      // Initialize showtime map if not exists
      if (!activeSeatSelections.has(showtimeId)) {
        activeSeatSelections.set(showtimeId, {})
      }

      const showtimeSeats = activeSeatSelections.get(showtimeId)

      // Add selections
      const now = Date.now()
      const hetHanLuc = now + SELECTION_TIMEOUT
      seats.forEach(seatId => {
        // Only allow if seat is not selected by another user
        if (!showtimeSeats[seatId] || showtimeSeats[seatId].userId === userId) {
          showtimeSeats[seatId] = {
            userId,
            socketId: socket.id,
            timestamp: now,
            // Mốc hết hạn tính SẴN ở máy chủ và gửi xuống, thay vì để trình
            // duyệt tự đếm 5 phút. Client tự đếm thì tải lại trang là đồng hồ
            // nhảy về đủ 5 phút trong khi máy chủ vẫn giữ mốc cũ — hai bên
            // lệch nhau, khách tưởng còn thời gian mà ghế đã bị nhả.
            expiresAt: hetHanLuc,
          }
        }
      })

      // Broadcast to all users in showtime room except sender
      socket.to(`showtime-${showtimeId}`).emit("seats-selected", {
        seats,
        userId,
        expiresAt: hetHanLuc,
      })

      // Báo RIÊNG cho chính người vừa chọn biết ghế của họ giữ tới lúc nào —
      // socket.to() ở trên CỐ TÌNH loại người gửi, nên nếu không có dòng này
      // thì chính chủ là người duy nhất không biết mình còn bao nhiêu thời gian.
      socket.emit("my-selection-expiry", { seats, expiresAt: hetHanLuc })

      console.log(`User ${userId} selected seats in showtime ${showtimeId}:`, seats)
    })

    // Deselect seats
    socket.on("deselect-seats", (data) => {
      const { showtimeId, seats } = data
      const userId = identityUserId

      if (!showtimeId || !seats) return

      const showtimeSeats = activeSeatSelections.get(showtimeId)
      if (!showtimeSeats) return

      // Remove selections
      seats.forEach(seatId => {
        if (showtimeSeats[seatId] && showtimeSeats[seatId].userId === userId) {
          delete showtimeSeats[seatId]
        }
      })

      // Broadcast to all users in showtime room except sender
      socket.to(`showtime-${showtimeId}`).emit("seats-deselected", {
        seats,
        userId
      })

      console.log(`User ${userId} deselected seats in showtime ${showtimeId}:`, seats)
    })

    // Leave showtime room
    socket.on("leave-showtime", (data) => {
      const { showtimeId } = data
      const userId = identityUserId
      if (showtimeId) {
        socket.leave(`showtime-${showtimeId}`)
        
        // Remove all selections from this user
        const showtimeSeats = activeSeatSelections.get(showtimeId)
        if (showtimeSeats) {
          const releasedSeats = []
          Object.entries(showtimeSeats).forEach(([seatId, seatData]) => {
            if (seatData.userId === userId) {
              releasedSeats.push(seatId)
              delete showtimeSeats[seatId]
            }
          })

          if (releasedSeats.length > 0) {
            socket.to(`showtime-${showtimeId}`).emit("seats-deselected", {
              seats: releasedSeats,
              userId
            })
          }
        }

        console.log(`User ${userId} left showtime ${showtimeId}`)
      }
    })

    // Disconnect
    // Bọc TOÀN BỘ thân hàm trong try/catch: đây là hàm xử lý sự kiện BẤT ĐỒNG
    // BỘ, nên lỗi ném ra ở đây không ai hứng — Node coi là "unhandled
    // rejection" và có thể làm sập cả tiến trình máy chủ. Dọn ghế thất bại chỉ
    // là chuyện nhỏ (vòng quét 30 giây sẽ dọn nốt), không đáng để chết server.
    socket.on("disconnect", async () => {
      try {
      console.log(`❌ Socket disconnected: ${socket.id}`)

      // Clean up selections from this socket
      const { showtimeId, userId } = socket.data
      if (showtimeId && userId) {
        const showtimeSeats = activeSeatSelections.get(showtimeId)
        if (showtimeSeats) {
          // TẢI LẠI TRANG KHÔNG ĐƯỢC LÀM MẤT GHẾ ĐANG CHỌN.
          //
          // Mỗi lần khách bấm F5 hay chuyển tab, socket cũ rớt và socket mới
          // nối vào. Nếu cứ nhả ghế theo socket cũ thì ghế biến mất ngay trước
          // mắt khách — và tệ hơn, thông báo phát cho CẢ PHÒNG nên chính tab
          // mới của họ cũng nhận được và tưởng là đã hết giờ.
          //
          // Nếu cùng người dùng đó vẫn còn socket khác trong phòng thì CHUYỂN
          // QUYỀN giữ ghế sang socket đó thay vì nhả.
          let socketKhacCuaHo = null
          try {
            const dsSocket = await io.in(`showtime-${showtimeId}`).fetchSockets()
            socketKhacCuaHo = dsSocket.find(
              (s) => s.id !== socket.id && String(s.data?.userId) === String(userId),
            )
          } catch (_) {
            // fetchSockets lỗi thì cứ xử lý như cũ — nhả ghế, không để treo.
          }

          const releasedSeats = []
          Object.entries(showtimeSeats).forEach(([seatId, seatData]) => {
            if (seatData.socketId !== socket.id) return
            if (socketKhacCuaHo) {
              seatData.socketId = socketKhacCuaHo.id // chuyển quyền, giữ nguyên hạn
              return
            }
            releasedSeats.push(seatId)
            delete showtimeSeats[seatId]
          })

          if (releasedSeats.length > 0) {
            io.to(`showtime-${showtimeId}`).emit("seats-deselected", {
              seats: releasedSeats,
              userId,
              lyDo: "mat-ket-noi",
            })
          }
        }
      }
      } catch (e) {
        console.error("⚠️ Lỗi dọn ghế khi socket ngắt kết nối:", e.message)
      }
    })
  })

  // Cleanup old selections periodically
  setInterval(() => {
    const now = Date.now()
    activeSeatSelections.forEach((showtimeSeats, showtimeId) => {
      Object.entries(showtimeSeats).forEach(([seatId, seatData]) => {
        if (now - seatData.timestamp > SELECTION_TIMEOUT) {
          console.log(`⏰ Cleaning up stale selection: showtime ${showtimeId}, seat ${seatId}`)
          delete showtimeSeats[seatId]

          // Notify users
          // `lyDo` PHẢI có ở đây: đây là chỗ DUY NHẤT ghế bị nhả vì HẾT GIỜ.
          // Các chỗ khác (khách tự bỏ chọn, socket rớt, rời phòng) cũng phát
          // cùng tên sự kiện, nên nếu không phân biệt thì giao diện sẽ báo
          // "đã hết thời gian giữ chỗ" mỗi lần khách chỉ tải lại trang.
          io.to(`showtime-${showtimeId}`).emit("seats-deselected", {
            seats: [seatId],
            userId: seatData.userId,
            lyDo: "het-han",
          })
        }
      })
      // Xoá luôn entry showtimeId RỖNG khỏi Map ngoài — nếu không, mọi
      // showtimeId từng có ai đó chọn ghế sẽ để lại 1 object {} tồn tại vĩnh
      // viễn trong bộ nhớ, không bao giờ được giải phóng suốt vòng đời server.
      if (Object.keys(showtimeSeats).length === 0) {
        activeSeatSelections.delete(showtimeId)
      }
    })
  }, CLEANUP_INTERVAL)

  console.log("🔌 Socket.IO initialized")
  
  return io
}

function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocket first.")
  }
  return io
}

module.exports = {
  initializeSocket,
  getIO
}
