const { pool } = require("../config/database")

class Cinema {
  static async findAll() {
    const [cinemas] = await pool.execute("SELECT * FROM cinemas ORDER BY name")

    // Single query for all rooms instead of one query per cinema (N+1)
    const [allRooms] = await pool.execute(
      `SELECT cinema_id, id, room_name as name, room_type, total_seats as seat_capacity
       FROM rooms
       WHERE is_active = TRUE
       ORDER BY room_name`
    )
    const roomsByCinema = new Map()
    for (const room of allRooms) {
      if (!roomsByCinema.has(room.cinema_id)) roomsByCinema.set(room.cinema_id, [])
      roomsByCinema.get(room.cinema_id).push(room)
    }

    for (const cinema of cinemas) {
      cinema.is_active = cinema.status !== "INACTIVE"
      cinema.rooms = roomsByCinema.get(cinema.id) || []
    }

    return cinemas
  }

  static async findById(id) {
    const [rows] = await pool.execute("SELECT * FROM cinemas WHERE id = ?", [id])
    const cinema = rows[0]

    if (cinema) {
      cinema.is_active = cinema.status !== "INACTIVE"

      // Get rooms for this cinema
      const [rooms] = await pool.execute(
        `SELECT id, room_name as name, room_type, total_seats as seat_capacity
         FROM rooms
         WHERE cinema_id = ? AND is_active = TRUE
         ORDER BY room_name`,
        [cinema.id]
      )
      cinema.rooms = rooms
    }

    return cinema
  }

  static async getAllWithStats() {
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM rooms WHERE cinema_id = c.id AND is_active = 1) as screens,
              (SELECT COALESCE(SUM(total_seats), 0) FROM rooms WHERE cinema_id = c.id AND is_active = 1) as total_seats
       FROM cinemas c
       ORDER BY c.name`,
    )
    return rows
  }

  static async create({ name, location }) {
    const [result] = await pool.query(`INSERT INTO cinemas (name, location) VALUES (?, ?)`, [name, location])
    return result.insertId
  }

  static async update(id, { name, location, is_active }) {
    const fields = []
    const params = []
    if (name) { fields.push("name = ?"); params.push(name) }
    if (location) { fields.push("location = ?"); params.push(location) }
    if (typeof is_active !== "undefined") { fields.push("status = ?"); params.push(is_active ? "ACTIVE" : "INACTIVE") }

    if (fields.length === 0) return false

    params.push(id)
    const [result] = await pool.query(`UPDATE cinemas SET ${fields.join(", ")} WHERE id = ?`, params)
    return result.affectedRows > 0
  }

  /** True nếu rạp đã có phòng hoặc suất chiếu (kể cả trong quá khứ) — xoá cứng sẽ CASCADE xoá luôn lịch sử vé. */
  static async hasUsage(id) {
    const [[{ roomCount }]] = await pool.execute("SELECT COUNT(*) as roomCount FROM rooms WHERE cinema_id = ?", [id])
    const [[{ showtimeCount }]] = await pool.execute("SELECT COUNT(*) as showtimeCount FROM showtimes WHERE cinema_id = ?", [id])
    return roomCount > 0 || showtimeCount > 0
  }

  static async delete(id) {
    const [result] = await pool.execute("DELETE FROM cinemas WHERE id = ?", [id])
    return result.affectedRows > 0
  }
}

module.exports = Cinema
