"use client"

export const dynamic = "force-dynamic"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  MessageSquareText, Trash2, Search, Star, ThumbsUp, RefreshCw, Smile, Meh, Frown,
  CheckCircle2, XCircle, ShieldAlert, Bot,
} from "lucide-react"
import {
  listReviewsAdmin, deleteReviewAdmin, approveReviewAdmin, rejectReviewAdmin, type AdminReview,
} from "@/lib/api/admin/reviews"
import { useRequireAdmin } from "@/hooks/use-require-admin"

const SENTIMENT_META: Record<string, { label: string; icon: typeof Smile; className: string }> = {
  positive: { label: "Tích cực", icon: Smile, className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  neutral: { label: "Trung lập", icon: Meh, className: "bg-muted text-muted-foreground" },
  negative: { label: "Tiêu cực", icon: Frown, className: "bg-red-500/15 text-red-600 dark:text-red-400" },
}

const MODERATION_META: Record<string, { label: string; className: string }> = {
  approved: { label: "Đã duyệt", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  flagged: { label: "Chờ duyệt", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  rejected: { label: "Đã từ chối", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
}

export default function AdminReviews() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sentimentFilter, setSentimentFilter] = useState("all")
  const [statusTab, setStatusTab] = useState<"flagged" | "approved" | "rejected" | "all">("flagged")
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminReview | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [actingId, setActingId] = useState<number | null>(null)
  // Tổng số đánh giá chờ duyệt trên toàn hệ thống, lấy từ server — KHÔNG đếm
  // từ mảng `reviews` vì mảng đó đã bị lọc theo tab đang mở (xem chú thích dưới).
  const [flaggedTotal, setFlaggedTotal] = useState(0)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listReviewsAdmin({
        sentiment: sentimentFilter === "all" ? undefined : (sentimentFilter as any),
        moderationStatus: statusTab === "all" ? undefined : statusTab,
        limit: 200,
      })
      setReviews(data.reviews)
      setFlaggedTotal(data.flaggedTotal)
    } catch (err) {
      console.error("Tải danh sách đánh giá cần kiểm duyệt thất bại:", err)
      showAlert("error", "Không thể tải danh sách đánh giá")
    } finally {
      setLoading(false)
    }
  }, [sentimentFilter, statusTab])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  const handleApprove = async (r: AdminReview) => {
    setActingId(r.id)
    try {
      await approveReviewAdmin(r.id)
      showAlert("success", `Đã duyệt đánh giá của ${r.username} — người viết được thưởng điểm`)
      setReviews((prev) => statusTab === "flagged" ? prev.filter((x) => x.id !== r.id) : prev.map((x) => x.id === r.id ? { ...x, moderation_status: "approved" } : x))
      // Giảm badge ngay cho phản hồi tức thì (không phải chờ tải lại danh sách)
      if (r.moderation_status === "flagged") setFlaggedTotal((n) => Math.max(0, n - 1))
    } catch (e: any) {
      showAlert("error", e.message || "Không thể duyệt đánh giá")
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setActingId(rejectTarget.id)
    try {
      await rejectReviewAdmin(rejectTarget.id, rejectReason.trim() || undefined)
      showAlert("success", `Đã từ chối đánh giá của ${rejectTarget.username}`)
      setReviews((prev) => statusTab === "flagged" ? prev.filter((x) => x.id !== rejectTarget.id) : prev.map((x) => x.id === rejectTarget.id ? { ...x, moderation_status: "rejected" } : x))
      if (rejectTarget.moderation_status === "flagged") setFlaggedTotal((n) => Math.max(0, n - 1))
      setRejectTarget(null)
      setRejectReason("")
    } catch (e: any) {
      showAlert("error", e.message || "Không thể từ chối đánh giá")
    } finally {
      setActingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteReviewAdmin(deleteTarget.id)
      showAlert("success", `Đã xoá đánh giá của ${deleteTarget.username}`)
      setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: any) {
      showAlert("error", e.message || "Không thể xoá đánh giá")
      setDeleteTarget(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return reviews
    return reviews.filter((r) =>
      r.movie_title.toLowerCase().includes(q) ||
      r.username.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.review_text.toLowerCase().includes(q)
    )
  }, [reviews, search])

  // Dùng số từ server (đếm trên toàn bộ bảng). Trước đây đếm từ `reviews` —
  // mảng đã bị lọc theo tab đang mở — nên badge luôn về 0 khi admin đứng ở tab
  // "Đã duyệt"/"Đã từ chối", dù thực tế vẫn còn đánh giá chờ xử lý.

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }
  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!allowed) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <MessageSquareText className="h-8 w-8 text-primary" /> Kiểm duyệt đánh giá phim
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Tự động duyệt phần lớn đánh giá — chỉ giữ lại đây những đánh giá có dấu hiệu vi phạm để duyệt tay
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchReviews}>
              <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
            </Button>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as any)} className="mb-4">
            <TabsList>
              <TabsTrigger value="flagged" className="gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Chờ duyệt
                {flaggedTotal > 0 && <Badge className="ml-1 bg-amber-500 h-5 px-1.5">{flaggedTotal}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Đã duyệt</TabsTrigger>
              <TabsTrigger value="rejected" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> Đã từ chối</TabsTrigger>
              <TabsTrigger value="all">Tất cả</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo phim, người dùng hoặc nội dung..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi cảm xúc</SelectItem>
                <SelectItem value="negative">😞 Tiêu cực</SelectItem>
                <SelectItem value="neutral">😐 Trung lập</SelectItem>
                <SelectItem value="positive">😊 Tích cực</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Danh sách đánh giá ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phim</TableHead>
                      <TableHead>Người đánh giá</TableHead>
                      <TableHead className="text-center">Sao</TableHead>
                      <TableHead className="min-w-[260px]">Nội dung</TableHead>
                      <TableHead>Cảm xúc</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Không có đánh giá nào</TableCell></TableRow>
                    ) : filtered.map((r) => {
                      const sentiment = r.sentiment_label ? SENTIMENT_META[r.sentiment_label] : null
                      const modMeta = MODERATION_META[r.moderation_status]
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium max-w-[140px] truncate">{r.movie_title}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{r.username}</div>
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.rating != null ? (
                              <span className="inline-flex items-center gap-1 text-sm">
                                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> {r.rating}
                              </span>
                            ) : <span className="text-muted-foreground text-sm">—</span>}
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            <p className="text-sm line-clamp-2">{r.review_text}</p>
                          </TableCell>
                          <TableCell>
                            {sentiment ? (
                              <Badge className={`gap-1 font-normal ${sentiment.className}`} variant="outline">
                                <sentiment.icon className="h-3.5 w-3.5" /> {sentiment.label}
                              </Badge>
                            ) : <span className="text-muted-foreground text-sm">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge className={`font-normal ${modMeta.className}`} variant="outline">{modMeta.label}</Badge>
                            {r.moderation_status === "rejected" && r.moderation_reason && (
                              <p className="text-[10px] text-muted-foreground mt-1 max-w-[140px]">{r.moderation_reason}</p>
                            )}
                            {r.moderation_status === "flagged" && r.moderation_reason && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 max-w-[140px]">⚠️ {r.moderation_reason}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleDateString("vi-VN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.moderation_status === "flagged" && (
                                <>
                                  <Button
                                    variant="ghost" size="sm" className="text-green-600 hover:text-green-700"
                                    disabled={actingId === r.id}
                                    onClick={() => handleApprove(r)}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700"
                                    disabled={actingId === r.id}
                                    onClick={() => setRejectTarget(r)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(r)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Từ chối kèm lý do */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối đánh giá</DialogTitle>
            <DialogDescription>
              Đánh giá của <strong>{rejectTarget?.username}</strong> sẽ bị ẩn khỏi công khai. Người viết sẽ nhận được thông báo kèm lý do này.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Lý do từ chối (vd: chứa từ ngữ không phù hợp) — để trống dùng lý do mặc định"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason("") }}>Hủy</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actingId === rejectTarget?.id}>
              {actingId === rejectTarget?.id ? "Đang xử lý..." : "Từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xoá vĩnh viễn */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá đánh giá</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá vĩnh viễn đánh giá của <strong>{deleteTarget?.username}</strong> cho phim{" "}
              <strong>"{deleteTarget?.movie_title}"</strong>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
