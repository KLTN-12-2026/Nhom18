const { pool } = require("../config/database")

class Combo {
  /**
   * Get all available combos
   */
  static async findAll() {
    const [rows] = await pool.execute(
      'SELECT * FROM combos WHERE is_available = 1 ORDER BY category, price'
    )
    return rows
  }

  /**
   * Get combo by category
   */
  static async findByCategory(category) {
    const [rows] = await pool.execute(
      'SELECT * FROM combos WHERE category = ? AND is_available = 1 ORDER BY price',
      [category]
    )
    return rows
  }

  /**
   * Get combo by ID
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM combos WHERE id = ?',
      [id]
    )
    return rows[0]
  }

  /**
   * Create new combo (admin)
   */
  static async create(comboData) {
    // cinema_id = null nghĩa là món bán ở MỌI rạp; có giá trị = món riêng của
    // rạp đó (xem migration 47).
    const { name, description, price, category, image_url, cinema_id = null } = comboData

    const [result] = await pool.execute(
      'INSERT INTO combos (name, description, price, category, image_url, cinema_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description ?? null, price, category, image_url ?? null, cinema_id || null]
    )
    
    return result.insertId
  }

  /**
   * Update combo (admin)
   */
  static async update(id, comboData) {
    const { name, description, price, category, image_url, is_available, cinema_id } = comboData

    const [result] = await pool.execute(
      `UPDATE combos SET name = ?, description = ?, price = ?, category = ?, image_url = ?,
              is_available = ?, cinema_id = ? WHERE id = ?`,
      [name, description ?? null, price, category, image_url ?? null, is_available,
       cinema_id === undefined ? null : (cinema_id || null), id]
    )
    
    return result.affectedRows > 0
  }

  // tickets.combo_items lưu combo_id trong JSON, KHÔNG có FK/CASCADE (khác
  // showtimes.movie_id) — xoá cứng 1 combo đã có trong đơn hàng cũ không xoá
  // theo dữ liệu vé, nhưng khiến các đơn đó không còn tra được tên/giá combo
  // gốc để hiển thị lại (JSON_CONTAINS join sẽ không khớp gì nữa). Dùng trước
  // khi delete() để quyết định chặn hay cho xoá, cùng nguyên tắc đã áp dụng
  // cho Movie.hasTicketHistory/Cinema.hasUsage — dù ở đây hậu quả là mất
  // hiển thị, không mất dữ liệu, vẫn nên chặn để khớp UX với 2 chỗ kia.
  static async hasOrderHistory(id) {
    const [[{ orderCount }]] = await pool.query(
      "SELECT COUNT(*) AS orderCount FROM tickets WHERE JSON_CONTAINS(combo_items, JSON_OBJECT('combo_id', CAST(? AS UNSIGNED)))",
      [id],
    )
    return orderCount > 0
  }

  /**
   * Delete combo (admin)
   */
  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM combos WHERE id = ?',
      [id]
    )
    
    return result.affectedRows > 0
  }

  /**
   * Toggle availability (admin)
   */
  static async toggleAvailability(id) {
    const [result] = await pool.execute(
      'UPDATE combos SET is_available = NOT is_available WHERE id = ?',
      [id]
    )
    
    return result.affectedRows > 0
  }

  /**
   * Get popular combos (most ordered)
   */
  static async getPopular(limit = 5) {
    const [rows] = await pool.query(
      `SELECT c.*, COUNT(t.id) as order_count
       FROM combos c
       LEFT JOIN tickets t ON JSON_CONTAINS(t.combo_items, JSON_OBJECT('combo_id', c.id))
       WHERE c.is_available = 1
       GROUP BY c.id
       ORDER BY order_count DESC, c.price
       LIMIT ?`,
      [limit]
    )
    
    return rows
  }

  /**
   * Gắn kèm name/price hiện tại của combo vào từng item TRƯỚC KHI lưu vào
   * tickets.combo_items — validateComboItems()/calculateComboTotal() chỉ
   * kiểm tra hợp lệ và tính tổng tiền, KHÔNG lưu lại name/price vào chính
   * item, nên trước đây tickets.combo_items chỉ có {combo_id, quantity}.
   * Frontend (trang "Vé của tôi") lại hiển thị theo combo.name/combo.price —
   * không có bước enrich nào cả nên MỌI đơn có combo đều hiện tên rỗng
   * ("Combo") và giá 0đ, dù comboTotal/total_amount vẫn tính đúng.
   *
   * Chụp lại (snapshot) name/price NGAY LÚC ĐẶT VÉ — giống cách
   * ticket_seats.price đã snapshot giá ghế — để hoá đơn cũ không bao giờ đổi
   * theo nếu admin sau này đổi giá/tên combo, hay thậm chí xoá hẳn combo đó.
   */
  static async enrichComboItems(comboItems) {
    if (!comboItems || comboItems.length === 0) return []

    const enriched = []
    for (const item of comboItems) {
      const combo = await this.findById(item.combo_id)
      if (combo) {
        enriched.push({
          combo_id: item.combo_id,
          quantity: item.quantity,
          name: combo.name,
          price: combo.price,
        })
      }
    }
    return enriched
  }

  /**
   * Calculate total price for combo items
   */
  static async calculateComboTotal(comboItems) {
    if (!comboItems || comboItems.length === 0) {
      return 0
    }

    let total = 0
    
    for (const item of comboItems) {
      const combo = await this.findById(item.combo_id)
      if (combo && combo.is_available) {
        total += combo.price * item.quantity
      }
    }
    
    return total
  }

  /**
   * Validate combo items
   */
  static async validateComboItems(comboItems) {
    const errors = []
    
    if (!Array.isArray(comboItems)) {
      return { valid: false, errors: ['Combo items must be an array'] }
    }

    for (const item of comboItems) {
      if (!item.combo_id || !item.quantity) {
        errors.push('Each combo item must have combo_id and quantity')
        continue
      }

      if (item.quantity < 1 || item.quantity > 10) {
        errors.push(`Invalid quantity for combo ${item.combo_id}: must be 1-10`)
        continue
      }

      const combo = await this.findById(item.combo_id)
      if (!combo) {
        errors.push(`Combo with ID ${item.combo_id} not found`)
      } else if (!combo.is_available) {
        errors.push(`Combo "${combo.name}" is not available`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}

module.exports = Combo
