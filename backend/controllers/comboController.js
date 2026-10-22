const Combo = require("../models/Combo")

/**
 * Get all available combos
 */
const getAllCombos = async (req, res) => {
  try {
    const { category, cinemaId } = req.query

    // Có cinemaId (trang đặt vé biết khách đang mua ở rạp nào) → chỉ trả món
    // rạp đó CÒN HÀNG. Không lọc theo rạp thì khách chọn được món đã hết rồi
    // mới bị từ chối ở bước thanh toán — biết trước vẫn hơn.
    if (cinemaId) {
      const ComboInventory = require('../models/ComboInventory')
      let combos = await ComboInventory.conBanTaiRap(Number(cinemaId))
      if (category) combos = combos.filter((c) => c.category === category)
      return res.json({ combos })
    }

    let combos
    if (category) {
      combos = await Combo.findByCategory(category)
    } else {
      combos = await Combo.findAll()
    }

    res.json({ combos })
  } catch (error) {
    console.error('Get combos error:', error)
    res.status(500).json({ error: 'Không thể lấy danh sách combo' })
  }
}

/**
 * Get combo by ID
 */
const getComboById = async (req, res) => {
  try {
    const { id } = req.params
    const combo = await Combo.findById(id)

    if (!combo) {
      return res.status(404).json({ error: 'Không tìm thấy combo' })
    }

    res.json({ combo })
  } catch (error) {
    console.error('Get combo error:', error)
    res.status(500).json({ error: 'Không thể lấy thông tin combo' })
  }
}

/**
 * Get popular combos
 */
const getPopularCombos = async (req, res) => {
  try {
    // Chặn trần giống getPopularMovies — tránh ?limit=999999999.
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 50)
    const combos = await Combo.getPopular(limit)

    res.json({ combos })
  } catch (error) {
    console.error('Get popular combos error:', error)
    res.status(500).json({ error: 'Không thể lấy combo phổ biến' })
  }
}

/**
 * Create combo (Admin only)
 */
const createCombo = async (req, res) => {
  try {
    const { name, description, price, category, image_url, cinema_id } = req.body

    // Validate
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Tên, giá và loại combo là bắt buộc' })
    }

    if (price < 0) {
      return res.status(400).json({ error: 'Giá không hợp lệ' })
    }

    const comboId = await Combo.create({
      name,
      description,
      price,
      category,
      image_url,
      // Bỏ trống = món bán ở MỌI rạp; có giá trị = món riêng của rạp đó (migration 47)
      cinema_id: cinema_id || null,
    })

    // Món mới phải có dòng tồn kho tương ứng, nếu không quản lý chi nhánh
    // không nhập được số hàng thật và khách cũng không mua được.
    await require("../models/ComboInventory").khoiTaoChoMon(comboId, cinema_id || null)

    const combo = await Combo.findById(comboId)

    // Danh sách combo được cache 5 phút ở server (routes/combos.js). Không xoá
    // thì combo vừa tạo/sửa/xoá không xuất hiện đúng cho khách đang đặt vé —
    // đặc biệt nguy hiểm với GIÁ combo: khách nhìn thấy giá cũ trong khi server
    // tính tiền theo giá mới lúc thanh toán, gây lệch kỳ vọng.
    require("../middleware/cache").invalidateCache("combos")
    res.status(201).json({
      message: 'Tạo combo thành công',
      combo
    })
  } catch (error) {
    console.error('Create combo error:', error)
    res.status(500).json({ error: 'Không thể tạo combo' })
  }
}

/**
 * Update combo (Admin only)
 */
const updateCombo = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, category, image_url, is_available, cinema_id } = req.body

    const updated = await Combo.update(id, {
      name,
      description,
      price,
      category,
      image_url,
      is_available,
      cinema_id,
    })

    // Đổi phạm vi món (riêng rạp ↔ toàn chuỗi) thì các rạp liên quan phải có
    // dòng tồn kho, nếu không món hiện trên menu mà không nhập hàng được.
    if (updated) await require("../models/ComboInventory").khoiTaoChoMon(id, cinema_id || null)

    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy combo' })
    }

    const combo = await Combo.findById(id)

    require("../middleware/cache").invalidateCache("combos")
    res.json({
      message: 'Cập nhật combo thành công',
      combo
    })
  } catch (error) {
    console.error('Update combo error:', error)
    res.status(500).json({ error: 'Không thể cập nhật combo' })
  }
}

/**
 * Delete combo (Admin only)
 */
const deleteCombo = async (req, res) => {
  try {
    const { id } = req.params

    // Xem chú thích Combo.hasOrderHistory — chặn xoá cứng nếu combo đã từng
    // được đặt, vì đơn cũ sẽ không còn tra ra tên/giá combo đó nữa.
    const hasHistory = await Combo.hasOrderHistory(id)
    if (hasHistory) {
      return res.status(400).json({
        error: 'Combo này đã có trong đơn hàng — không thể xoá vĩnh viễn vì sẽ mất hiển thị trên lịch sử đặt vé. Hãy ẩn combo (tắt "còn bán") thay vì xoá.',
      })
    }

    const deleted = await Combo.delete(id)

    if (!deleted) {
      return res.status(404).json({ error: 'Không tìm thấy combo' })
    }

    require("../middleware/cache").invalidateCache("combos")
    res.json({ message: 'Xóa combo thành công' })
  } catch (error) {
    console.error('Delete combo error:', error)
    res.status(500).json({ error: 'Không thể xóa combo' })
  }
}

/**
 * Toggle combo availability (Admin only)
 */
const toggleComboAvailability = async (req, res) => {
  try {
    const { id } = req.params

    const updated = await Combo.toggleAvailability(id)

    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy combo' })
    }

    const combo = await Combo.findById(id)

    // Bật/tắt "còn bán" là thao tác admin dùng nhiều nhất (hết hàng tạm thời) —
    // thiếu bước này thì combo đã tắt vẫn hiện cho khách chọn thêm 5 phút nữa.
    require("../middleware/cache").invalidateCache("combos")
    res.json({
      message: 'Cập nhật trạng thái combo thành công',
      combo
    })
  } catch (error) {
    console.error('Toggle combo error:', error)
    res.status(500).json({ error: 'Không thể cập nhật trạng thái combo' })
  }
}

module.exports = {
  getAllCombos,
  getComboById,
  getPopularCombos,
  createCombo,
  updateCombo,
  deleteCombo,
  toggleComboAvailability
}
