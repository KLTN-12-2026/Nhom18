"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import { getMyTickets } from "@/lib/api/tickets";
import { confirmVNPayReturn } from "@/lib/api/payments";
import Image from "next/image";

interface TicketDetails {
  id: number;
  booking_reference: string;
  showtime_id: number;
  seats: string[];
  combo_items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  seats_total: number;
  combo_total: number;
  total_amount: number;
  payment_status: string;
  movie_title?: string;
  cinema_name?: string;
  screen_name?: string;
  showtime?: string;
}

const MAX_PENDING_POLLS = 10; // ~30s chờ IPN/webhook xác nhận trước khi bỏ cuộc

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPolls, setPendingPolls] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticketId");

    // VNPay/MoMo nối thêm mã phản hồi của họ vào returnUrl — nếu giao dịch
    // không thành công (huỷ, hết hạn, sai OTP...) thì không được hiển thị
    // màn "Thanh toán thành công" mù quáng.
    const vnpCode = params.get("vnp_ResponseCode");
    if (vnpCode && vnpCode !== "00") {
      router.push(`/booking/payment-failed?error=${encodeURIComponent(vnpCode)}`);
      return;
    }

    if (!ticketId) {
      router.push("/");
      return;
    }

    // VNPay chuyển trình duyệt về kèm ĐẦY ĐỦ tham số vnp_* CÓ CHỮ KÝ. Gửi
    // nguyên bộ đó lên máy chủ xác minh rồi xác nhận vé, thay vì chỉ ngồi chờ
    // IPN. IPN (VNPay gọi thẳng vào máy chủ) chỉ chạy được khi máy chủ có địa
    // chỉ công khai — chạy ở máy cá nhân qua đường hầm thì đường hầm chết là
    // IPN không bao giờ tới, khách trả tiền xong mà vé treo rồi bị huỷ sau 20
    // phút. Máy chủ vẫn kiểm tra vnp_SecureHash nên không ai giả mạo được.
    if (vnpCode === "00" && params.get("vnp_SecureHash")) {
      const vnpParams: Record<string, string> = {};
      params.forEach((v, k) => {
        if (k.startsWith("vnp_")) vnpParams[k] = v;
      });
      confirmVNPayReturn(vnpParams)
        .then(() => fetchTicketDetails(Number(ticketId)))
        .catch(() => fetchTicketDetails(Number(ticketId))); // lỗi thì vẫn rơi về chờ IPN như cũ
      return;
    }

    fetchTicketDetails(Number(ticketId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Nếu vé vẫn "pending" (webhook thanh toán chưa kịp xử lý), thử lại vài lần
  // thay vì báo thành công hoặc bỏ mặc người dùng.
  useEffect(() => {
    if (!ticket || ticket.payment_status === "paid") return;
    if (ticket.payment_status === "failed" || ticket.payment_status === "cancelled") return;
    if (pendingPolls >= MAX_PENDING_POLLS) return;

    const timer = setTimeout(() => {
      fetchTicketDetails(ticket.id, true);
      setPendingPolls((p) => p + 1);
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, pendingPolls]);

  const fetchTicketDetails = async (ticketId: number, silent = false) => {
    try {
      const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
      if (!token) {
        router.push("/login");
        return;
      }

      const tickets = await getMyTickets();
      const foundTicket = tickets.find((t: any) => t.id === ticketId);

      if (!foundTicket) {
        throw new Error("Không tìm thấy vé");
      }

      // Parse JSON fields if they are strings
      const parsedTicket = {
        ...foundTicket,
        seats: typeof foundTicket.seats === 'string' ? JSON.parse(foundTicket.seats) : foundTicket.seats,
        combo_items: foundTicket.combo_items ? (typeof foundTicket.combo_items === 'string' ? JSON.parse(foundTicket.combo_items) : foundTicket.combo_items) : [],
        seats_total: foundTicket.seats_total || 0,
        combo_total: foundTicket.combo_total || 0,
      };

      setTicket(parsedTicket);

      if (!silent && parsedTicket.payment_status === "paid") {
        toast.success("Thanh toán thành công!", {
          description: `Vé của bạn đã được đặt. Mã đặt vé: ${parsedTicket.booking_reference}`,
        });
      }
    } catch (err) {
      // Chỉ set error (làm ẩn toàn bộ trang, thay bằng màn lỗi) khi đây là lần
      // tải ĐẦU TIÊN (silent=false) — nếu đang polling nền chờ xác nhận thanh
      // toán mà 1 request bị lỗi mạng thoáng qua, KHÔNG được xoá mất vé đã
      // tải thành công trước đó; cứ để màn "đang xác nhận thanh toán" hiển
      // thị tiếp, lượt poll kế tiếp sẽ tự thử lại.
      if (!silent) {
        setError(err instanceof Error ? err.message : "Lỗi kết nối");
        toast.error("Lỗi", {
          description: err instanceof Error ? err.message : "Không thể tải thông tin vé",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadTicket = () => {
    // Create a simple text-based ticket for download
    if (!ticket) return;

    const ticketText = `
===========================================
         CINEMA BOOKING TICKET
===========================================

Booking Reference: ${ticket.booking_reference}
Movie: ${ticket.movie_title || "N/A"}
Cinema: ${ticket.cinema_name || "N/A"}
Screen: ${ticket.screen_name || "N/A"}
Showtime: ${ticket.showtime || "N/A"}

Seats: ${ticket.seats.join(", ")}
Seats Total: ${Number(ticket.seats_total).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}

${ticket.combo_items && ticket.combo_items.length > 0 ? `
Combos:
${ticket.combo_items.map(c => `  - ${c.name} x${c.quantity}: ${(Number(c.price) * Number(c.quantity)).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}`).join("\n")}
Combo Total: ${Number(ticket.combo_total).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
` : ""}

TOTAL: ${Number(ticket.total_amount).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
Payment Status: ${ticket.payment_status.toUpperCase()}

===========================================
    Thank you for choosing our cinema!
===========================================
    `;

    const blob = new Blob([ticketText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${ticket.booking_reference}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Đang tải thông tin vé...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="container max-w-2xl mx-auto px-4">
          <Alert variant="destructive">
            <AlertDescription>{error || "Không tìm thấy thông tin vé"}</AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }

  if (ticket.payment_status === "failed" || ticket.payment_status === "cancelled") {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="container max-w-2xl mx-auto px-4">
          <Alert variant="destructive">
            <AlertDescription>
              Thanh toán không thành công cho vé {ticket.booking_reference}. Vui lòng thử đặt lại.
            </AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => router.push("/bookings")}>
            Xem lịch sử đặt vé
          </Button>
        </div>
      </div>
    );
  }

  if (ticket.payment_status !== "paid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="font-medium mb-1">Đang xác nhận thanh toán...</p>
          <p className="text-sm text-muted-foreground mb-4">
            Mã đặt vé: {ticket.booking_reference}. Việc xác nhận có thể mất vài giây.
          </p>
          {pendingPolls >= MAX_PENDING_POLLS && (
            <>
              <Alert variant="destructive" className="text-left mb-4">
                <AlertDescription>
                  Chưa nhận được xác nhận thanh toán. Vé của bạn vẫn ở trạng thái chờ — vui lòng kiểm tra lại trong lịch sử đặt vé sau ít phút.
                </AlertDescription>
              </Alert>
              <Button onClick={() => router.push("/bookings")}>Xem lịch sử đặt vé</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-green-600">
              Thanh toán thành công!
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Vé của bạn đã được đặt thành công
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* QR Code for check-in */}
            <div className="flex justify-center py-4">
              <div className="text-center">
                <div className="relative w-48 h-48 border-2 border-gray-300 rounded-lg p-2 mx-auto">
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${ticket.booking_reference}`}
                    alt="Check-in QR Code"
                    fill
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Quét mã này tại rạp để check-in
                </p>
              </div>
            </div>

            {/* Booking Reference */}
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-1">Mã đặt vé</p>
              <p className="text-2xl font-bold font-mono">{ticket.booking_reference}</p>
            </div>

            {/* Ticket Details */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Chi tiết vé</h3>
                <div className="space-y-2 text-sm">
                  {ticket.movie_title && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phim:</span>
                      <span className="font-medium">{ticket.movie_title}</span>
                    </div>
                  )}
                  {ticket.cinema_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rạp:</span>
                      <span>{ticket.cinema_name}</span>
                    </div>
                  )}
                  {ticket.screen_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phòng:</span>
                      <span>{ticket.screen_name}</span>
                    </div>
                  )}
                  {ticket.showtime && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Suất chiếu:</span>
                      <span>{new Date(ticket.showtime).toLocaleString("vi-VN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ghế:</span>
                    <span className="font-medium">{ticket.seats.join(", ")}</span>
                  </div>
                </div>
              </div>

              {/* Price Breakdown */}
              <div>
                <h3 className="font-semibold mb-2">Chi tiết thanh toán</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tiền vé ({ticket.seats.length} ghế)</span>
                    <span>{Number(ticket.seats_total).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}</span>
                  </div>

                  {ticket.combo_items && ticket.combo_items.length > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combo</span>
                        <span>{Number(ticket.combo_total || 0).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}</span>
                      </div>
                      <div className="pl-4 space-y-1">
                        {ticket.combo_items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {item.name || 'Combo'} × {item.quantity || 1}
                            </span>
                            <span>{((Number(item.price) || 0) * (Number(item.quantity) || 1)).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  
                  <div className="flex justify-between font-bold text-base pt-2 border-t">
                    <span>Tổng cộng</span>
                    <span className="text-primary">{Number(ticket.total_amount).toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-4">
              <Button
                className="w-full"
                variant="outline"
                onClick={downloadTicket}
              >
                <Download className="w-4 h-4 mr-2" />
                Tải vé
              </Button>
              
              <Button
                className="w-full"
                onClick={() => router.push("/bookings")}
              >
                Xem lịch sử đặt vé
              </Button>
              
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => router.push("/")}
              >
                Về trang chủ
              </Button>
            </div>

            <Alert>
              <QrCode className="h-4 w-4" />
              <AlertDescription>
                Vui lòng đến rạp trước 15 phút và xuất trình mã QR hoặc mã đặt vé để check-in.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
