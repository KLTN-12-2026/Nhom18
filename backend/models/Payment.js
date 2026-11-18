const { pool } = require("../config/database")
const crypto = require("crypto")
// KHÔNG import "querystring" ở đây nữa. API của nó là
// stringify(obj, sep, eq, options) — tham số thứ hai là DẤU PHÂN CÁCH, không
// phải tuỳ chọn, nên `stringify(obj, { encode: false })` (cú pháp của thư viện
// `qs`) lặng lẽ nối các cặp bằng chuỗi "[object Object]" và làm hỏng toàn bộ
// chữ ký VNPay. Dùng Payment.noiThamSo() thay thế.

class Payment {
  /**
   * Create payment transaction record
   */
  static async createTransaction(transactionData) {
    const {
      ticket_id,
      user_id,
      payment_method,
      amount,
      gateway_order_id,
      payment_url,
      qr_code_url,
      request_data
    } = transactionData

    const [result] = await pool.execute(
      `INSERT INTO payment_transactions 
       (ticket_id, user_id, payment_method, amount, gateway_order_id, payment_url, qr_code_url, request_data, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [ticket_id, user_id, payment_method, amount, gateway_order_id, payment_url, qr_code_url, JSON.stringify(request_data)]
    )

    return result.insertId
  }

  /**
   * Update transaction status
   */
  static async updateTransaction(transactionId, updateData) {
    const {
      status,
      gateway_transaction_id,
      response_data,
      callback_data,
      error_message,
      completed_at
    } = updateData

    const fields = []
    const values = []

    if (status) {
      fields.push('status = ?')
      values.push(status)
    }
    if (gateway_transaction_id) {
      fields.push('gateway_transaction_id = ?')
      values.push(gateway_transaction_id)
    }
    if (response_data) {
      fields.push('response_data = ?')
      values.push(JSON.stringify(response_data))
    }
    if (callback_data) {
      fields.push('callback_data = ?')
      values.push(JSON.stringify(callback_data))
    }
    if (error_message) {
      fields.push('error_message = ?')
      values.push(error_message)
    }
    if (completed_at) {
      fields.push('completed_at = ?')
      values.push(completed_at)
    }

    fields.push('updated_at = NOW()')
    values.push(transactionId)

    const [result] = await pool.execute(
      `UPDATE payment_transactions SET ${fields.join(', ')} WHERE id = ?`,
      values
    )

    return result.affectedRows > 0
  }

  /**
   * Get transaction by ID
   */
  static async getTransactionById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM payment_transactions WHERE id = ?',
      [id]
    )
    return rows[0]
  }

  /**
   * Get transaction by gateway order ID
   */
  static async getTransactionByOrderId(orderId) {
    const [rows] = await pool.execute(
      'SELECT * FROM payment_transactions WHERE gateway_order_id = ?',
      [orderId]
    )
    return rows[0]
  }

  /**
   * Update transaction status (simplified for mock payment)
   */
  static async updateTransactionStatus(orderId, updates) {
    const { status, gateway_transaction_id, response_code, response_message } = updates
    const [result] = await pool.execute(
      `UPDATE payment_transactions 
       SET status = ?, 
           gateway_transaction_id = ?, 
           response_code = ?, 
           response_message = ?,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE gateway_order_id = ?`,
      [status, gateway_transaction_id, response_code, response_message, orderId]
    )
    return result.affectedRows > 0
  }

  /**
   * Get transactions by ticket ID
   */
  static async getTransactionsByTicketId(ticketId) {
    const [rows] = await pool.execute(
      'SELECT * FROM payment_transactions WHERE ticket_id = ? ORDER BY created_at DESC',
      [ticketId]
    )
    return rows
  }

  static async getPaymentHistoryByUser(userId, limit = 50) {
    // Tên phim lấy qua suất chiếu — bảng tickets KHÔNG có cột movie_title
    // (trước đây đọc t.movie_title nên API này luôn lỗi 500).
    // Dùng query thay vì execute: LIMIT ? dạng prepared statement dễ lỗi
    // "Incorrect arguments to mysqld_stmt_execute" trên MySQL 8.
    const [rows] = await pool.query(
      `SELECT pt.*, t.booking_reference, t.total_amount, m.title AS movie_title
       FROM payment_transactions pt
       JOIN tickets t ON pt.ticket_id = t.id
       LEFT JOIN showtimes s ON s.id = t.showtime_id
       LEFT JOIN movies m ON m.id = s.movie_id
       WHERE pt.user_id = ?
       ORDER BY pt.created_at DESC
       LIMIT ?`,
      [userId, Number(limit) || 50]
    )
    return rows
  }

  /**
   * Get payment settings for a gateway
   */
  static async getGatewaySettings(gatewayName) {
    const [rows] = await pool.execute(
      'SELECT * FROM payment_settings WHERE gateway_name = ? AND is_enabled = 1',
      [gatewayName]
    )
    return rows[0]
  }

  /**
   * Generate VNPay payment URL
   */
  static generateVNPayURL(orderData, settings) {
    const {
      orderId,
      amount,
      orderInfo,
      returnUrl,
      ipAddr
    } = orderData

    // VNPay sandbox config (get from env or settings)
    const vnp_TmnCode = process.env.VNPAY_TMN_CODE || settings.merchant_id
    const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || settings.secret_key
    const vnp_Url = settings.is_sandbox 
      ? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
      : 'https://vnpayment.vn/paymentv2/vpcpay.html'

    // VNPay yêu cầu định dạng yyyyMMddHHmmss theo giờ GMT+7.
    const dauThoiGian = (d) =>
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0')

    const date = new Date()
    const createDate = dauThoiGian(date)
    // Hạn thanh toán 15 phút — khớp đúng thời gian giữ ghế (SeatLock.HOLD_MINUTES).
    // Không có tham số này thì VNPay để đơn treo rất lâu, trong khi ghế đã được
    // nhả từ lâu: khách trả tiền xong mới biết ghế đã bị người khác đặt mất.
    const expireDate = dauThoiGian(new Date(date.getTime() + 15 * 60 * 1000))

    let vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnp_TmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      // VNPay nhận số tiền theo ĐƠN VỊ XU (VND x 100) và BẮT BUỘC là số nguyên.
      // total_amount trong DB là DECIMAL nên driver trả về CHUỖI ("233000.00");
      // ép về số trước khi nhân để không ra số lẻ thập phân.
      vnp_Amount: Math.round(Number(amount) * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate
    }

    // Sắp xếp + mã hoá theo đúng chuẩn VNPay
    vnp_Params = this.sortObject(vnp_Params)

    const signData = this.noiThamSo(vnp_Params)
    const hmac = crypto.createHmac('sha512', vnp_HashSecret)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

    // Chữ ký KHÔNG nằm trong chuỗi ký, chỉ nối thêm vào URL cuối.
    return vnp_Url + '?' + signData + '&vnp_SecureHash=' + signed
  }

  /**
   * Nối các tham số ĐÃ MÃ HOÁ thành chuỗi "k=v&k=v" — dùng cho cả chuỗi ký lẫn
   * URL cuối của VNPay.
   *
   * LỖI CŨ: chỗ này gọi `querystring.stringify(obj, { encode: false })` — cú
   * pháp của thư viện `qs`, nhưng file lại import `querystring` CÓ SẴN của
   * Node, nơi tham số thứ HAI là DẤU PHÂN CÁCH chứ không phải tuỳ chọn. Kết
   * quả: các cặp bị nối bằng chuỗi "[object Object]" thay vì "&", và giá trị
   * còn bị mã hoá thêm lần nữa ("%3A" -> "%253A").
   *
   *   vnp_Amount=23300000[object Object]vnp_Command=pay[object Object]...
   *
   * Nghĩa là mọi liên kết VNPay đều hỏng và chữ ký luôn sai, bất kể khoá bí
   * mật có đúng hay không. Nối tay vừa đúng vừa không phụ thuộc thư viện ngoài
   * (sortObject đã mã hoá sẵn nên tuyệt đối không được mã hoá lại lần nữa).
   */
  static noiThamSo(thamSoDaMaHoa) {
    return Object.entries(thamSoDaMaHoa)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  }

  /**
   * Kiểm tra thông tin cổng thanh toán đã điền thật chưa.
   * Trả về CHUỖI mô tả thiếu gì, hoặc null nếu đủ.
   *
   * Cần thiết vì các giá trị giữ chỗ ("YOUR_TMN_CODE_HERE", "VNPAY_MERCHANT_ID")
   * trông như đã cấu hình với mọi phép kiểm tra "có tồn tại không", nên hệ
   * thống vẫn ký và chuyển hướng khách sang cổng thanh toán, rồi khách nhận về
   * một mã lỗi khó hiểu của VNPay/MoMo.
   */
  static kiemTraCauHinhCong(tenCong, settings = {}) {
    const laGiuCho = (v) =>
      !v ||
      !String(v).trim() ||
      /^(YOUR_|VNPAY_MERCHANT_ID$|VNPAY_TMN_CODE$|MOMO_PARTNER_CODE$|CHANGE_?ME|XXX+$|<.*>$)/i.test(String(v).trim())

    if (tenCong === 'vnpay') {
      const tmn = process.env.VNPAY_TMN_CODE || settings.merchant_id
      const bimat = process.env.VNPAY_HASH_SECRET || settings.secret_key
      if (laGiuCho(tmn)) return 'thiếu VNPAY_TMN_CODE (mã website do VNPay cấp)'
      if (laGiuCho(bimat)) return 'thiếu VNPAY_HASH_SECRET (chuỗi bí mật do VNPay cấp)'
      return null
    }

    if (tenCong === 'momo') {
      const partner = process.env.MOMO_PARTNER_CODE || settings.merchant_id
      const access = process.env.MOMO_ACCESS_KEY || settings.api_key
      const bimat = process.env.MOMO_SECRET_KEY || settings.secret_key
      if (laGiuCho(partner)) return 'thiếu MOMO_PARTNER_CODE'
      if (laGiuCho(access)) return 'thiếu MOMO_ACCESS_KEY'
      if (laGiuCho(bimat)) return 'thiếu MOMO_SECRET_KEY'
      return null
    }

    return null
  }

  /**
   * Verify VNPay callback signature
   */
  static verifyVNPayCallback(vnpParams, settings) {
    const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || settings.secret_key
    const secureHash = vnpParams['vnp_SecureHash']
    
    delete vnpParams['vnp_SecureHash']
    delete vnpParams['vnp_SecureHashType']
    
    const sortedParams = this.sortObject(vnpParams)
    const signData = this.noiThamSo(sortedParams)
    const hmac = crypto.createHmac('sha512', vnp_HashSecret)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

    // So sánh không phân biệt hoa/thường: VNPay trả chữ ký chữ thường, nhưng
    // một số tài liệu/mẫu của họ dùng chữ hoa — tránh trượt chỉ vì khác kiểu chữ.
    return String(secureHash).toLowerCase() === signed.toLowerCase()
  }

  /**
   * Generate MoMo payment request
   */
  static async generateMoMoPayment(orderData, settings) {
    const {
      orderId,
      amount,
      orderInfo,
      returnUrl,
      notifyUrl
    } = orderData

    const partnerCode = process.env.MOMO_PARTNER_CODE || settings.merchant_id
    const accessKey = process.env.MOMO_ACCESS_KEY || settings.api_key
    const secretKey = process.env.MOMO_SECRET_KEY || settings.secret_key
    const requestId = orderId
    const requestType = 'captureWallet' // hoặc 'payWithATM' cho QR
    const extraData = ''

    // Create signature
    const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${notifyUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${returnUrl}&requestId=${requestId}&requestType=${requestType}`
    
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex')

    const requestBody = {
      partnerCode,
      accessKey,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: returnUrl,
      ipnUrl: notifyUrl,
      requestType,
      extraData,
      signature,
      lang: 'vi'
    }

    const endpoint = settings.is_sandbox
      ? 'https://test-payment.momo.vn/v2/gateway/api/create'
      : 'https://payment.momo.vn/v2/gateway/api/create'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const result = await response.json()
      return result
    } catch (error) {
      throw new Error('MoMo payment request failed: ' + error.message)
    }
  }

