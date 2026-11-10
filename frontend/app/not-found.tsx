import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, Home, Search } from "lucide-react"
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Film className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">404 — Không tìm thấy trang</CardTitle>
          <CardDescription>
            Trang hoặc phim bạn tìm không tồn tại, đã bị xoá, hoặc đường dẫn không đúng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild className="flex-1">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Về trang chủ
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/movies">
                <Search className="h-4 w-4 mr-2" />
                Tìm phim khác
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
