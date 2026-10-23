"use client"

import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Sparkles, Archive } from "lucide-react"

interface MovieStatusBadgeProps {
  status: "NOW_SHOWING" | "COMING_SOON" | "UPCOMING" | "ENDED"
  className?: string
}

const statusConfig = {
  NOW_SHOWING: {
    label: "Đang Chiếu",
    variant: "default" as const,
    icon: Clock,
    className: "bg-green-600 hover:bg-green-700 text-white"
  },
  COMING_SOON: {
    label: "Sắp Chiếu",
    variant: "secondary" as const,
    icon: Calendar,
    className: "bg-orange-600 hover:bg-orange-700 text-white"
  },
  UPCOMING: {
    label: "Sớm Ra Mắt",
    variant: "outline" as const,
    icon: Sparkles,
    className: "bg-blue-600 hover:bg-blue-700 text-white"
  },
  // Trước đây KHÔNG có nhánh này — statusConfig[status] || statusConfig.NOW_SHOWING
  // rơi về mặc định NOW_SHOWING, khiến phim ĐÃ NGỪNG CHIẾU (ENDED) hiện badge
  // xanh "Đang Chiếu" y hệt phim thật đang chiếu, dễ khiến người dùng tưởng
  // đặt vé được trong khi phim không còn suất chiếu nào.
  ENDED: {
    label: "Đã Ngừng Chiếu",
    variant: "outline" as const,
    icon: Archive,
    className: "bg-muted text-muted-foreground border-muted-foreground/30"
  }
}

export function MovieStatusBadge({ status, className }: MovieStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.NOW_SHOWING
  const Icon = config.icon

  return (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${className} flex items-center gap-1 px-2 py-1 text-xs font-semibold`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}
