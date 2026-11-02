import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket } from '@/lib/socket'

interface UseSeatSocketOptions {
  showtimeId: number
  userId: number | null
  onSeatsSelected?: (data: { seats: string[]; userId: number; expiresAt?: number }) => void
  /** lyDo: "het-han" = het 5 phut giu cho | "mat-ket-noi" = socket rot */
  onSeatsDeselected?: (data: { seats: string[]; userId: number; lyDo?: string }) => void
  onActiveSelections?: (
    selections: Array<{ seatId: string; userId: number; isCurrentUser: boolean; expiresAt?: number }>
  ) => void
  /**
   * Máy chủ báo riêng cho CHÍNH người vừa chọn biết ghế giữ tới lúc nào.
   * Cần vì sự kiện 'seats-selected' cố tình không gửi lại cho người gửi, nên
   * chính chủ là người duy nhất không biết mình còn bao nhiêu thời gian.
   */
  onMySelectionExpiry?: (data: { seats: string[]; expiresAt: number }) => void
  onSeatsPurchased?: (data: { showtimeId: number; seats: string[]; ticketId: number }) => void
  /** Người khác vừa GIỮ ghế (bước thanh toán) — khác với 'đang chọn ghế' */
  onSeatsLocked?: (data: { showtimeId: number; seats: string[]; userId: number | null }) => void
  onSeatsUnlocked?: (data: { showtimeId: number; seats: string[]; userId: number | null }) => void
}

export function useSeatSocket(options: UseSeatSocketOptions) {
  const { showtimeId, userId } = options
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // true khi socket.io đã thử reconnect hết số lần cho phép và bỏ cuộc hẳn —
  // trước đây không lắng nghe sự kiện này, nên UI cứ hiện mãi "Đang kết nối
  // real-time..." dù thực ra đã ngừng thử từ lâu, khiến người dùng tưởng vẫn
  // đang có bảo vệ chống trùng ghế real-time trong khi thực ra không còn nữa.
  const [connectionFailed, setConnectionFailed] = useState(false)

  // ✅ Lưu callbacks vào ref → không phải dependency của effect
  // Mỗi render ref được cập nhật nhưng effect KHÔNG re-run
  const cbRef = useRef(options)
  useEffect(() => {
    cbRef.current = options
  })

  useEffect(() => {
    // Chỉ kết nối khi đã đăng nhập
    if (!userId) {
      setIsConnected(false)
      return
    }

    const socket = getSocket()
    socketRef.current = socket

    // ── Event handlers dùng ref để luôn gọi callback mới nhất ──
    const handleConnect = () => {
      setIsConnected(true)
      setConnectionFailed(false)
      socket.emit('join-showtime', { showtimeId, userId })
    }

    const handleDisconnect = () => setIsConnected(false)
    const handleReconnectFailed = () => setConnectionFailed(true)

    const handleSeatsSelected = (data: { seats: string[]; userId: number; expiresAt?: number }) => {
      cbRef.current.onSeatsSelected?.(data)
    }

    const handleMyExpiry = (data: { seats: string[]; expiresAt: number }) => {
      cbRef.current.onMySelectionExpiry?.(data)
    }

    const handleSeatsDeselected = (data: { seats: string[]; userId: number; lyDo?: string }) => {
      cbRef.current.onSeatsDeselected?.(data)
    }

    const handleActiveSelections = (
      selections: Array<{ seatId: string; userId: number; isCurrentUser: boolean; expiresAt?: number }>
    ) => {
      cbRef.current.onActiveSelections?.(selections)
    }

    const handleSeatsLocked = (data: { showtimeId: number; seats: string[]; userId: number | null }) => {
      cbRef.current.onSeatsLocked?.(data)
    }
    const handleSeatsUnlocked = (data: { showtimeId: number; seats: string[]; userId: number | null }) => {
      cbRef.current.onSeatsUnlocked?.(data)
    }
    const handleSeatsPurchased = (data: { showtimeId: number; seats: string[]; ticketId: number }) => {
      cbRef.current.onSeatsPurchased?.(data)
    }

    // Nếu socket đã kết nối → join room ngay
    if (socket.connected) {
      handleConnect()
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('reconnect_failed', handleReconnectFailed)
    socket.on('seats-selected', handleSeatsSelected)
    socket.on('my-selection-expiry', handleMyExpiry)
    socket.on('seats-deselected', handleSeatsDeselected)
    socket.on('active-selections', handleActiveSelections)
    socket.on('seats-purchased', handleSeatsPurchased)
    socket.on('seats-locked', handleSeatsLocked)
    socket.on('seats-unlocked', handleSeatsUnlocked)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('reconnect_failed', handleReconnectFailed)
      socket.off('seats-selected', handleSeatsSelected)
      socket.off('my-selection-expiry', handleMyExpiry)
      socket.off('seats-deselected', handleSeatsDeselected)
      socket.off('active-selections', handleActiveSelections)
      socket.off('seats-purchased', handleSeatsPurchased)
      socket.off('seats-locked', handleSeatsLocked)
      socket.off('seats-unlocked', handleSeatsUnlocked)
      // Rời phòng khi unmount hoặc khi showtimeId/userId thay đổi
      socket.emit('leave-showtime', { showtimeId, userId })
    }
  }, [showtimeId, userId]) // ✅ Chỉ 2 dependency thực sự cần thiết

  const selectSeats = (seats: string[]) => {
    if (socketRef.current?.connected && userId) {
      socketRef.current.emit('select-seats', { showtimeId, seats, userId })
    }
  }

  const deselectSeats = (seats: string[]) => {
    if (socketRef.current?.connected && userId) {
      socketRef.current.emit('deselect-seats', { showtimeId, seats, userId })
    }
  }

  return { isConnected, connectionFailed, selectSeats, deselectSeats }
}
