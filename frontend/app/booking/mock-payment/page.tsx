'use client'

export const dynamic = "force-dynamic"

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2 } from 'lucide-react'

export default function MockPaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState(3)
  
  const ticketId = searchParams.get('ticketId')
  const amount = Number(searchParams.get('amount') || 0)
  const transactionNo = searchParams.get('transactionNo')
  const orderInfo = searchParams.get('orderInfo')

  useEffect(() => {
    // Countdown before auto redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Redirect to success page
          router.push(`/booking/payment-success?ticketId=${ticketId}&transactionNo=${transactionNo}&status=success`)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [ticketId, transactionNo, router])

  const handleManualContinue = () => {
    router.push(`/booking/payment-success?ticketId=${ticketId}&transactionNo=${transactionNo}&status=success`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">
            🧪 Thanh toán Test Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 font-medium">
              ⚠️ Đây là chế độ TEST - Không cần thanh toán thật
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Hệ thống sẽ tự động xác nhận thanh toán thành công
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Mã giao dịch:</span>
              <span className="font-mono font-medium">{transactionNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Mã vé:</span>
              <span className="font-medium">{ticketId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Số tiền:</span>
              <span className="font-bold text-green-600">
                {new Intl.NumberFormat('vi-VN', { 
                  style: 'currency', 
                  currency: 'VND' 
                }).format(amount || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Nội dung:</span>
              <span className="font-medium text-right">{orderInfo}</span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-blue-600 mt-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Đang xử lý thanh toán... ({countdown}s)</span>
          </div>

          <Button 
            onClick={handleManualContinue}
            className="w-full"
            size="lg"
          >
            Tiếp tục ngay
          </Button>

          <p className="text-xs text-center text-gray-500">
            Để tắt chế độ test, thay đổi ENABLE_MOCK_PAYMENT=false trong file .env
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
