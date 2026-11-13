"use client"

import React, { useEffect, useState } from "react"
import { Building2, CheckCircle2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getCinemas } from "@/lib/api/cinemas"
import { useCinemaScope } from "@/hooks/use-cinema-scope"

interface Cinema {
  id: number
  name: string
  location: string
  status: string
}

interface CinemaSelectorProps {
  selectedCinemaId: string
  onCinemaChange: (cinemaId: string) => void
}

export function CinemaSelector({ selectedCinemaId, onCinemaChange }: CinemaSelectorProps) {
  const [cinemas, setCinemas] = useState<Cinema[]>([])
  const [loading, setLoading] = useState(true)
  const { isManager, scopedCinemaId, scopedFilterValue, cinemaName } = useCinemaScope()

  useEffect(() => {
    const fetchCinemas = async () => {
      try {
        setCinemas((await getCinemas()) as Cinema[])
      } catch (error) {
        console.error('Error fetching cinemas:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCinemas()
  }, [])

  // Quản lý chi nhánh: ép bộ lọc về đúng rạp mình. Backend đã chặn nên có đổi
  // cũng không lấy được số liệu rạp khác, nhưng để "Tất cả rạp" trên màn hình
  // thì con số hiển thị lại là của riêng 1 rạp — sai lệch khó hiểu hơn là chặn.
  useEffect(() => {
    if (isManager && scopedCinemaId && selectedCinemaId !== scopedFilterValue) {
      onCinemaChange(scopedFilterValue)
    }
  }, [isManager, scopedCinemaId, scopedFilterValue, selectedCinemaId, onCinemaChange])

  const selectedCinema = selectedCinemaId === 'all'
    ? null
    : cinemas.find(c => c.id.toString() === selectedCinemaId)

  // Không có gì để chọn thì không hiện ô chọn — chỉ nói rõ đang xem rạp nào.
  if (isManager) {
    return (
      <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20 shadow-lg">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 ring-4 ring-primary/5">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Chi nhánh bạn quản lý</p>
              <p className="text-xl font-bold text-foreground">
                {cinemaName || selectedCinema?.name || "Chưa được gán rạp"}
                <Badge variant="default" className="ml-2">Chi tiết</Badge>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20 shadow-lg">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 ring-4 ring-primary/5">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Đang xem thống kê</p>
                <p className="text-xl font-bold text-foreground">
                  {loading ? (
                    "Đang tải..."
                  ) : selectedCinemaId === 'all' ? (
                    <>
                      Tất cả {cinemas.length} rạp
                      <Badge variant="secondary" className="ml-2">Tổng quan</Badge>
                    </>
                  ) : (
                    <>
                      {selectedCinema?.name || 'Chọn rạp'}
                      <Badge variant="default" className="ml-2 animate-pulse">Chi tiết</Badge>
                    </>
                  )}
                </p>
              </div>
            </div>

            <Select value={selectedCinemaId} onValueChange={onCinemaChange}>
              <SelectTrigger className="w-[300px] bg-background border-2 hover:border-primary/50 transition-colors">
                <SelectValue placeholder="Chọn rạp chiếu..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2 py-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold">Tất cả rạp</span>
                    <Badge variant="outline" className="ml-auto">Tổng quan</Badge>
                  </div>
                </SelectItem>
                
                {cinemas.length > 0 && (
                  <div className="border-t my-1" />
                )}
                
                {cinemas.map((cinema) => (
                  <SelectItem key={cinema.id} value={cinema.id.toString()}>
                    <div className="flex flex-col py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cinema.name}</span>
                        {selectedCinemaId === cinema.id.toString() && (
                          <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">📍 {cinema.location}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
