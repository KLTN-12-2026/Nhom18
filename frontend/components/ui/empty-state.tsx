import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { 
  SearchX, 
  Ticket, 
  Film, 
  Calendar, 
  Heart,
  AlertCircle,
  Inbox,
  type LucideIcon 
} from "lucide-react"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      className
    )}>
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      
      {description && (
        <p className="text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}

      {(actionLabel && (actionHref || onAction)) && (
        <>
          {actionHref ? (
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button onClick={onAction}>{actionLabel}</Button>
          )}
        </>
      )}
    </div>
  )
}

// Preset Empty States

export function NoSearchResults({ searchQuery }: { searchQuery?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Không tìm thấy kết quả"
      description={
        searchQuery
          ? `Không tìm thấy kết quả nào cho "${searchQuery}". Vui lòng thử từ khóa khác.`
          : "Không tìm thấy kết quả nào. Vui lòng thử lại."
      }
      actionLabel="Xóa bộ lọc"
      onAction={() => window.location.reload()}
    />
  )
}

export function NoBookings() {
  return (
    <EmptyState
      icon={Ticket}
      title="Chưa có vé nào"
      description="Bạn chưa đặt vé xem phim nào. Hãy khám phá những bộ phim đang chiếu và đặt vé ngay!"
      actionLabel="Xem phim đang chiếu"
      actionHref="/movies"
    />
  )
}

export function NoMovies() {
  return (
    <EmptyState
      icon={Film}
      title="Chưa có phim nào"
      description="Hiện tại chưa có phim nào đang chiếu. Vui lòng quay lại sau."
    />
  )
}

export function NoShowtimes() {
  return (
    <EmptyState
      icon={Calendar}
      title="Không có suất chiếu"
      description="Không có suất chiếu nào phù hợp với bộ lọc của bạn. Vui lòng chọn ngày hoặc rạp khác."
      actionLabel="Xem tất cả phim"
      actionHref="/movies"
    />
  )
}

export function NoFavorites() {
  return (
    <EmptyState
      icon={Heart}
      title="Chưa có phim yêu thích"
      description="Bạn chưa thêm phim nào vào danh sách yêu thích. Nhấn vào icon trái tim trên phim để lưu lại!"
      actionLabel="Khám phá phim"
      actionHref="/movies"
    />
  )
}

export function ErrorState({ 
  message = "Đã xảy ra lỗi khi tải dữ liệu",
  onRetry 
}: { 
  message?: string
  onRetry?: () => void 
}) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Oops! Có lỗi xảy ra"
      description={message}
      actionLabel="Thử lại"
      onAction={onRetry}
    />
  )
}
