"use client"

import Link from "next/link"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube, Armchair } from "lucide-react"
import { usePublicContact } from "@/hooks/use-public-contact"
import { telHref } from "@/lib/api/settings"

export function Footer() {
  const currentYear = new Date().getFullYear()
  // Email/tổng đài lấy từ trang Cài đặt của admin — trước đây ghi cứng
  // "1900 xxxx" và địa chỉ giả "Tòa nhà ABC, 123 Nguyễn Huệ, TP.HCM" trong khi
  // cả 3 rạp đều ở Đà Nẵng. Số tổng đài chưa được nhập thật thì không hiện.
  const contact = usePublicContact()

  return (
    <footer className="border-t border-border/80 bg-card/70 backdrop-blur mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="relative bg-[#0d1521] rounded-xl p-1.5 ring-1 ring-white/10 shadow-lg shadow-black/30">
                <Image src="/logo-icon.png" alt="CinemaGold" width={40} height={40} className="h-10 w-10 object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold bg-gradient-to-r from-primary via-primary to-primary/80 bg-clip-text text-transparent leading-tight">
                  CinemaGold
                </span>
                <span className="text-[10px] text-primary/90 font-semibold leading-tight tracking-widest uppercase">
                  🎬 Đặt vé xem phim
                </span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hệ thống đặt vé xem phim hàng đầu Việt Nam. Trải nghiệm điện ảnh đẳng cấp với công nghệ hiện đại và dịch vụ tận tâm.
            </p>
            <div className="flex gap-3 pt-2">
              <Button size="icon" variant="ghost" className="h-9 w-9" asChild>
                <Link href="https://facebook.com" target="_blank" rel="noopener noreferrer">
                  <Facebook className="h-4 w-4" />
                  <span className="sr-only">Facebook</span>
                </Link>
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" asChild>
                <Link href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                  <Twitter className="h-4 w-4" />
                  <span className="sr-only">Twitter</span>
                </Link>
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" asChild>
                <Link href="https://instagram.com" target="_blank" rel="noopener noreferrer">
                  <Instagram className="h-4 w-4" />
                  <span className="sr-only">Instagram</span>
                </Link>
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" asChild>
                <Link href="https://youtube.com" target="_blank" rel="noopener noreferrer">
                  <Youtube className="h-4 w-4" />
                  <span className="sr-only">Youtube</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Liên kết nhanh</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/movies" className="text-muted-foreground hover:text-primary transition-colors">
                  Phim đang chiếu
                </Link>
              </li>
              <li>
                <Link href="/showtimes" className="text-muted-foreground hover:text-primary transition-colors">
                  Lịch chiếu
                </Link>
              </li>
              <li>
                <Link href="/cinemas" className="text-muted-foreground hover:text-primary transition-colors">
                  Hệ thống rạp
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="text-muted-foreground hover:text-primary transition-colors">
                  Lịch sử đặt vé
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Hỗ trợ</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/help" className="text-muted-foreground hover:text-primary transition-colors">
                  Trung tâm trợ giúp
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors">
                  Liên hệ
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-muted-foreground hover:text-primary transition-colors">
                  Câu hỏi thường gặp
                </Link>
              </li>
              <li>
                <Link href="/booking-guide" className="text-muted-foreground hover:text-primary transition-colors">
                  Hướng dẫn đặt vé
                </Link>
              </li>
              <li>
                <Link href="/payment-guide" className="text-muted-foreground hover:text-primary transition-colors">
                  Hướng dẫn thanh toán
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Liên hệ</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {contact?.contact_email && (
                <li className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <a href={`mailto:${contact.contact_email}`} className="hover:text-primary transition-colors break-all">
                    {contact.contact_email}
                  </a>
                </li>
              )}
              {contact?.support_phone && (
                <li className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <a href={telHref(contact.support_phone)} className="hover:text-primary transition-colors">
                    {contact.support_phone} (8:00 - 22:00)
                  </a>
                </li>
              )}
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <Link href="/cinemas" className="hover:text-primary transition-colors">
                  Xem địa chỉ các rạp CinemaGold
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p className="text-center md:text-left">
            © {currentYear} CinemaGold. All rights reserved. Made with ❤️ in Vietnam
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/privacy" className="hover:text-primary transition-colors">
              Chính sách bảo mật
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              Điều khoản sử dụng
            </Link>
            <Link href="/cookies" className="hover:text-primary transition-colors">
              Chính sách Cookie
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
