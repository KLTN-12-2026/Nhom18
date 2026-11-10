import Link from "next/link"
import { Header } from "@/components/header"
import { Card, CardContent } from "@/components/ui/card"
import { LogIn, Film, MapPin, Armchair, ShoppingBag, CreditCard, Ticket } from "lucide-react"

const STEPS = [
  {
    icon: LogIn,
    title: "1. Đăng nhập tài khoản",
    desc: "Đăng nhập (hoặc đăng ký nếu chưa có tài khoản) để đặt vé và nhận vé điện tử qua email.",
  },
  {
    icon: Film,
    title: "2. Chọn phim",
    desc: "Duyệt danh sách phim đang chiếu, xem thông tin, đánh giá và trailer trước khi quyết định.",
  },
  {
    icon: MapPin,
    title: "3. Chọn rạp và suất chiếu",
    desc: "Chọn rạp gần bạn và khung giờ phù hợp. Mỗi rạp có thể có nhiều loại phòng chiếu khác nhau.",
  },
  {
    icon: Armchair,
    title: "4. Chọn ghế ngồi",
    desc: "Chọn ghế trên sơ đồ phòng chiếu. Ghế bạn chọn sẽ được giữ trong 15 phút để hoàn tất thanh toán.",
  },
  {
    icon: ShoppingBag,
    title: "5. Thêm combo (tuỳ chọn)",
    desc: "Có thể thêm bắp nước ngay trong lúc đặt vé để nhận cùng lúc, không cần xếp hàng riêng tại rạp.",
  },
  {
    icon: CreditCard,
    title: "6. Thanh toán",
    desc: "Thanh toán qua VNPay hoặc MoMo. Xem chi tiết tại Hướng dẫn thanh toán.",
  },
  {
    icon: Ticket,
    title: "7. Nhận vé điện tử",
    desc: "Vé điện tử được gửi ngay vào email và lưu trong mục Lịch sử đặt vé của tài khoản — mã QR check-in xem trực tiếp trong mục này.",
  },
]

export default function BookingGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Hướng dẫn đặt vé</h1>
          <p className="text-muted-foreground mt-1">
            7 bước đơn giản để đặt vé xem phim trên CinemaGold.
          </p>
        </div>

        <div className="space-y-4">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <Card key={step.title}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Lưu ý</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Mỗi lượt đặt vé tối đa 10 ghế.</li>
            <li>Bạn có thể tự huỷ vé trong mục "Vé của tôi" (vé đã thanh toán sẽ được đánh dấu hoàn tiền, đội ngũ CinemaGold xử lý chuyển tiền về phương thức thanh toán ban đầu) — nhưng hệ thống hiện chưa hỗ trợ đổi vé sang suất chiếu khác trực tiếp trên web.</li>
          </ul>
          <p className="mt-3">
            Còn thắc mắc? Xem thêm{" "}
            <Link href="/faq" className="text-primary hover:underline">
              Câu hỏi thường gặp
            </Link>{" "}
            hoặc{" "}
            <Link href="/contact" className="text-primary hover:underline">
              liên hệ hỗ trợ
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
