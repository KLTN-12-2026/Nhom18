import Link from "next/link"
import { Header } from "@/components/header"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const FAQ_ITEMS = [
  {
    q: "Đặt vé như thế nào?",
    a: (
      <>
        <ol className="list-decimal list-inside space-y-1">
          <li>Đăng nhập tài khoản</li>
          <li>Chọn phim muốn xem</li>
          <li>Chọn rạp và suất chiếu</li>
          <li>Chọn ghế ngồi</li>
          <li>(Tuỳ chọn) thêm combo bắp nước</li>
          <li>Thanh toán và nhận vé điện tử</li>
        </ol>
        <p className="mt-2">
          Xem chi tiết từng bước tại{" "}
          <Link href="/booking-guide" className="text-primary hover:underline">
            Hướng dẫn đặt vé
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    q: "Phương thức thanh toán nào được hỗ trợ?",
    a: (
      <p>
        CinemaGold hỗ trợ thanh toán qua <strong>VNPay và MoMo</strong>. Vé điện tử sẽ được gửi
        vào email của bạn ngay sau khi thanh toán thành công, và luôn xem lại được trong mục
        "Vé của tôi".
      </p>
    ),
  },
  {
    q: "Ghế được giữ trong bao lâu?",
    a: (
      <p>
        Ghế bạn chọn sẽ được <strong>giữ trong 15 phút</strong> để hoàn tất thanh toán. Sau
        thời gian này, ghế tự động mở lại cho người khác nếu bạn chưa thanh toán xong.
      </p>
    ),
  },
  {
    q: "Đặt tối đa bao nhiêu ghế một lượt?",
    a: (
      <p>
        Mỗi lượt đặt vé tối đa <strong>10 ghế</strong>. Nếu nhóm bạn đông hơn, hãy tách thành
        nhiều lượt đặt riêng.
      </p>
    ),
  },
  {
    q: "Tôi có thể huỷ hoặc đổi vé đã thanh toán không?",
    a: (
      <p>
        Bạn có thể <strong>tự huỷ vé</strong> trong mục "Vé của tôi" — bấm nút "Hủy vé" trên vé
        muốn huỷ. Nếu vé đã thanh toán, hệ thống sẽ đánh dấu vé ở trạng thái hoàn tiền và đội ngũ
        CinemaGold sẽ xử lý chuyển tiền về phương thức thanh toán ban đầu. Hiện hệ thống{" "}
        <strong>chưa hỗ trợ đổi vé sang suất chiếu khác</strong> — nếu muốn xem suất khác, bạn
        huỷ vé hiện tại rồi đặt lại suất mới. Có vấn đề khác cần hỗ trợ thì liên hệ{" "}
        <Link href="/contact" className="text-primary hover:underline">
          tổng đài hỗ trợ
        </Link>{" "}
        hoặc nhân viên tại rạp nhé.
      </p>
    ),
  },
  {
    q: "Các loại phòng chiếu khác nhau như thế nào?",
    a: (
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Standard</strong>: phòng thường, giá tốt</li>
        <li><strong>VIP</strong>: ghế rộng, ngả lưng thoải mái</li>
        <li><strong>IMAX</strong>: màn hình khổng lồ, âm thanh sống động</li>
        <li><strong>4DX</strong>: ghế chuyển động, hiệu ứng mô phỏng theo phim</li>
      </ul>
    ),
  },
  {
    q: "Phân loại độ tuổi phim là gì?",
    a: (
      <ul className="list-disc list-inside space-y-1">
        <li><strong>PG</strong>: phổ biến, nên có người lớn hướng dẫn với trẻ nhỏ</li>
        <li><strong>PG-13</strong>: cân nhắc với trẻ dưới 13 tuổi</li>
        <li><strong>R</strong>: từ 17 tuổi trở lên, hoặc có người lớn đi cùng</li>
      </ul>
    ),
  },
  {
    q: "Có giảm giá cho sinh viên hoặc đặt vé theo nhóm không?",
    a: (
      <p>
        Hiện CinemaGold <strong>chưa có chương trình giảm giá/voucher</strong> áp dụng trực
        tuyến. Giá vé hiển thị là giá cuối cùng theo từng suất chiếu và loại phòng. Một số rạp
        có thể có ưu đãi riêng tại quầy — liên hệ trực tiếp rạp để biết thêm.
      </p>
    ),
  },
  {
    q: "Thanh toán bị lỗi hoặc vé gặp sự cố thì làm sao?",
    a: (
      <p>
        Rất tiếc về sự bất tiện này! Hãy chụp lại màn hình lỗi (nếu có) và ghi lại mã đặt vé,
        sau đó{" "}
        <Link href="/contact" className="text-primary hover:underline">
          liên hệ với chúng tôi
        </Link>{" "}
        để được xử lý nhanh nhất.
      </p>
    ),
  },
]

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Câu hỏi thường gặp</h1>
          <p className="text-muted-foreground mt-1">
            Chưa tìm thấy câu trả lời? Hỏi ngay trợ lý <strong>Cine</strong> ở góc màn hình
            hoặc xem{" "}
            <Link href="/help" className="text-primary hover:underline">
              Trung tâm trợ giúp
            </Link>
            .
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-4 sm:px-6">
          <Accordion type="single" collapsible>
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </main>
    </div>
  )
}
