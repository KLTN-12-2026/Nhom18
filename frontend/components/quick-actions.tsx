"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MessageCircle, ArrowUp, SendHorizonal, X, Bot, RefreshCw, Star, Clock, MapPin, Ticket, PlayCircle, ArrowRight, ThumbsUp, ThumbsDown } from "lucide-react"
import { cn, formatVND } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { sendChatMessage, sendChatFeedback } from "@/lib/api/chatbot"

// ─── Types ────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant"
  content: string
  cards?: Card[]
  // Gắn với 1 bản ghi chatbot_interactions ở backend (nếu log thành công) —
  // dùng để gửi feedback 👍/👎 đúng lượt trả lời. Tin nhắn chào mừng tĩnh và
  // các tin nhắn khôi phục từ localStorage của phiên cũ sẽ không có field này.
  interactionId?: number | null
  feedback?: "up" | "down" | null
}
type Card = { type: string; [key: string]: any }

// ─── Helpers ──────────────────────────────────
const fmt = formatVND
function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("vi-VN") } catch { return d }
}

/** Render **bold**, - list, line-breaks */
function MsgText({ text }: { text: string }) {
  return (
    <div className="space-y-0.5 text-sm">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="mt-0.5 shrink-0 opacity-60">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineStyle(line.replace(/^[-•]\s/, "")) }} />
            </div>
          )
        }
        if (line.startsWith("## ")) {
          return <p key={i} className="font-semibold mt-1" dangerouslySetInnerHTML={{ __html: inlineStyle(line.slice(3)) }} />
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: inlineStyle(line) }} />
      })}
    </div>
  )
}
// Escape HTML đặc biệt TRƯỚC khi áp markdown-lite — text ở đây tới từ backend
// (câu trả lời AI của Gemini hoặc rule-based fallback), không được sanitize gì
// trước khi tới đây. Không escape trước thì bất kỳ đoạn nào lọt được thẻ HTML
// (vd qua prompt-injection với Gemini) sẽ chạy thẳng thành HTML/JS thật trong
// dangerouslySetInnerHTML bên dưới — escape trước đảm bảo CHỈ 3 pattern
// **bold**/*italic*/_italic_ được phép sinh ra thẻ HTML mới.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
function inlineStyle(t: string) {
  return escapeHtml(t)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Backend cũng dùng _..._ cho in nghiêng (gợi ý Markov, câu mood) — thiếu
    // dòng này thì dấu gạch dưới hiện nguyên văn thay vì được in nghiêng.
    .replace(/_(.*?)_/g, "<em>$1</em>")
}

/** Link "xem tất cả" khi danh sách trong thẻ chat bị cắt bớt để vừa khung chat —
 * nếu không có lối này, người dùng chỉ thấy vài mục đầu rồi hết, không biết
 * đi đâu để xem phần còn lại. */
function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded-lg bg-muted hover:bg-accent transition text-foreground"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

