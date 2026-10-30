"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Search, RefreshCw, Star, Clock } from "lucide-react"
import { getMovies } from "@/lib/api/movies"
import { clearCache as clearClientCache } from "@/lib/fetch-cache"
import { createMovie, updateMovie, deleteMovie } from "@/lib/api/admin/movies"
import { useCinemaScope } from "@/hooks/use-cinema-scope"
import type { Movie } from "@/lib/api/types"

const truncate = (text: string, max = 90) =>
  !text ? "" : text.length > max ? `${text.slice(0, max).trimEnd()}...` : text

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  NOW_SHOWING: { label: "Đang chiếu", className: "bg-green-500 text-white" },
  COMING_SOON: { label: "Sắp chiếu", className: "bg-amber-500 text-white" },
  UPCOMING: { label: "Sắp chiếu", className: "bg-amber-500 text-white" },
  ENDED: { label: "Đã kết thúc", className: "bg-gray-500 text-white" },
}

const EMPTY_FORM = {
  title: "", genre: "", rating: "", duration: 0,
  description: "", release_date: "", original_year: "" as number | string, poster_url: "",
  trailer_url: "", status: "NOW_SHOWING",
}

type MovieForm = typeof EMPTY_FORM

export function AdminMoviesTable() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [formOpen, setFormOpen] = useState(false)
  // Phim là danh mục dùng chung cả chuỗi nên backend chỉ cho admin ghi
  // (POST/PUT/DELETE /api/movies). Quản lý chi nhánh vẫn cần XEM danh sách để
  // xếp suất chiếu, nên giữ bảng và chỉ bỏ các nút ghi — hiện nút rồi báo lỗi
  // 403 khi bấm thì tệ hơn là không hiện.
  const { canSeeAllCinemas: canEditCatalog } = useCinemaScope()
  const [editing, setEditing] = useState<Movie | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null)
  const [form, setForm] = useState<MovieForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchMovies = useCallback(async (opts: { fresh?: boolean } = {}) => {
    setLoading(true)
    try {
      // getMovies() dùng cache phía trình duyệt 3 phút (ttl: 180). Sau khi vừa
      // thêm/sửa/xoá phim mà tải lại từ cache thì bảng vẫn hiện dữ liệu CŨ,
      // trông như thao tác không có tác dụng. Xoá cache trước khi tải lại.
      if (opts.fresh) clearClientCache("/api/movies")
      setMovies(await getMovies())
    } catch (err) {
      console.error("Tải danh sách phim thất bại:", err)
      showAlert("error", "Không thể tải danh sách phim")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMovies() }, [fetchMovies])

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }
  const openEdit = (m: Movie) => {
    setEditing(m)
    setForm({
      title: m.title || "",
      genre: m.genre || "",
      rating: m.rating || "",
      duration: m.duration || 0,
      description: m.description || "",
      release_date: m.release_date ? m.release_date.slice(0, 10) : "",
      original_year: m.original_year ?? "",
      poster_url: m.poster_url || "",
      trailer_url: (m as any).trailer_url || "",
      status: m.status || "NOW_SHOWING",
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { showAlert("error", "Vui lòng nhập tên phim"); return }
    setSaving(true)
    try {
      const input = { ...form, duration: Number(form.duration) }
      if (editing) await updateMovie(editing.id, input)
      else await createMovie(input)
      showAlert("success", editing ? `Đã cập nhật "${form.title}"` : `Đã thêm phim "${form.title}"`)
      setFormOpen(false)
      fetchMovies({ fresh: true })
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu")
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMovie(deleteTarget.id)
      showAlert("success", `Đã xoá phim "${deleteTarget.title}"`)
      setDeleteTarget(null)
      fetchMovies({ fresh: true })
    } catch (err) {
      console.error("Xoá phim thất bại:", err)
      showAlert("error", "Không thể xoá phim")
      setDeleteTarget(null)
    }
  }

  const filtered = movies.filter((m) => {
    const matchSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.genre.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || (m.status || "NOW_SHOWING") === statusFilter
    return matchSearch && matchStatus
  })

  const formatDuration = (min: number) => `${Math.floor(min / 60)}h ${min % 60}m`
  const formatDate = (d: string) => { try { return new Date(d).toLocaleDateString("vi-VN") } catch { return d } }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Danh sách phim</h2>
          <p className="text-sm text-muted-foreground">Quản lý toàn bộ phim trong hệ thống</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchMovies({ fresh: true })}><RefreshCw className="h-4 w-4 mr-1" /> Làm mới</Button>
          {canEditCatalog && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Thêm phim</Button>}
        </div>
      </div>

      {alert && (
        <Alert className={`${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
          <AlertDescription>{alert.text}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm phim, thể loại..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="NOW_SHOWING">Đang chiếu</SelectItem>
            <SelectItem value="COMING_SOON">Sắp chiếu</SelectItem>
            <SelectItem value="ENDED">Đã kết thúc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phim</TableHead>
                <TableHead>Thể loại</TableHead>
                <TableHead>Độ tuổi</TableHead>
                <TableHead>Thời lượng</TableHead>
                <TableHead>Đánh giá</TableHead>
                <TableHead>Khởi chiếu</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Không tìm thấy phim nào</TableCell></TableRow>
              ) : filtered.map((movie) => {
                const statusInfo = STATUS_LABELS[movie.status || "NOW_SHOWING"] || STATUS_LABELS.NOW_SHOWING
                return (
                  <TableRow key={movie.id}>
                    <TableCell className="w-[250px] max-w-[250px]">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-14 rounded overflow-hidden shrink-0 bg-muted">
                          <Image src={movie.poster_url || "/placeholder.svg"} alt={movie.title} fill className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{movie.title}</p>
                          {/* `truncate` (CSS) là bắt buộc chứ không thừa: hàm
                              truncate() bên dưới chỉ cắt theo SỐ KÝ TỰ (70), mà
                              70 ký tự vẫn rộng hơn ô 250px rất nhiều. Không có
                              lớp CSS cắt theo BỀ RỘNG thì đoạn mô tả tràn khỏi ô
                              và đè lên cột "Thể loại" bên cạnh. */}
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5 truncate" title={movie.description}>
                            {truncate(movie.description, 70)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{movie.genre}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{movie.rating}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(movie.duration)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(movie as any).average_rating ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span>{Number((movie as any).average_rating).toFixed(1)}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(movie.release_date)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${statusInfo.className} text-xs`}>{statusInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEditCatalog && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(movie)}><Edit className="h-4 w-4" /></Button>
                        )}
                        {canEditCatalog && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(movie)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
                        {!canEditCatalog && (
                          <span className="text-xs text-muted-foreground">Chỉ xem</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa phim" : "Thêm phim mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật thông tin phim #${editing.id}` : "Điền đầy đủ thông tin để thêm phim"}</DialogDescription>
          </DialogHeader>
          <MovieForm form={form} setForm={setForm} onSave={handleSave} onCancel={() => setFormOpen(false)} saving={saving} isEdit={!!editing} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá phim</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá phim <strong>"{deleteTarget?.title}"</strong>? Hành động này không thể hoàn tác và sẽ xoá tất cả suất chiếu liên quan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Xoá phim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MovieForm({ form, setForm, onSave, onCancel, saving, isEdit }: {
  form: MovieForm
  setForm: React.Dispatch<React.SetStateAction<MovieForm>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isEdit: boolean
}) {
  const set = (key: keyof MovieForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Tên phim *</Label>
          <Input placeholder="Nhập tên phim" value={form.title} onChange={set("title")} />
        </div>
        <div className="space-y-2">
          <Label>Thể loại</Label>
          <Input placeholder="VD: Hành động, Tình cảm" value={form.genre} onChange={set("genre")} />
        </div>
        <div className="space-y-2">
          <Label>Độ tuổi</Label>
          <Input placeholder="VD: T18, P" value={form.rating} onChange={set("rating")} />
        </div>
        <div className="space-y-2">
          <Label>Thời lượng (phút)</Label>
          <Input type="number" min={1} value={form.duration} onChange={set("duration")} />
        </div>
        <div className="space-y-2">
          <Label>Ngày khởi chiếu tại rạp</Label>
          <Input type="date" value={form.release_date} onChange={set("release_date")} />
        </div>
        <div className="space-y-2">
          <Label>Năm phát hành gốc</Label>
          {/* Tách khỏi ngày khởi chiếu: phim tái chiếu (vd John Wick 2014 chiếu
              lại năm 2026) phải hiện đúng năm gốc. Để trống = lấy năm khởi chiếu. */}
          <Input type="number" min={1888} max={2100} placeholder="VD: 2014" value={form.original_year} onChange={set("original_year")} />
        </div>
        <div className="space-y-2">
          <Label>Trạng thái</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NOW_SHOWING">Đang chiếu</SelectItem>
              <SelectItem value="COMING_SOON">Sắp chiếu</SelectItem>
              <SelectItem value="ENDED">Đã kết thúc</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>URL Poster</Label>
          <Input placeholder="https://..." value={form.poster_url} onChange={set("poster_url")} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>URL Trailer</Label>
          <Input placeholder="https://youtube.com/..." value={form.trailer_url} onChange={set("trailer_url")} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Mô tả</Label>
          <Textarea placeholder="Nội dung phim..." value={form.description} onChange={set("description")} rows={4} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Hủy</Button>
        <Button onClick={onSave} disabled={saving}>{saving ? "Đang lưu..." : isEdit ? "Cập nhật" : "Thêm phim"}</Button>
      </div>
    </div>
  )
}
