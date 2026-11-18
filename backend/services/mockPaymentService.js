/**
 * Mock Payment Service for Testing
 * Simulates payment without requiring actual payment gateway
 */

const crypto = require('crypto')

class MockPaymentService {
  /**
   * Create a mock payment URL
   * In test mode, this creates a fake payment URL that auto-succeeds
   */
  createMockPaymentUrl({ ticketId, amount, orderInfo }) {
    const transactionNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`
    
    // Create a mock payment URL that will auto-redirect back with success
    const mockUrl = `${process.env.FRONTEND_URL}/booking/mock-payment?` +
      `ticketId=${ticketId}&` +
      `amount=${amount}&` +
      `transactionNo=${transactionNo}&` +
      `orderInfo=${encodeURIComponent(orderInfo)}`
    
    return {
      paymentUrl: mockUrl,
      transactionNo,
      qrCode: this.generateMockQR(ticketId, amount)
    }
  }

  /**
   * Generate mock QR code data
   */
  generateMockQR(ticketId, amount) {
    return `MOCK_PAYMENT|TICKET:${ticketId}|AMOUNT:${amount}|TIME:${Date.now()}`
  }

  /**
   * Simulate payment callback
   * This would normally come from VNPay/MoMo
   */
  createMockCallback(ticketId, transactionNo, success = true) {
    const responseCode = success ? '00' : '24'
    const message = success ? 'Thanh toán thành công' : 'Thanh toán thất bại'
    
    return {
      vnp_ResponseCode: responseCode,
      vnp_TransactionNo: transactionNo,
      vnp_TxnRef: ticketId,
      vnp_Amount: 0, // Will be filled by actual amount
      vnp_BankCode: 'MOCKBANK',
      vnp_TransactionStatus: responseCode,
      vnp_Message: message,
      vnp_PayDate: this.formatDate(new Date())
    }
  }

  /**
   * Format date for VNPay format (yyyyMMddHHmmss)
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`
  }

  /**
   * Verify mock payment (always returns true in test mode)
   */
  verifyMockPayment(queryParams) {
    // In mock mode, we just check if transaction no is present
    return {
      isValid: !!queryParams.transactionNo,
      message: 'Mock payment verification'
    }
  }
}

module.exports = new MockPaymentService()