/** Rich result cards */
function Cards({ cards }: { cards: Card[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {cards.map((card, i) => {
        if (card.type === "movie_list") {
          const all = card.movies || []
          return [
            ...all.slice(0, 4).map((m: any) => (
              <Link key={m.id} href={`/movie/${m.id}`} prefetch>
                <div className="flex gap-2 p-2 rounded-lg bg-background/80 hover:bg-background transition cursor-pointer border border-black/5 text-foreground">
                  {m.poster_url && !String(m.poster_url).includes("placeholder") ? (
                    <div className="relative w-8 h-11 rounded overflow-hidden shrink-0">
                      <Image src={m.poster_url} alt={m.title} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-8 h-11 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 text-white text-xs">🎬</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs leading-tight line-clamp-1">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{m.genre}</p>
                    {m.average_rating ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <Star className="h-2.5 w-2.5 fill-current" /> {Number(m.average_rating).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground self-center shrink-0" />
                </div>
              </Link>
            )),
            all.length > 4 ? <ViewAllLink key="view-all" href="/movies" label="🎬 Xem tất cả phim" /> : null,
          ]
        }
        if (card.type === "movie_detail" && card.movie) {
          const m = card.movie
          return (
            <div key={i} className="rounded-lg bg-background/80 border border-black/5 text-foreground overflow-hidden">
              <Link href={`/movie/${m.id}`} prefetch>
                <div className="flex gap-2 p-2 hover:bg-background transition cursor-pointer">
                  {m.poster_url && !String(m.poster_url).includes("placeholder") ? (
                    <div className="relative w-10 h-14 rounded overflow-hidden shrink-0">
                      <Image src={m.poster_url} alt={m.title} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-14 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 text-white text-xs">🎬</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs leading-tight line-clamp-1">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{m.genre} {m.duration ? `• ${m.duration}p` : ""}</p>
                    {m.average_rating ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <Star className="h-2.5 w-2.5 fill-current" /> {Number(m.average_rating).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
              <div className="flex gap-1.5 px-2 pb-2">
                {m.trailer_url && (
                  <a href={m.trailer_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded-md bg-muted hover:bg-accent transition">
                    <PlayCircle className="h-3 w-3" /> Xem trailer
                  </a>
                )}
                <Link href={`/movie/${m.id}`} prefetch
                  className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition">
                  <Ticket className="h-3 w-3" /> Đặt vé ngay
                </Link>
              </div>
              {card.showtimes && card.showtimes.length > 0 && (
                <div className="px-2 pb-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Lịch chiếu gần nhất:</p>
                  {card.showtimes.slice(0, 3).map((s: any) => (
                    <Link key={s.id} href={`/booking/${s.id}`} prefetch
                      className="flex items-center justify-between text-[10px] p-1.5 rounded bg-muted/60 hover:bg-muted transition">
                      <span>{fmtDate(s.show_date)} • {s.show_time?.slice(0, 5)} • {s.cinema}</span>
                      <span className="font-semibold text-amber-600 shrink-0 ml-1">{fmt(s.price)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        }
        if (card.type === "showtime_list") {
          const all = card.showtimes || []
          const shown = all.slice(0, 4)
          // Backend đã giới hạn tối đa 15 suất/lượt trả lời — nếu còn nhiều hơn
          // số hiển thị ở đây, phải có lối dẫn sang trang lịch chiếu đầy đủ,
          // không được để người dùng chỉ thấy 4 suất rồi hết.
          const firstDate = all[0]?.show_date
          return [
            ...shown.map((s: any) => (
              <Link key={s.id} href={`/booking/${s.id}`} prefetch>
                <div className="p-2 rounded-lg bg-background/80 hover:bg-background transition border border-black/5 text-foreground cursor-pointer">
                  {s.title && <p className="font-medium text-xs">{s.title}</p>}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5" />{s.cinema}
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-0.5">
                    <span className="text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />{fmtDate(s.show_date)} {s.show_time?.slice(0, 5)}
                    </span>
                    <span className="font-semibold text-amber-600">{fmt(s.price)}</span>
                  </div>
                  {s.available_seats !== undefined && (
                    <p className="text-[10px] text-green-600">Còn {s.available_seats} ghế</p>
                  )}
                </div>
              </Link>
            )),
            <ViewAllLink key="view-all" href={firstDate ? `/showtimes?date=${firstDate}` : "/showtimes"} label="📅 Xem đầy đủ lịch chiếu" />,
          ]
        }
        // Điểm thật trên IMDb / Rotten Tomatoes / Metacritic (Wikidata) + link
        // tới đúng trang của phim trên từng nguồn để khách tự kiểm chứng
        if (card.type === "web_ratings") {
          return (
            <div key={`web-${i}`} className="p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground">
              <p className="font-semibold leading-tight">🌐 {card.title}</p>
              {card.description && <p className="text-[10px] text-muted-foreground">{card.description}</p>}
              <div className="mt-1.5 space-y-0.5">
                {(card.ratings || []).map((r: any, j: number) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-semibold text-amber-600 shrink-0">{r.score}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(card.sources || []).map((s: any) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                    {s.name} ↗
                  </a>
                ))}
              </div>
            </div>
          )
        }
        if (card.type === "combo_list") {
          return (card.combos || []).slice(0, 4).map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground">
              <div className="min-w-0">
                <p className="font-medium leading-tight">{c.name}</p>
                {c.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{c.description}</p>}
              </div>
              <span className="font-semibold text-amber-600 shrink-0 ml-2">{fmt(c.price)}</span>
            </div>
          ))
        }
        if (card.type === "booking_detail" && card.booking) {
          const b = card.booking
          return (
            <div key={i} className="p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground">
              <p className="font-mono font-medium text-[10px] text-primary">{b.booking_reference}</p>
              <p className="font-medium mt-0.5">{b.movie}</p>
              <div className="text-[10px] text-muted-foreground space-y-0.5 mt-0.5">
                <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{b.cinema}</div>
                <div className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{fmtDate(b.show_date)} {b.show_time?.slice(0,5)}</div>
                {b.seats && <div className="flex items-center gap-1"><Ticket className="h-2.5 w-2.5" />{b.seats}</div>}
              </div>
              <p className="font-semibold text-amber-600 mt-1">{fmt(b.total_amount)}</p>
            </div>
          )
        }
        if (card.type === "booking_list") {
          const all = card.bookings || []
          return [
            ...all.slice(0, 3).map((b: any) => (
              <div key={b.booking_reference} className="p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground">
                <p className="font-mono font-medium text-[10px] text-primary">{b.booking_reference}</p>
                <p className="font-medium">{b.movie}</p>
                <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                  <span>{fmtDate(b.show_date)}</span>
                  <span>{fmt(b.total_amount)}</span>
                </div>
              </div>
            )),
            all.length > 3 ? <ViewAllLink key="view-all" href="/bookings" label="🎫 Xem tất cả vé của tôi" /> : null,
          ]
        }
        if (card.type === "pricing") {
          return (
            <div key={i} className="p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground space-y-1">
              {card.tickets && (
                <p>🎫 Giá vé: <strong>{fmt(card.tickets.min_price)}</strong> – <strong>{fmt(card.tickets.max_price)}</strong></p>
              )}
              {(card.combos || []).map((c: any) => (
                <p key={c.id}>🍿 {c.name}: <strong>{fmt(c.price)}</strong></p>
              ))}
            </div>
          )
        }
        if (card.type === "cinema_list") {
          const all = card.cinemas || []
          return [
            ...all.slice(0, 4).map((c: any) => (
              <div key={c.id} className="p-2 rounded-lg bg-background/80 border border-black/5 text-xs text-foreground">
                <p className="font-medium">{c.name}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <MapPin className="h-2.5 w-2.5" />{c.location}
                </p>
              </div>
            )),
            all.length > 4 ? <ViewAllLink key="view-all" href="/cinemas" label="📍 Xem tất cả rạp" /> : null,
          ]
        }
        return null
      })}
    </div>
  )
}

/** Nút 👍/👎 dưới mỗi câu trả lời — tín hiệu để biết chatbot đang trả lời sai
 * ở đâu (lưu ẩn danh vào chatbot_feedback, gắn với interactionId của lượt
 * chat tương ứng). Chỉ hiện khi lượt chat đó log thành công ở backend. */
function FeedbackButtons({ feedback, onVote }: { feedback?: "up" | "down" | null; onVote: (rating: "up" | "down") => void }) {
  if (feedback) {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground">
        {feedback === "up" ? "Cảm ơn phản hồi của bạn! 🙌" : "Cảm ơn, mình sẽ cố gắng trả lời tốt hơn 🙏"}
      </p>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-1">
      <button
        onClick={() => onVote("up")}
        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition"
        aria-label="Câu trả lời hữu ích"
        title="Câu trả lời hữu ích"
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        onClick={() => onVote("down")}
        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition"
        aria-label="Câu trả lời chưa hữu ích"
        title="Câu trả lời chưa hữu ích"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  )
}

const QUICK_REPLIES = [
  { label: "😊 Hôm nay tôi vui", text: "Hôm nay tôi vui, muốn xem phim gì hay không?" },
  { label: "😔 Tôi đang buồn", text: "Tôi đang buồn, gợi ý phim giúp tôi với" },
  { label: "❤️ Hẹn hò tối nay", text: "Tôi có buổi hẹn hò tối nay, nên xem phim gì?" },
  { label: "👨‍👩‍👧 Xem cùng gia đình", text: "Muốn xem phim cùng cả gia đình có trẻ em" },
  { label: "🔥 Phim hot", text: "Phim nào đang hot nhất?" },
  { label: "📅 Lịch hôm nay", text: "Lịch chiếu phim hôm nay" },
  { label: "🎯 Gợi ý riêng cho tôi", text: "Dựa vào những phim tôi từng xem, gợi ý cho tôi phim phù hợp" },
]

const GREETING = "Xin chào! Mình là **Cine** 🎬 — người bạn điện ảnh của bạn.\n\nHôm nay bạn đang cảm thấy thế nào? Mình có thể gợi ý phim theo tâm trạng, tìm lịch chiếu, kiểm tra giá vé hoặc tra cứu đơn đặt vé cho bạn. Hỏi mình bất cứ điều gì nhé! 😊"
const MAX_STORED = 40

function historyKey(userId?: number | null) {
  return `cinebot_qa_history_${userId ?? "guest"}`
}
function loadHistory(userId?: number | null): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(historyKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch { return null }
}
function saveHistory(userId: number | null | undefined, msgs: ChatMessage[]) {
  try { localStorage.setItem(historyKey(userId), JSON.stringify(msgs.slice(-MAX_STORED))) } catch {}
}

// ─── Main Component ────────────────────────────
export function QuickActions() {
  const { user } = useAuth()
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showChatbot, setShowChatbot] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const prevUserIdRef = useRef<number | null | undefined>(undefined)

  // Khôi phục lịch sử chat riêng theo user khi đăng nhập/đăng xuất/tải lại trang
  useEffect(() => {
    if (prevUserIdRef.current === user?.id) return
    prevUserIdRef.current = user?.id
    const history = loadHistory(user?.id)
    setMessages(history || [{ role: "assistant", content: GREETING }])
  }, [user?.id])

  // Lưu lịch sử mỗi khi có tin nhắn mới (bỏ qua nếu chỉ có lời chào)
  useEffect(() => {
    if (messages.length <= 1) return
    saveHistory(user?.id, messages)
  }, [messages, user?.id])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const resetChat = useCallback(() => {
    setMessages([{
      role: "assistant",
      content: "Bắt đầu lại nào! 🎬 Hôm nay bạn muốn xem phim gì? Kể cho mình nghe tâm trạng của bạn, mình sẽ gợi ý ngay!",
    }])
    try { localStorage.removeItem(historyKey(user?.id)) } catch {}
  }, [user?.id])

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput("")

    const newUserMsg: ChatMessage = { role: "user", content }
    setMessages((m) => [...m, newUserMsg])
    setLoading(true)

    try {
      // Gửi history (bỏ (các) tin nhắn chào mừng ở đầu) — backend/Gemini yêu
      // cầu history bắt đầu bằng role "user". Trước đây chỉ cắt bỏ đúng vị
      // trí index 0 (giả định luôn là lời chào), nhưng saveHistory() cắt còn
      // tối đa MAX_STORED tin nhắn gần nhất trước khi lưu localStorage — sau
      // 1 hội thoại dài, index 0 khi khôi phục lại có thể là 1 câu trả lời
      // thật giữa chừng chứ không phải lời chào, và bị xoá oan mất khỏi ngữ
      // cảnh gửi cho AI. Cắt tới tin nhắn "user" ĐẦU TIÊN thay vì dựa vào vị
      // trí cố định — luôn đúng bất kể có bao nhiêu tin nhắn assistant dẫn đầu.
      const firstUserIdx = messages.findIndex((m) => m.role === "user")
      const history = (firstUserIdx === -1 ? [] : messages.slice(firstUserIdx))
        .map((m) => ({ role: m.role, content: m.content }))

      const data = await sendChatMessage(content, history)
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply || "Xin lỗi, tôi không thể trả lời.",
          cards: data.cards,
          interactionId: data.interactionId ?? null,
        },
      ])
    } catch (e) {
      console.error("Chatbot error:", e)
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "😔 Đã xảy ra lỗi. Vui lòng thử lại sau." },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, user?.id])

  // Cập nhật UI ngay (optimistic) trước khi gọi API — feedback chỉ là tín
  // hiệu phụ để cải thiện chatbot dần dần, không cần chờ xác nhận từ server
  // mới coi là "đã vote" trên giao diện.
  const handleFeedback = useCallback((index: number, rating: "up" | "down") => {
    setMessages((m) => m.map((msg, i) => (i === index ? { ...msg, feedback: rating } : msg)))
    const interactionId = messages[index]?.interactionId
    if (interactionId) {
      sendChatFeedback(interactionId, rating).catch((e) => console.error("Gửi feedback lỗi:", e))
    }
  }, [messages])

  return (
    <>
      {/* Nút nổi */}
      <div className="fixed bottom-20 md:bottom-6 right-6 z-[100] flex flex-col gap-3">
        <Button
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-2xl transition-all duration-300",
            "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400",
            "hover:scale-110 active:scale-95 border-2 border-white/20",
            !showChatbot && "animate-pulse hover:animate-none",
          )}
          onClick={() => setShowChatbot((v) => !v)}
          aria-label="Chat với AI"
        >
          {showChatbot ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
        </Button>

        {showScrollTop && (
          <Button
            size="icon"
            variant="outline"
            className="h-12 w-12 rounded-full shadow-lg bg-background border-2 hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-bottom-2"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Lên đầu trang"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Cửa sổ chat */}
      {showChatbot && (
        <div className="fixed z-[99] bottom-36 md:bottom-24 right-6 w-[340px] max-h-[72vh] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 shrink-0">
            <div className="flex items-center gap-2 text-white">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">Cine</p>
                <p className="text-[10px] text-white/70 mt-0.5">Người bạn điện ảnh của bạn ✨</p>
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="text-white hover:bg-white/20 h-7 w-7"
              onClick={resetChat} title="Cuộc trò chuyện mới"
              aria-label="Bắt đầu cuộc trò chuyện mới"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-white" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  m.role === "user"
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm",
                )}>
                  <MsgText text={m.content} />
                  {m.cards && m.cards.length > 0 && <Cards cards={m.cards} />}
                  {m.role === "assistant" && m.interactionId != null && (
                    <FeedbackButtons feedback={m.feedback} onVote={(rating) => handleFeedback(i, rating)} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-white" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2.5 flex gap-1 items-center">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                      style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Quick replies — chỉ hiện khi vừa mở */}
          {messages.length <= 2 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap shrink-0 border-t pt-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q.text} onClick={() => sendMessage(q.text)} disabled={loading}
                  className="text-[10px] px-2 py-1 rounded-full bg-muted hover:bg-accent transition disabled:opacity-50 border border-border"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t flex items-center gap-2 shrink-0">
            <Input
              placeholder="Bạn đang cảm thấy thế nào hôm nay?..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              disabled={loading}
              className="text-sm h-9"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="icon" className="h-9 w-9 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"
              aria-label="Gửi tin nhắn"
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
