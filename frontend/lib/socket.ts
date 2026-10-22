import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')
}

export function getSocket(): Socket {
  if (!socket) {
    const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

    // Gửi kèm JWT (nếu đã đăng nhập) để server xác thực danh tính thật —
    // server không còn tin userId client tự khai trong từng event nữa (xem
    // backend/socket/index.js). Khách chưa đăng nhập vẫn kết nối bình thường
    // (token rỗng), chỉ không "xưng danh" được 1 userId cụ thể.
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token: getAuthToken() },
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
    })
  }

  return socket
}

/** Gọi sau khi đăng nhập/đăng xuất để socket hiện tại (nếu có) kết nối lại
 * với token MỚI — không thì danh tính socket vẫn "đóng băng" ở token lúc kết
 * nối đầu tiên (vd đang xem sơ đồ ghế với tư cách khách rồi mới đăng nhập). */
export function reconnectSocketWithAuth() {
  if (socket) {
    socket.auth = { token: getAuthToken() }
    socket.disconnect().connect()
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
