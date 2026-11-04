"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Minus, Plus } from "lucide-react"
import Image from "next/image"
import { formatVND } from "@/lib/utils"
import { getCombos, type Combo } from "@/lib/api/combos"

interface ComboItem {
  combo_id: number
  quantity: number
  price: number
  name: string
}

interface ComboSelectorProps {
  onComboChange: (items: ComboItem[]) => void
  /** Rạp của suất chiếu — kho bắp nước tính riêng từng chi nhánh, nên chỉ hiện
   *  món rạp đó còn hàng thay vì cả danh mục chuỗi. */
  cinemaId?: number | string
}

// Màu gradient + emoji cho từng loại — dùng khi không có ảnh thực
const CATEGORY_STYLE: Record<string, { gradient: string; emoji: string; label: string }> = {
  combo:   { gradient: "from-amber-400 to-orange-500",  emoji: "🍿🥤", label: "Combo" },
  popcorn: { gradient: "from-yellow-300 to-amber-400",  emoji: "🍿",   label: "Bắp rang" },
  drink:   { gradient: "from-sky-400 to-blue-500",      emoji: "🥤",   label: "Nước uống" },
  snack:   { gradient: "from-rose-400 to-pink-500",     emoji: "🍬",   label: "Snack" },
}

// Ảnh thực từ internet (Unsplash / CDN miễn phí) — ánh xạ theo category
// Ảnh dự phòng khi món chưa có ảnh riêng. DÙNG ẢNH TRONG DỰ ÁN, không gọi ra
// Unsplash: bản cũ trỏ ra ngoài nên mất mạng là vỡ hết, và tệ hơn — ảnh dự
// phòng cho "popcorn" lại chính là tấm ảnh KẸO Snickers/Mars đã bị loại khỏi
// bảng combos ngày 15/09 vì sai sản phẩm.
const FALLBACK_IMAGES: Record<string, string> = {
  combo:   "/combos/bap-hop.jpg",
  popcorn: "/combos/bap-rang.jpg",
  drink:   "/combos/coca.jpg",
  snack:   "/combos/snack.jpg",
}

export default function ComboSelector({ onComboChange, cinemaId }: ComboSelectorProps) {
  const [combos, setCombos]             = useState<Combo[]>([])
  const [selected, setSelected]         = useState<Map<number, number>>(new Map())
  const [loading, setLoading]           = useState(true)
  const [activeCategory, setActive]     = useState<string>("all")

  useEffect(() => { fetchCombos() }, [cinemaId])

  useEffect(() => {
    const items: ComboItem[] = []
    selected.forEach((qty, id) => {
      const c = combos.find(x => x.id === id)
      if (c && qty > 0) items.push({ combo_id: id, quantity: qty, price: c.price, name: c.name })
    })
    onComboChange(items)
  }, [selected, combos, onComboChange])

  const fetchCombos = async () => {
    try {
      setCombos(await getCombos(cinemaId))
    } catch {
      setCombos([])
    } finally {
      setLoading(false)
    }
  }

  const setQty = (id: number, delta: number) => {
    setSelected(prev => {
      const m = new Map(prev)
      const cur = m.get(id) || 0
      // Trần = 10 suất/đơn, NHƯNG không vượt số hàng rạp còn (ton_kho do API
      // theo rạp trả về). Không chặn ở đây thì khách chọn 10 rồi mới bị từ
      // chối lúc thanh toán vì rạp chỉ còn 3 phần.
      const mon = combos.find(x => x.id === id)
      const conLai = typeof mon?.ton_kho === "number" ? mon.ton_kho : 10
      const n   = Math.max(0, Math.min(10, conLai, cur + delta))
      if (n === 0) m.delete(id)
      else m.set(id, n)
      return m
    })
  }

  const categories = ["all", ...Array.from(new Set(combos.map(c => c.category)))]
  const visible = activeCategory === "all" ? combos : combos.filter(c => c.category === activeCategory)
  const totalItems = Array.from(selected.values()).reduce((a, b) => a + b, 0)
  const totalPrice = Array.from(selected.entries()).reduce((s, [id, qty]) => {
    const c = combos.find(x => x.id === id)
    return s + (c ? c.price * qty : 0)
  }, 0)

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="rounded-xl overflow-hidden border animate-pulse">
            <div className="aspect-video bg-muted" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">🍿 Chọn đồ ăn & nước uống</h3>
        {totalItems > 0 && (
          <Badge className="bg-primary text-primary-foreground px-3 py-1 text-sm">
            {totalItems} món · {formatVND(totalPrice)}
          </Badge>
        )}
      </div>

      {/* Category tabs */}
      {categories.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat === "all" ? "Tất cả" : CATEGORY_STYLE[cat]?.label || cat}
            </button>
          ))}
        </div>
      )}

      {/* Combo grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map(combo => {
          const qty   = selected.get(combo.id) || 0
          const style = CATEGORY_STYLE[combo.category] || CATEGORY_STYLE.snack
          const imgSrc = combo.image_url && !combo.image_url.startsWith("/images")
            ? combo.image_url
            : FALLBACK_IMAGES[combo.category] || FALLBACK_IMAGES.snack

          return (
            <div
              key={combo.id}
              className={`relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                qty > 0
                  ? "border-primary shadow-md shadow-primary/20"
                  : "border-transparent hover:border-border"
              } ${!combo.is_available ? "opacity-40 pointer-events-none" : ""}`}
            >
              {/* Hình ảnh */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={imgSrc}
                  alt={combo.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  unoptimized
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Tên + giá đè lên ảnh */}
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{combo.name}</p>
                  <p className="text-amber-300 text-xs font-bold mt-0.5">
                    {formatVND(combo.price)}
                  </p>
                </div>

                {/* Badge số lượng */}
                {qty > 0 && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow">
                    {qty}
                  </div>
                )}

                {/* Badge category */}
                <div className={`absolute top-2 left-2 bg-gradient-to-r ${style.gradient} text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full`}>
                  {style.emoji}
                </div>
              </div>

              {/* Mô tả + controls */}
              <div className="p-2 bg-card">
                {combo.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">{combo.description}</p>
                )}
                <div className="flex items-center justify-between gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full shrink-0"
                    onClick={() => setQty(combo.id, -1)}
                    disabled={qty === 0}
                    aria-label={`Giảm số lượng ${combo.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-semibold w-8 text-center tabular-nums">{qty}</span>
                  <Button
                    size="icon"
                    className="h-7 w-7 rounded-full shrink-0"
                    onClick={() => setQty(combo.id, 1)}
                    disabled={qty >= Math.min(10, typeof combo.ton_kho === "number" ? combo.ton_kho : 10)}
                    aria-label={`Tăng số lượng ${combo.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-muted-foreground py-6 text-sm">Không có combo nào</p>
      )}
    </div>
  )
}
