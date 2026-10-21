"use client"

import Link from "next/link"
import { Header } from "@/components/header"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Phone, MessageCircle, Building2 } from "lucide-react"
import { usePublicContact } from "@/hooks/use-public-contact"
import { telHref } from "@/lib/api/settings"

interface Channel {
  icon: typeof Mail
  title: string
  value: string
  href: string | null
  desc: string
}

export default function ContactPage() {
  // Email/tổng đài lấy từ trang Cài đặt của admin — trước đây ghi cứng
  // "1900 xxxx". Số tổng đài chưa được nhập thật thì ẩn hẳn thẻ đó, không
  // hiện số giả. Thẻ "Văn phòng" (địa chỉ giả ở TP.HCM, trong khi cả 3 rạp đều
  // ở Đà Nẵng) đã bỏ — địa chỉ thật của từng rạp nằm ở trang Rạp chiếu.
  const contact = usePublicContact()
  const channels: Channel[] = [
    ...(contact?.contact_email
      ? [{ icon: Mail, title: "Email", value: contact.contact_email, href: `mailto:${contact.contact_email}`, desc: "Phản hồi trong vòng 24 giờ làm việc" }]
      : []),
    ...(contact?.support_phone
      ? [{ icon: Phone, title: "Tổng đài", value: contact.support_phone, href: telHref(contact.support_phone), desc: "Hỗ trợ 8:00 - 22:00 hàng ngày" }]
      : []),
    { icon: MessageCircle, title: "Chat trực tuyến", value: "Trợ lý Cine", href: null, desc: "Mở khung chat ở góc màn hình để được hỗ trợ ngay" },
  ]
  const cols = channels.length === 3 ? "sm:grid-cols-3" : channels.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Liên hệ</h1>
          <p className="text-muted-foreground mt-1">
            Chọn kênh phù hợp với bạn — đội ngũ CinemaGold luôn sẵn sàng hỗ trợ.
          </p>
        </div>

        <div className={`grid grid-cols-1 ${cols} gap-4 mb-6`}>
          {channels.map((c) => {
            const Icon = c.icon
            const content = (
              <CardContent className="p-5 text-center flex flex-col items-center">
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="font-semibold text-sm">{c.title}</p>
                <p className="text-primary font-medium mt-0.5 break-all">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
              </CardContent>
            )
            return (
              <Card key={c.title} className="hover:border-primary/50 hover:shadow-md transition-all">
                {c.href ? <a href={c.href}>{content}</a> : content}
              </Card>
            )
          })}
        </div>

        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <Building2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Tìm rạp gần bạn</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Xem địa chỉ và thông tin từng rạp trong hệ thống tại{" "}
                <Link href="/cinemas" className="text-primary hover:underline">
                  trang Rạp chiếu
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
