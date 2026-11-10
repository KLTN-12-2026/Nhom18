"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle, 
  Info,
  ArrowRight,
  Sparkles,
  ChevronRight
} from "lucide-react"
import Link from "next/link"
import React from "react"
import { formatVND } from "@/lib/utils"
import { getDashboardStats } from "@/lib/api/admin/dashboard"
import { getReportsSummary } from "@/lib/api/admin/reports"

interface ExecutiveSummaryProps {
  cinemaId?: string
}

export function ExecutiveSummary({ cinemaId }: ExecutiveSummaryProps) {
  const [summary, setSummary] = React.useState<any>(null)
  const [insights, setInsights] = React.useState<any[]>([])

  React.useEffect(() => {
    const fetchSummary = async () => {
      try {
        // Get today and yesterday using local timezone (not UTC)
        const nowLocal = new Date()
        const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
        const yestLocal = new Date(Date.now() - 24*3600*1000)
        const yesterday = `${yestLocal.getFullYear()}-${String(yestLocal.getMonth() + 1).padStart(2, '0')}-${String(yestLocal.getDate()).padStart(2, '0')}`

        const [dashData, todayData, yesterdayData] = await Promise.all([
          getDashboardStats(cinemaId),
          getReportsSummary(`${today} 00:00:00`, `${today} 23:59:59`, cinemaId),
          getReportsSummary(`${yesterday} 00:00:00`, `${yesterday} 23:59:59`, cinemaId),
        ])

        // Calculate changes
        const revenueChangeNum = yesterdayData.revenue > 0 
          ? ((todayData.revenue - yesterdayData.revenue) / yesterdayData.revenue * 100)
          : 0
        const ticketsChangeNum = yesterdayData.tickets > 0
          ? ((todayData.tickets - yesterdayData.tickets) / yesterdayData.tickets * 100)
          : 0

        setSummary({
          todayRevenue: todayData.revenue,
          todayTickets: todayData.tickets,
          todayShowtimes: todayData.showtimes,
          revenueChange: Number(revenueChangeNum.toFixed(1)),
          ticketsChange: Number(ticketsChangeNum.toFixed(1)),
          totalUsers: dashData?.users?.total || 0,
          totalMovies: dashData?.movies?.total || 0
        })

        // Generate insights
        const newInsights = []
        
        if (revenueChangeNum > 20) {
          newInsights.push({
            type: 'success',
            icon: TrendingUp,
            title: 'Doanh thu tăng mạnh',
            description: `Doanh thu hôm nay cao hơn ${revenueChangeNum.toFixed(1)}% so với hôm qua`,
            action: 'Xem chi tiết',
            link: '/admin/reports'
          })
        } else if (revenueChangeNum < -10) {
          newInsights.push({
            type: 'warning',
            icon: TrendingDown,
            title: 'Doanh thu giảm',
            description: `Doanh thu hôm nay thấp hơn ${Math.abs(revenueChangeNum).toFixed(1)}% so với hôm qua`,
            action: 'Xem báo cáo',
            link: '/admin/reports'
          })
        }

        if (todayData.showtimes < 10) {
          newInsights.push({
            type: 'info',
            icon: AlertCircle,
            title: 'Ít suất chiếu',
            description: `Hôm nay chỉ có ${todayData.showtimes} suất chiếu`,
            action: 'Tự động tạo suất',
            link: '/admin/auto-generate-showtimes'
          })
        }

        if (newInsights.length === 0) {
          newInsights.push({
            type: 'success',
            icon: CheckCircle,
            title: 'Hệ thống hoạt động tốt',
            description: 'Tất cả các chỉ số đều trong mức ổn định',
            action: 'Xem dashboard',
            link: '/admin'
          })
        }

        setInsights(newInsights)
      } catch (error) {
        console.error('Error fetching executive summary:', error)
      }
    }
    fetchSummary()

    const interval = setInterval(fetchSummary, 30000)
    return () => clearInterval(interval)
  }, [cinemaId]) // Re-fetch when cinemaId changes

  if (!summary) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-8 text-center text-muted-foreground">
          Đang tải tổng quan...
        </CardContent>
      </Card>
    )
  }

  const renderTrendBadge = (change: number) => {
    if (change > 0) {
      return (
        <Badge className="bg-green-500/10 text-green-700 border-green-500/20 hover:bg-green-500/20">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{change}%
        </Badge>
      )
    } else if (change < 0) {
      return (
        <Badge className="bg-red-500/10 text-red-700 border-red-500/20 hover:bg-red-500/20">
          <TrendingDown className="h-3 w-3 mr-1" />
          {change}%
        </Badge>
      )
    }
    return null
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Tổng Quan Điều Hành
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {new Date().toLocaleDateString('vi-VN', { 
              weekday: 'long', 
              day: '2-digit', 
              month: '2-digit',
              year: 'numeric'
            })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Doanh Thu Hôm Nay</p>
            <p className="text-2xl font-bold text-primary mb-1">
              {formatVND(summary.todayRevenue)}
            </p>
            {renderTrendBadge(summary.revenueChange)}
          </div>

          <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Vé Bán Hôm Nay</p>
            <p className="text-2xl font-bold text-green-600 mb-1">
              {summary.todayTickets?.toLocaleString() || 0}
            </p>
            {renderTrendBadge(summary.ticketsChange)}
          </div>

          <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Suất Chiếu</p>
            <p className="text-2xl font-bold text-blue-600">
              {summary.todayShowtimes || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Hôm nay</p>
          </div>

          <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Tổng Phim</p>
            <p className="text-2xl font-bold text-purple-600">
              {summary.totalMovies}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Đang quản lý</p>
          </div>
        </div>

        {/* Insights & Recommendations */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Info className="h-4 w-4" />
            Thông Tin & Đề Xuất
          </h4>
          {insights.map((insight, index) => (
            <div
              key={index}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                ${insight.type === 'success' ? 'bg-green-500/5 border-green-500/20' :
                  insight.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-blue-500/5 border-blue-500/20'}
              `}
            >
              <div className="flex items-start gap-3 flex-1">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                  ${insight.type === 'success' ? 'bg-green-500/10' :
                    insight.type === 'warning' ? 'bg-amber-500/10' :
                    'bg-blue-500/10'}
                `}>
                  <insight.icon className={`h-5 w-5 
                    ${insight.type === 'success' ? 'text-green-600' :
                      insight.type === 'warning' ? 'text-amber-600' :
                      'text-blue-600'}
                  `} />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-semibold text-sm text-foreground mb-1">
                    {insight.title}
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    {insight.description}
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="shrink-0"
                asChild
              >
                <Link href={insight.link}>
                  {insight.action}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
