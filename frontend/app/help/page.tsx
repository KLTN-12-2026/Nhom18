import Link from "next/link"
import { Header } from "@/components/header"
import { Card, CardContent } from "@/components/ui/card"
import {
  HelpCircle,
  Ticket,
  CreditCard,
  Mail,
  MessageCircle,
  ArrowRight,
} from "lucide-react"

const HELP_LINKS = [
  {
    href: "/faq",
    icon: HelpCircle,
    title: "Câu hỏi thường gặp",
    desc: "Giải đáp nhanh các thắc mắc phổ biến về đặt vé, thanh toán, ghế ngồi...",
  },
  {
    href: "/booking-guide",
    icon: Ticket,
    title: "Hướng dẫn đặt vé",
    desc: "Các bước đặt vé xem phim từ A đến Z, dành cho người mới bắt đầu.",
  },
  {
    href: "/payment-guide",
    icon: CreditCard,
    title: "Hướng dẫn thanh toán",
    desc: "Các phương thức thanh toán được hỗ trợ và cách xử lý khi gặp lỗi.",
  },
  {
    href: "/contact",
    icon: Mail,
    title: "Liên hệ hỗ trợ",
    desc: "Cần hỗ trợ trực tiếp? Đây là các kênh liên hệ với đội ngũ CinemaGold.",
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground">Trung tâm trợ giúp</h1>
          <p className="text-muted-foreground mt-1">
            Bạn cần hỗ trợ gì hôm nay?
          </p>
        </div>

        <div className="rounded-2xl border bg-gradient-to-r from-primary/10 to-primary/5 p-5 mb-6 flex items-center gap-4">
          <div className="h-11 w-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Cần trả lời ngay? Hỏi trợ lý Cine</p>
            <p className="text-sm text-muted-foreground">
              Mở khung chat ở góc màn hình để được hỗ trợ tức thì: lịch chiếu, giá vé, gợi ý phim...
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {HELP_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}>
                <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-semibold flex items-center gap-1">
                      {item.title}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