  /**
   * Verify MoMo callback signature
   */
  static verifyMoMoCallback(callbackData, settings) {
    const secretKey = process.env.MOMO_SECRET_KEY || settings.secret_key
    
    const rawSignature = `accessKey=${callbackData.accessKey}&amount=${callbackData.amount}&extraData=${callbackData.extraData}&message=${callbackData.message}&orderId=${callbackData.orderId}&orderInfo=${callbackData.orderInfo}&orderType=${callbackData.orderType}&partnerCode=${callbackData.partnerCode}&payType=${callbackData.payType}&requestId=${callbackData.requestId}&responseTime=${callbackData.responseTime}&resultCode=${callbackData.resultCode}&transId=${callbackData.transId}`
    
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex')
    
    return signature === callbackData.signature
  }

  /**
   * Helper: Sort object by key alphabetically
   */
  /**
   * Sắp xếp + MÃ HOÁ tham số theo đúng thuật toán ký của VNPay (v2.1.0).
   *
   * LỖI CŨ: hàm này chỉ SẮP XẾP mà không mã hoá giá trị, trong khi cả chuỗi ký
   * lẫn URL cuối đều dùng querystring.stringify(..., { encode: false }). Hậu
   * quả: vnp_OrderInfo ("Thanh toan ve phim ...") và vnp_ReturnUrl
   * ("https://...") đi vào URL với dấu cách và "://" thô — URL hỏng, và chuỗi
   * ký khác hoàn toàn chuỗi mà VNPay tự tính, nên MỌI giao dịch VNPay đều bị
   * trả về "sai chữ ký" (mã 70/97) dù khoá bí mật đúng.
   *
   * Thuật toán đúng (theo mã mẫu Node.js chính thức của VNPay): mã hoá KHOÁ,
   * sắp xếp theo khoá đã mã hoá, rồi mã hoá GIÁ TRỊ và đổi "%20" thành "+".
   * Sau bước này thì stringify với encode:false là chính xác, vì mọi thứ đã
   * được mã hoá sẵn — mã hoá lần nữa sẽ thành mã hoá kép ("%20" -> "%2520").
   *
   * Hàm này CHỈ VNPay dùng (2 chỗ: ký lúc tạo URL và xác minh lúc nhận kết
   * quả). MoMo ký bằng chuỗi nối tay riêng, không đụng tới đây.
   */
  static sortObject(obj) {
    const sorted = {}
    const keys = []

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        keys.push(encodeURIComponent(key))
      }
    }
    keys.sort()

    for (const key of keys) {
      sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+')
    }

    return sorted
  }

  /**
   * Generate QR code URL (using external service or generate locally)
   */
  static generateQRCodeURL(paymentUrl) {
    // Option 1: Use QR code API service
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`
    
    // Option 2: For production, use qrcode library to generate locally
    // const QRCode = require('qrcode')
    // return await QRCode.toDataURL(paymentUrl)
  }
}

module.exports = Payment
