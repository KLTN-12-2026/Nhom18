import { Header } from "@/components/header"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-1">Chính sách bảo mật</h1>
        <p className="text-muted-foreground mb-8">Cập nhật lần cuối: 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&>section>h2]:text-foreground [&>section>h2]:font-semibold [&>section>h2]:text-base [&>section>h2]:mb-2">
          <section>
            <h2>1. Thông tin chúng tôi thu thập</h2>
            <p>
              Khi bạn đăng ký tài khoản, chúng tôi thu thập: họ tên, email, số điện thoại (tuỳ
              chọn). Nếu bạn đăng nhập qua Google, chúng tôi nhận thông tin cơ bản (tên, email,
              ảnh đại diện) từ Google theo sự cho phép của bạn. Khi đặt vé, chúng tôi lưu lại
              lịch sử đặt vé (phim, rạp, suất chiếu, ghế, trạng thái thanh toán) để phục vụ tra
              cứu và hỗ trợ.
            </p>
          </section>

          <section>
            <h2>2. Thông tin thanh toán</h2>
            <p>
              CinemaGold <strong>không lưu trữ số thẻ ngân hàng hay thông tin thanh toán nhạy
              cảm</strong> của bạn. Giao dịch được xử lý trực tiếp bởi cổng thanh toán VNPay
              hoặc MoMo — chúng tôi chỉ nhận kết quả giao dịch (thành công/thất bại, mã giao
              dịch) để xác nhận vé.
            </p>
          </section>

          <section>
            <h2>3. Mục đích sử dụng thông tin</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Xử lý đơn đặt vé và gửi vé điện tử qua email</li>
              <li>Hỗ trợ khách hàng khi có yêu cầu hoặc sự cố</li>
              <li>Gợi ý phim phù hợp dựa trên lịch sử xem của bạn</li>
              <li>Cải thiện chất lượng dịch vụ và trải nghiệm sử dụng web</li>
            </ul>
          </section>

          <section>
            <h2>4. Chia sẻ thông tin với bên thứ ba</h2>
            <p>
              Chúng tôi chỉ chia sẻ thông tin cần thiết với: cổng thanh toán (VNPay, MoMo) để xử
              lý giao dịch, và Google (nếu bạn chọn đăng nhập bằng Google). Chúng tôi{" "}
              <strong>không bán hoặc cho thuê</strong> dữ liệu cá nhân của bạn cho bên thứ ba vì
              mục đích quảng cáo.
            </p>
          </section>

          <section>
            <h2>5. Bảo mật tài khoản</h2>
            <p>
              Mật khẩu của bạn được mã hoá (hash) trước khi lưu trữ — kể cả đội ngũ CinemaGold
              cũng không thể xem được mật khẩu gốc của bạn.
            </p>
          </section>

          <section>
            <h2>6. Quyền của bạn</h2>
            <p>
              Bạn có thể xem và cập nhật thông tin cá nhân trong trang Hồ sơ. Để yêu cầu xoá tài
              khoản hoặc dữ liệu cá nhân, vui lòng liên hệ đội ngũ hỗ trợ qua trang Liên hệ.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
