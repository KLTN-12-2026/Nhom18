"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts"
import { Target, TrendingUp, TrendingDown } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { getCinemasSummary } from "@/lib/api/admin/cinema-stats"

interface CinemasOccupancyProps {
  daysBack?: number
  selectedCinemaId?: string
}

interface OccupancyChartDatum {
  id: number
  name: string
  fullName: string
  occupancy: number
  capacity: number
  tickets: number
  isSelected: boolean
}

export function CinemasOccupancy({ daysBack = 30, selectedCinemaId }: CinemasOccupancyProps) {
  const [data, setData] = useState<OccupancyChartDatum[]>([])
  const [loading, setLoading] = useState(true)
  const [avgOccupancy, setAvgOccupancy] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getCinemasSummary(daysBack)
        const chartData = result.map((cinema): OccupancyChartDatum => {
          // occupancy_rate/total_capacity có thể NULL khi rạp chưa có phòng/ghế nào
          const occupancy = parseFloat((cinema.occupancy_rate ?? 0).toString())
          return {
            id: cinema.cinema_id,
            name: cinema.cinema_name.replace(/^(Rạp |Cinema )/i, ''),
            fullName: cinema.cinema_name,
            occupancy,
            capacity: parseFloat((cinema.total_capacity ?? 0).toString()),
            tickets: cinema.tickets_sold,
            isSelected: Boolean(selectedCinemaId && selectedCinemaId !== 'all' && cinema.cinema_id.toString() === selectedCinemaId)
          }
        }).sort((a, b) => b.occupancy - a.occupancy)

        setData(chartData)

        const avg = chartData.reduce((sum, item) => sum + item.occupancy, 0) / chartData.length
        setAvgOccupancy(avg)
      } catch (error) {
        console.error('Error fetching cinemas occupancy:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [daysBack])

  const getOccupancyColor = (occupancy: number) => {
    if (occupancy >= 75) return '#10b981' // green
    if (occupancy >= 50) return '#3b82f6' // blue
    if (occupancy >= 30) return '#f59e0b' // orange
    return '#ef4444' // red
  }

  const getOccupancyStatus = (occupancy: number) => {
    if (occupancy >= 75) return { label: 'Tuyệt vời', variant: 'default' as const }
    if (occupancy >= 50) return { label: 'Tốt', variant: 'secondary' as const }
    if (occupancy >= 30) return { label: 'Trung bình', variant: 'outline' as const }
    return { label: 'Cần cải thiện', variant: 'destructive' as const }
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-2">{data.fullName}</p>
          <p className="text-sm text-muted-foreground">
            Lấp đầy: <span className="font-bold text-primary">{data.occupancy.toFixed(1)}%</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Vé bán: <span className="font-bold">{data.tickets}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Sức chứa: <span className="font-bold">{data.capacity}</span>
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-600" />
            Tỉ lệ lấp đầy phòng
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-orange-600" />
          Tỉ lệ lấp đầy phòng theo rạp
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {daysBack} ngày gần nhất • Trung bình: {avgOccupancy.toFixed(1)}%
          {avgOccupancy >= 60 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-orange-600" />
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Bar Chart */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                className="text-xs"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                className="text-xs"
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="occupancy" radius={[8, 8, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getOccupancyColor(entry.occupancy)} />
                ))}
                <LabelList 
                  dataKey="occupancy" 
                  position="top" 
                  formatter={(value: number) => `${value.toFixed(0)}%`}
                  style={{ fontSize: '11px', fontWeight: 'bold' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detailed List */}
          <div className="space-y-3">
            {data.map((cinema) => {
              const status = getOccupancyStatus(cinema.occupancy)
              return (
                <div key={cinema.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cinema.fullName}</span>
                      <Badge variant={status.variant} className="text-xs">
                        {status.label}
                      </Badge>
                    </div>
                    <span className="text-sm font-bold" style={{ color: getOccupancyColor(cinema.occupancy) }}>
                      {cinema.occupancy.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={cinema.occupancy} 
                    className="h-2"
                    style={{ 
                      // @ts-ignore
                      '--progress-background': getOccupancyColor(cinema.occupancy)
                    } as React.CSSProperties}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{cinema.tickets} vé / {cinema.capacity} ghế</span>
                    <span>{cinema.capacity > 0 ? ((cinema.tickets / cinema.capacity) * 100).toFixed(1) : 0}% đã bán</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
