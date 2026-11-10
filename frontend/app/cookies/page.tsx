import { Header } from "@/components/header"

const STORAGE_ITEMS = [
  { name: "auth_token", purpose: "Duy trì phiên đăng nhập của bạn — lưu theo tab trình duyệt (sessionStorage), tự xoá khi bạn đóng tab/trình duyệt", type: "Bắt buộc" },
  { name: "theme", purpose: "Ghi nhớ giao diện sáng/tối bạn đã chọn", type: "Chức năng" },
  { name: "cinebot_qa_history_*", purpose: "Lưu lịch sử trò chuyện với trợ lý Cine trên trình duyệt của bạn", type: "Chức năng" },
  { name: "preferredPaymentMethod", purpose: "Ghi nhớ phương thức thanh toán bạn hay dùng", type: "Chức năng" },
  { name: "admin_hidden_ui_items", purpose: "Ghi nhớ tuỳ chỉnh giao diện quản trị (chỉ áp dụng cho tài khoản admin)", type: "Chức năng" },
]

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-1">Chính sách Cookie</h1>
        <p className="text-muted-foreground mb-8">Cập nhật lần cuối: 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground [&>section>h2]:text-foreground [&>section>h2]:font-semibold [&>section>h2]:text-base [&>section>h2]:mb-2">
          <section>
            <h2>1. CinemaGold dùng cookie/lưu trữ trình duyệt để làm gì?</h2>
            <p>
              Chúng tôi sử dụng bộ nhớ cục bộ của trình duyệt (localStorage/sessionStorage) để
              website hoạt động đúng và ghi nhớ một số tuỳ chọn của bạn. Chúng tôi{" "}
              <strong>không dùng cookie theo dõi quảng cáo của bên thứ ba</strong>.
            </p>
          </section>

          <section>
            <h2>2. Dữ liệu được lưu trên trình duyệt của bạn</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse mt-2">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-semibold text-foreground">Tên</th>
                    <th className="py-2 pr-4 font-semibold text-foreground">Mục đích</th>
                    <th className="py-2 font-semibold text-foreground">Loại</th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_ITEMS.map((item) => (
                    <tr key={item.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{item.name}</td>
                      <td className="py-2 pr-4">{item.purpose}</td>
                      <td className="py-2">{item.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>3. Kiểm soát dữ liệu của bạn</h2>
            <p>
              Bạn có thể xoá dữ liệu này bất cứ lúc nào qua cài đặt trình duyệt (xoá dữ liệu
              trang web) hoặc bằng nút &quot;Cuộc trò chuyện mới&quot; trong khung chat để xoá
              riêng lịch sử chat. Lưu ý: xoá <span className="font-mono text-xs">auth_token</span>{" "}
              sẽ đăng xuất bạn khỏi tài khoản.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
