jest.mock('../config/database', () => ({ pool: { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn() } }))

const ComboInventory = require('../models/ComboInventory')

/**
 * Kho bắp nước tính RIÊNG từng rạp (migration 46). Phần dễ sai nhất là lúc
 * trừ kho: phải là thao tác NGUYÊN TỬ ở tầng MySQL (UPDATE ... WHERE ton_kho >= ?),
 * không được "đọc rồi mới ghi" — nếu không, hai khách cùng mua suất cuối cùng
 * sẽ cùng lọt qua và kho âm.
 */
function mockConnection({ affectedRows = 1, tenMon = 'Coca Cola (M)' } = {}) {
  const calls = []
  return {
    calls,
    execute: jest.fn((sql, params) => {
      calls.push({ sql, params })
      if (sql.includes('SELECT name FROM combos')) return [[{ name: tenMon }]]
      return [{ affectedRows }]
    }),
  }
}

describe('ComboInventory.tru — trừ kho khi khách đặt combo', () => {
  test('trừ đúng số lượng, đúng rạp, và chỉ bằng MỘT câu UPDATE có điều kiện', async () => {
    const conn = mockConnection({ affectedRows: 1 })

    await ComboInventory.tru(conn, 2, [{ combo_id: 6, quantity: 3 }])

    expect(conn.calls).toHaveLength(1)
    const { sql, params } = conn.calls[0]
    expect(sql).toContain('UPDATE combo_inventory')
    // Điều kiện ton_kho >= ? chính là thứ chặn bán quá số hàng đang có
    expect(sql).toContain('ton_kho >= ?')
    expect(sql).toContain('tam_ngung = 0')
    expect(params).toEqual([3, 2, 6, 3])
  })

  test('hết hàng thì ném COMBO_OUT_OF_STOCK kèm TÊN MÓN để báo cho khách', async () => {
    const conn = mockConnection({ affectedRows: 0, tenMon: 'Bắp Rang Bơ (L)' })

    await expect(ComboInventory.tru(conn, 1, [{ combo_id: 5, quantity: 2 }]))
      .rejects.toMatchObject({ code: 'COMBO_OUT_OF_STOCK', tenMon: 'Bắp Rang Bơ (L)' })
  })

  test('đơn nhiều món: món đầu trừ được nhưng món sau hết thì cả đơn hỏng (transaction rollback)', async () => {
    let lan = 0
    const conn = {
      calls: [],
      execute: jest.fn((sql, params) => {
        conn.calls.push({ sql, params })
        if (sql.includes('SELECT name FROM combos')) return [[{ name: 'Snack Mix' }]]
        lan += 1
        return [{ affectedRows: lan === 1 ? 1 : 0 }] // món thứ hai hết hàng
      }),
    }

    await expect(ComboInventory.tru(conn, 1, [
      { combo_id: 6, quantity: 1 },
      { combo_id: 10, quantity: 1 },
    ])).rejects.toMatchObject({ code: 'COMBO_OUT_OF_STOCK', tenMon: 'Snack Mix' })
  })

  test('bỏ qua dòng không hợp lệ (thiếu mã món hoặc số lượng ≤ 0)', async () => {
    const conn = mockConnection()

    await ComboInventory.tru(conn, 1, [{ quantity: 2 }, { combo_id: 6, quantity: 0 }])

    expect(conn.execute).not.toHaveBeenCalled()
  })
})

describe('ComboInventory.hoanLai — hoàn kho khi huỷ vé', () => {
  test('cộng lại đúng số suất đã trừ, vào đúng rạp', async () => {
    const conn = mockConnection()

    await ComboInventory.hoanLai(conn, 3, [{ combo_id: 6, quantity: 2 }, { combo_id: 5, quantity: 1 }])

    expect(conn.calls).toHaveLength(2)
    expect(conn.calls[0].sql).toContain('ton_kho = ton_kho + ?')
    expect(conn.calls[0].params).toEqual([2, 3, 6])
    expect(conn.calls[1].params).toEqual([1, 3, 5])
  })
})
