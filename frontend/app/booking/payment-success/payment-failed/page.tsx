"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, Home, RotateCcw } from "lucide-react";
import { usePublicContact } from "@/hooks/use-public-contact";
import { telHref } from "@/lib/api/settings";

export default function PaymentFailedPage() {
  const router = useRouter();
  // Tổng đài lấy từ trang Cài đặt của admin — trước đây ghi cứng "1900 xxxx".
  const contact = usePublicContact();

  const handleRetry = () => {
    // Go back to booking page to retry
    router.back();
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-red-600">
              Thanh toán thất bại
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Rất tiếc, giao dịch của bạn không thành công
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertDescription>
                Thanh toán của bạn không được xử lý thành công. Vui lòng thử lại hoặc chọn phương thức thanh toán khác.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Nguyên nhân có thể:</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Tài khoản không đủ số dư</li>
                <li>Thông tin thanh toán không chính xác</li>
                <li>Phiên thanh toán đã hết hạn</li>
                <li>Lỗi kết nối mạng</li>
                <li>Cổng thanh toán đang bảo trì</li>
              </ul>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                className="w-full"
                size="lg"
                onClick={handleRetry}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Thử lại
              </Button>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => router.push("/")}
              >
                <Home className="w-4 h-4 mr-2" />
                Về trang chủ
              </Button>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              <p>Cần hỗ trợ?</p>
              {contact?.support_phone ? (
                <p>
                  Liên hệ tổng đài:{" "}
                  <a href={telHref(contact.support_phone)} className="font-semibold hover:text-primary">
                    {contact.support_phone}
                  </a>
                </p>
              ) : (
                <p>
                  Xem các kênh hỗ trợ tại{" "}
                  <Link href="/contact" className="font-semibold text-primary hover:underline">
                    trang Liên hệ
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
