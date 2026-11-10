"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, Minus, DollarSign, Users, Target, Clock } from "lucide-react"
import React from "react"
import { formatVND } from "@/lib/utils"
import { getDashboardStats } from "@/lib/api/admin/dashboard"
import { getShowtimesByDate } from "@/lib/api/showtimes"

interface Metric {
  label: string
  value: string | number
  target?: number
  change?: number
  format?: 'currency' | 'percent' | 'number'
}

interface PerformanceMetricsProps {
  cinemaId?: string
  metrics?: {
    fillRate: number
    avgTicketPrice: number
    avgTicketPriceChange?: number
    conversionRate?: number
    peakHour?: string
    activeUsers?: number
  }
}

export function PerformanceMetrics({ metrics, cinemaId }: PerformanceMetricsProps) {
  const [data, setData] = React.useState<any>(null)

  React.useEffect(() => {
    if (metrics) {
      setData(metrics)
    } else {
      // Fetch performance data
      const fetchData = async () => {
        try {
          // Get today's date in local timezone
          const nowLocal = new Date()
          const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`

          const [stats, showtimes] = await Promise.all([
            getDashboardStats(cinemaId),
            getShowtimesByDate(today, cinemaId),
          ])

          // Calculate metrics
          const totalSeats = showtimes.reduce((sum: number, s: any) =>
            sum + (s.total_seats || 0), 0)
          const soldSeats = showtimes.reduce((sum: number, s: any) =>
            sum + (s.tickets_sold || 0), 0)
          const fillRate = totalSeats > 0 ? (soldSeats / totalSeats * 100) : 0

          const tickets = stats?.tickets?.today || 0
          const revenue = stats?.revenue?.today || 0
          const avgTicketPrice = tickets > 0 ? revenue / tickets : 0

          setData({
            fillRate: fillRate.toFixed(1),
            avgTicketPrice: avgTicketPrice.toFixed(0),
            avgTicketPriceChange: stats?.revenue?.change || 0,
            activeUsers: stats?.users?.total || 0,
            totalShowtimes: showtimes.length || 0
          })
        } catch (error) {
          console.error('Error fetching performance metrics:', error)
        }
      }
      fetchData()

      const interval = setInterval(fetchData, 30000)
      return () => clearInterval(interval)
    }
  }, [metrics, cinemaId]) // Re-fetch when cinemaId changes

  if (!data) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          Đang tải metrics...
        </CardContent>
      </Card>
    )
  }

  const renderTrend = (change: number) => {
    if (change > 0) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{change}%
        </Badge>
      )
    } else if (change < 0) {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">
          <TrendingDown className="h-3 w-3 mr-1" />
          {change}%
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-gray-500/10 text-gray-700">
        <Minus className="h-3 w-3 mr-1" />
        0%
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Chỉ Số Hiệu Suất
        </CardTitle>
        <CardDescription>
          Các metrics quan trọng cho hoạt động kinh doanh
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Fill Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tỷ lệ lấp đầy</p>
                  <p className="text-2xl font-bold text-foreground">{data.fillRate}%</p>
                </div>
              </div>
            </div>
            <Progress value={parseFloat(data.fillRate)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {parseFloat(data.fillRate) >= 70 ? '🟢 Tốt' : 
               parseFloat(data.fillRate) >= 50 ? '🟡 Khá' : '🔴 Cần cải thiện'}
            </p>
          </div>

          {/* Avg Ticket Price */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Giá vé TB</p>
                  <p className="text-2xl font-bold text-foreground">{formatVND(data.avgTicketPrice)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {renderTrend(parseFloat(data.avgTicketPriceChange || 0))}
              <span className="text-xs text-muted-foreground">so với hôm qua</span>
            </div>
          </div>

          {/* Active Users */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Người dùng</p>
                  <p className="text-2xl font-bold text-foreground">{data.activeUsers?.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Tổng số tài khoản đã đăng ký</p>
          </div>

          {/* Today's Showtimes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Suất chiếu</p>
                  <p className="text-2xl font-bold text-foreground">{data.totalShowtimes}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Tổng suất chiếu hôm nay</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
