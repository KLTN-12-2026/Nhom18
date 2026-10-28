const Room = require("../models/Room")

/**
 * Get all rooms
 */
const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.findAll()
    res.json({ rooms })
  } catch (error) {
    console.error("Get all rooms error:", error)
    res.status(500).json({ error: "Không thể lấy danh sách phòng" })
  }
}

/**
 * Get room by ID
 */
const getRoomById = async (req, res) => {
  try {
    const { id } = req.params
    const room = await Room.findById(id)

    if (!room) {
      return res.status(404).json({ error: "Không tìm thấy phòng" })
    }

    res.json({ room })
  } catch (error) {
    console.error("Get room by ID error:", error)
    res.status(500).json({ error: "Không thể lấy thông tin phòng" })
  }
}

/**
 * Get rooms by cinema
 */
const getRoomsByCinema = async (req, res) => {
  try {
    const { cinema_id } = req.params
    const rooms = await Room.findByCinema(cinema_id)
    res.json({ rooms })
  } catch (error) {
    console.error("Get rooms by cinema error:", error)
    res.status(500).json({ error: "Không thể lấy danh sách phòng" })
  }
}

/**
 * Get room schedule
 */
const getRoomSchedule = async (req, res) => {
  try {
    const { id } = req.params
    const { date } = req.query

    if (!date) {
      return res.status(400).json({ error: "Vui lòng cung cấp ngày" })
    }

    const schedule = await Room.getSchedule(id, date)
    res.json({ schedule })
  } catch (error) {
    console.error("Get room schedule error:", error)
    res.status(500).json({ error: "Không thể lấy lịch chiếu phòng" })
  }
}

/**
 * Get available rooms
 */
const getAvailableRooms = async (req, res) => {
  try {
    const { cinema_id } = req.params
    const { date, time } = req.query

    if (!date || !time) {
      return res.status(400).json({ error: "Vui lòng cung cấp ngày và giờ" })
    }

    const rooms = await Room.getAvailableRooms(cinema_id, date, time)
    res.json({ rooms })
  } catch (error) {
    console.error("Get available rooms error:", error)
    res.status(500).json({ error: "Không thể lấy danh sách phòng trống" })
  }
}

/**
 * Create new room (Admin only)
 */
const createRoom = async (req, res) => {
  try {
    const { cinema_id, room_name, total_seats, room_type, features } = req.body

    if (!cinema_id || !room_name) {
      return res.status(400).json({ error: "Vui lòng cung cấp cinema_id và room_name" })
    }

    const roomId = await Room.create({
      cinema_id,
      room_name,
      total_seats: total_seats || 100,
      room_type: room_type || 'standard',
      features
    })

    const room = await Room.findById(roomId)
    // Danh sách phòng được nhúng trong payload GET /api/cinemas (cache 10 phút).
    require("../middleware/cache").invalidateCache("cinemas")
    res.status(201).json({
      message: "Tạo phòng thành công",
      room
    })
  } catch (error) {
    console.error("Create room error:", error)
    res.status(500).json({ 
      error: "Không thể tạo phòng"
    })
  }
}

/**
 * Update room (Admin only)
 */
const updateRoom = async (req, res) => {
  try {
    const { id } = req.params
    const { room_name, total_seats, room_type, features, is_active } = req.body

    const updated = await Room.update(id, {
      room_name,
      total_seats,
      room_type,
      features,
      is_active
    })

    if (!updated) {
      return res.status(404).json({ error: "Không tìm thấy phòng hoặc không có gì để cập nhật" })
    }

    const room = await Room.findById(id)
    require("../middleware/cache").invalidateCache("cinemas")
    res.json({
      message: "Cập nhật phòng thành công",
      room
    })
  } catch (error) {
    console.error("Update room error:", error)
    res.status(500).json({ error: "Không thể cập nhật phòng" })
  }
}

/**
 * Delete room (Admin only)
 */
const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params
    const deleted = await Room.delete(id)

    if (!deleted) {
      return res.status(404).json({ error: "Không tìm thấy phòng" })
    }

    require("../middleware/cache").invalidateCache("cinemas")
    res.json({ message: "Xóa phòng thành công" })
  } catch (error) {
    console.error("Delete room error:", error)
    res.status(500).json({ error: "Không thể xóa phòng" })
  }
}

/**
 * Get room statistics (Admin only)
 */
const getRoomStatistics = async (req, res) => {
  try {
    const { id } = req.params
    const { start_date, end_date } = req.query

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "Vui lòng cung cấp start_date và end_date" })
    }

    const statistics = await Room.getStatistics(id, start_date, end_date)
    res.json({ statistics })
  } catch (error) {
    console.error("Get room statistics error:", error)
    res.status(500).json({ error: "Không thể lấy thống kê phòng" })
  }
}

module.exports = {
  getAllRooms,
  getRoomById,
  getRoomsByCinema,
  getRoomSchedule,
  getAvailableRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomStatistics
}
