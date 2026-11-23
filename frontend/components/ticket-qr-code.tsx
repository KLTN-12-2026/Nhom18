"use client"

import { QRCodeSVG } from "qrcode.react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Share2 } from "lucide-react"
import { toast } from "sonner"

interface TicketQRCodeProps {
  ticketId: number
  bookingCode?: string
  movieTitle: string
  showDate: string
  showTime: string
  seats: string
  cinema: string
}

export function TicketQRCode({
  ticketId,
  bookingCode,
  movieTitle,
  showDate,
  showTime,
  seats,
  cinema
}: TicketQRCodeProps) {
  // Generate unique QR code value
  const qrValue = JSON.stringify({
    ticket_id: ticketId,
    booking_code: bookingCode || `BK${ticketId.toString().padStart(6, '0')}`,
    movie: movieTitle,
    date: showDate,
    time: showTime,
    seats: seats,
    cinema: cinema,
    verified: true
  })

  const handleDownload = () => {
    const svg = document.getElementById(`qr-${ticketId}`)
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      
      const pngFile = canvas.toDataURL("image/png")
      const downloadLink = document.createElement("a")
      downloadLink.download = `ticket-${ticketId}.png`
      downloadLink.href = pngFile
      downloadLink.click()
      
      toast.success("Tải xuống thành công", {
        description: "QR code đã được lưu vào máy của bạn",
      })
    }

    img.src = "data:image/svg+xml;base64," + btoa(svgData)
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Vé xem phim: ${movieTitle}`,
          text: `Vé xem phim ${movieTitle} - ${showDate} ${showTime}\nRạp: ${cinema}\nGhế: ${seats}`,
          url: window.location.href
        })
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(window.location.href)
        toast.success("Đã sao chép", {
          description: "Link đã được sao chép vào clipboard",
        })
      }
    } catch (error) {
      console.error("Error sharing:", error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">QR Code Vé</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="p-4 bg-white rounded-lg">
          <QRCodeSVG
            id={`qr-${ticketId}`}
            value={qrValue}
            size={200}
            level="H"
            includeMargin
          />
        </div>

        <p className="text-sm text-center text-muted-foreground max-w-xs">
          Vui lòng xuất trình mã QR này tại quầy vé để nhận vé xem phim
        </p>

        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Tải xuống
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Chia sẻ
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
