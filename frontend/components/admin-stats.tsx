import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, Users, Ticket, DollarSign, TrendingUp } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getDashboardStats } from "@/lib/api/admin/dashboard"

interface StatsCardProps {
  title: string
  value: string | number
  change?: string
  icon: React.ComponentType<{ className?: string }>
}

function StatsCard({ title, value, change, icon: Icon }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {change && (
          <div className="flex items-center text-xs text-muted-foreground mt-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {change}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface AdminStatsProps {
  cinemaId?: string
}

export function AdminStats({ cinemaId }: AdminStatsProps) {
  const [stats, setStats] = React.useState<{
    users?: { total: number; monthChange: string };
    movies?: { total: number; monthNew: number };
    tickets?: { today: number; change: string };
    revenue?: { today: number; change: string };
  }>({})
  const [loading, setLoading] = React.useState(true)
  const isFirstLoad = React.useRef(true)

  React.useEffect(() => {
    async function fetchStats() {
      // Only show loading skeleton on the very first load, not on auto-refresh
      if (isFirstLoad.current) setLoading(true)
      try {
        const stats = await getDashboardStats(cinemaId)
        setStats(stats)
      } catch (error) {
        console.error('Error fetching admin stats:', error)
      } finally {
        setLoading(false)
        isFirstLoad.current = false
      }
    }
    isFirstLoad.current = true
    fetchStats()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [cinemaId]) // Re-fetch when cinemaId changes

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-muted rounded"></div>
              <div className="h-4 w-4 bg-muted rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-24 bg-muted rounded mb-2"></div>
              <div className="h-3 w-32 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        title="Tổng số phim"
        value={stats.movies?.total ?? '...'}
        change={stats.movies?.monthNew ? `+${stats.movies.monthNew} phim mới tháng này` : undefined}
        icon={Film}
      />
      <StatsCard
        title="Người dùng"
        value={stats.users?.total != null ? stats.users.total.toLocaleString() : '...'}
        change={stats.users?.monthChange ? `+${stats.users.monthChange}% tháng này` : undefined}
        icon={Users}
      />
      <StatsCard
        title="Đặt vé hôm nay"
        value={stats.tickets?.today ?? '...'}
        change={stats.tickets?.change ? `${stats.tickets.change}% so với hôm qua` : undefined}
        icon={Ticket}
      />
      <StatsCard
        title="Doanh thu hôm nay"
        value={stats.revenue?.today != null ? formatVND(stats.revenue.today) : '...'}
        change={stats.revenue?.change ? `${stats.revenue.change}% so với hôm qua` : undefined}
        icon={DollarSign}
      />
    </div>
  )
}
