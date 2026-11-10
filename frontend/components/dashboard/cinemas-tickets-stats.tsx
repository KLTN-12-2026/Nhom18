"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Ticket, TrendingUp, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatVND } from "@/lib/utils"
import { getCinemasSummary } from "@/lib/api/admin/cinema-stats"

interface CinemasTicketsStatsProps {
  daysBack?: number
  selectedCinemaId?: string
}

interface TicketsChartDatum {
  id: number
  name: string
  fullName: string
  value: number
  occupancy: number
  revenue: number
  capacity: number
  isSelected: boolean
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
const HIGHLIGHT_COLOR = '#6366f1'

export function CinemasTicketsStats({ daysBack = 30, selectedCinemaId }: CinemasTicketsStatsProps) {
  const [data, setData] = useState<TicketsChartDatum[]>([])
  const [loading, setLoading] = useState(true)
  const [totalTickets, setTotalTickets] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getCinemasSummary(daysBack)
        const chartData: TicketsChartDatum[] = result.map((cinema) => ({
          id: cinema.cinema_id,
          name: cinema.cinema_name.replace(/^(Rạp |Cinema )/i, ''),
          fullName: cinema.cinema_name,
          value: cinema.tickets_sold,
          // occupancy_rate/total_capacity có thể NULL khi rạp chưa có phòng/ghế nào
          occupancy: parseFloat((cinema.occupancy_rate ?? 0).toString()),
          revenue: parseFloat(cinema.total_revenue.toString()),
          capacity: parseFloat((cinema.total_capacity ?? 0).toString()),
          isSelected: Boolean(selectedCinemaId && selectedCinemaId !== 'all' && cinema.cinema_id.toString() === selectedCinemaId)
        }))

        setData(chartData)

        const total = chartData.reduce((sum, item) => sum + item.value, 0)
        setTotalTickets(total)
      } catch (error) {
        console.error('Error fetching cinemas tickets:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [daysBack])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const percent = totalTickets > 0 ? ((data.value / totalTickets) * 100).toFixed(1) : 0
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-2">{data.payload.fullName}</p>
          <p className="text-sm text-muted-foreground">
            Vé bán: <span className="font-bold text-primary">{data.value}</span> ({percent}%)
          </p>
          <p className="text-sm text-muted-foreground">
            Doanh thu: <span className="font-bold">{formatVND(data.payload.revenue)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Lấp đầy: <span className="font-bold">{data.payload.occupancy.toFixed(1)}%</span>
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
            <Ticket className="h-5 w-5 text-blue-600" />
            Vé bán theo rạp
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
          <Ticket className="h-5 w-5 text-blue-600" />
          Vé bán theo rạp
        </CardTitle>
        <CardDescription>
          {daysBack} ngày gần nhất • Tổng: {totalTickets.toLocaleString('vi-VN')} vé
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isSelected ? HIGHLIGHT_COLOR : COLORS[index % COLORS.length]}
                      opacity={entry.isSelected ? 1 : (selectedCinemaId && selectedCinemaId !== 'all' ? 0.4 : 1)}
                      stroke={entry.isSelected ? HIGHLIGHT_COLOR : 'none'}
                      strokeWidth={entry.isSelected ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats List */}
          <div className="space-y-2">
            {data.map((cinema, index) => {
              const percent = totalTickets > 0 ? ((cinema.value / totalTickets) * 100).toFixed(1) : 0
              const isHighlighted = cinema.isSelected
              return (
                <div 
                  key={cinema.name} 
                  className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                    isHighlighted 
                      ? 'bg-primary/10 ring-2 ring-primary/50' 
                      : 'hover:bg-muted/50'
                  } ${!isHighlighted && selectedCinemaId && selectedCinemaId !== 'all' ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: isHighlighted ? HIGHLIGHT_COLOR : COLORS[index % COLORS.length] }}
                    />
                    <span className={`text-sm ${isHighlighted ? 'font-bold' : 'font-medium'}`}>{cinema.fullName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isHighlighted ? "default" : "outline"} className="text-xs">
                      {cinema.value} vé
                    </Badge>
                    <span className="text-xs text-muted-foreground">{percent}%</span>
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
