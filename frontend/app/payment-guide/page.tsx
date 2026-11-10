import Link from "next/link"
import { Header } from "@/components/header"
import { Card, CardContent } from "@/components/ui/card"
import { Wallet, ShieldCheck, AlertCircle } from "lucide-react"

const METHODS = [
  {
    icon: Wallet,
    title: "VNPay",
    desc: "Thanh toán qua thẻ ATM nội địa, thẻ quốc tế (Visa/Mastercard) hoặc ví VNPay. Vé được xác nhận ngay sau khi giao dịch thành công.",
  },
  {
    icon: Wallet,
    title: "MoMo",
    desc: "Quét mã QR bằng ứng dụng MoMo để thanh toán nhanh chóng, không cần nhập thông tin thẻ.",
  },
]

export default function PaymentGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Hướng dẫn thanh toán</h1>
          <p className="text-muted-foreground mt-1">
            Các phương thức thanh toán được hỗ trợ trên CinemaGold.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {METHODS.map((m) => {
            const Icon = m.icon
            return (
              <Card key={m.title}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{m.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{m.desc}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="mb-4">
          <CardContent className="p-5 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">An toàn thanh toán</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                CinemaGold không lưu trữ thông tin thẻ ngân hàng của bạn. Toàn bộ giao dịch VNPay
                và MoMo được xử lý và bảo mật trực tiếp bởi cổng thanh toán tương ứng.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Thanh toán gặp lỗi?</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Nếu bị trừ tiền nhưng không nhận được vé, hãy giữ lại thông tin giao dịch và{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  liên hệ hỗ trợ
                </Link>{" "}
                để được xử lý nhanh nhất. Ghế đã chọn chỉ được giữ trong 15 phút — nếu quá thời
                gian mà chưa thanh toán xong, vui lòng chọn lại ghế và đặt vé lại.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
