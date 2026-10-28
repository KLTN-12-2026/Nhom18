"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getCinemas } from "@/lib/api/cinemas"
import { MapPin } from "lucide-react"

export default function CinemasPage() {
  const [cinemas, setCinemas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCinemas()
  }, [])

  const fetchCinemas = useCallback(async () => {
    try {
      const cinemas = await getCinemas()
      setCinemas(cinemas)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Đang tải...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Rạp chiếu phim</h1>
          <p className="text-muted-foreground">Khám phá các rạp chiếu phim đối tác của chúng tôi</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cinemas.map((c: any) => (
            <Card key={c.id} className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-xl">{c.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <MapPin className="h-4 w-4" />
                  <span>{c.location}</span>
                </div>
                
                {c.rooms && c.rooms.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2 text-foreground">Phòng chiếu ({c.rooms.length}):</h3>
                    <div className="space-y-2">
                      {c.rooms.map((room: any) => (
                        <div key={room.id} className="text-sm border border-border rounded-md p-2 bg-muted/30">
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-foreground">🎬 {room.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {room.room_type === 'standard' ? 'Phòng thường' : 
                               room.room_type === 'vip' ? 'VIP' : 
                               room.room_type === 'imax' ? 'IMAX' : room.room_type}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Sức chứa: {room.seat_capacity} ghế
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <Link className="text-primary hover:underline text-sm" href="/showtimes">
                    Xem lịch chiếu
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
