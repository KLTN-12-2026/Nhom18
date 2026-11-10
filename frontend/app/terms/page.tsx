import { Header } from "@/components/header"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-1">Điều khoản sử dụng</h1>
        <p className="text-muted-foreground mb-8">Cập nhật lần cuối: 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&>section>h2]:text-foreground [&>section>h2]:font-semibold [&>section>h2]:text-base [&>section>h2]:mb-2">
          <section>
            <h2>1. Tài khoản</h2>
            <p>
              Bạn cần tạo tài khoản để đặt vé. Mỗi tài khoản chỉ dùng cho một cá nhân, không
              chia sẻ thông tin đăng nhập cho người khác. Tài khoản có hành vi gian lận hoặc vi
              phạm điều khoản có thể bị tạm khoá.
            </p>
          </section>

          <section>
            <h2>2. Đặt vé và giữ ghế</h2>
            <p>
              Mỗi lượt đặt vé tối đa 10 ghế. Ghế được chọn sẽ giữ tạm trong 15 phút để hoàn tất
              thanh toán; quá thời gian này ghế sẽ tự động được mở lại cho người khác.
            </p>
          </section>

          <section>
            <h2>3. Thanh toán và xác nhận vé</h2>
            <p>
              Vé chỉ được xác nhận sau khi thanh toán thành công qua VNPay hoặc MoMo. Vé điện tử
              được gửi qua email đã đăng ký; mã QR check-in có thể xem trong mục "Vé của tôi" trên web.
            </p>
          </section>

          <section>
            <h2>4. Huỷ và hoàn tiền</h2>
            <p>
              Bạn có thể tự huỷ vé trong mục "Vé của tôi". Nếu vé đã thanh toán, hệ thống sẽ đánh
              dấu vé ở trạng thái hoàn tiền và đội ngũ CinemaGold sẽ xử lý chuyển tiền về phương
              thức thanh toán ban đầu. Hiện hệ thống <strong>chưa hỗ trợ đổi vé sang suất chiếu khác</strong> trực
              tiếp trên web. Với các trường hợp đặc biệt (lỗi hệ thống, trùng vé...), vui lòng
              liên hệ đội ngũ hỗ trợ để được xem xét.
            </p>
          </section>

          <section>
            <h2>5. Phân loại độ tuổi</h2>
            <p>
              Mỗi phim được gắn nhãn độ tuổi (PG, PG-13, R). Người xem có trách nhiệm tuân thủ
              khuyến nghị độ tuổi khi đưa trẻ em đến rạp.
            </p>
          </section>

          <section>
            <h2>6. Hành vi không được phép</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Sử dụng công cụ tự động (bot) để đặt vé hàng loạt hoặc thu thập dữ liệu</li>
              <li>Bán lại vé với mục đích thương mại trái phép</li>
              <li>Cố ý khai thác lỗi hệ thống để hưởng lợi bất chính</li>
            </ul>
          </section>

          <section>
            <h2>7. Thay đổi điều khoản</h2>
            <p>
              CinemaGold có thể cập nhật điều khoản sử dụng theo thời gian. Phiên bản mới nhất
              luôn được đăng tại trang này.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
