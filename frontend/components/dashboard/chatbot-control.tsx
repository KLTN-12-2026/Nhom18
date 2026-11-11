"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bot, Sparkles, ListChecks, AlertTriangle, ExternalLink, KeyRound, CheckCircle2, Loader2 } from "lucide-react"
import {
  getChatbotConfig,
  updateChatbotConfig,
  type ChatbotMode,
  type ChatbotRuntimeConfig,
} from "@/lib/api/admin/chatbot"

const KEY_PAGE_URL = "https://aistudio.google.com/apikey"

/**
 * Thẻ điều khiển trợ lý ảo trên Bảng quản trị: chọn Gemini hay luật cứng, xem
 * còn bao nhiêu câu hỏi AI trong ngày, và dán khoá Gemini mới khi khoá cũ hết
 * hạn mức (trước đây phải sửa backend/.env rồi khởi động lại server).
 */
export function ChatbotControl() {
  const [cfg, setCfg] = useState<ChatbotRuntimeConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<"mode" | "key" | "limit" | "model" | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setCfg(await getChatbotConfig())
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "Không tải được cấu hình chatbot" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const save = async (patch: { mode?: ChatbotMode; apiKey?: string; dailyLimit?: number; model?: string }, what: "mode" | "key" | "limit" | "model") => {
    setSaving(what)
    setMsg(null)
    try {
      const next = await updateChatbotConfig(patch)
      setCfg(next)
      if (what === "key") setKeyInput("")
      setMsg({
        ok: true,
        text:
          what === "model"
            ? `Đã chuyển sang ${next.model} — model này còn ${Math.max(0, next.dailyLimit - next.usedToday)} lượt hôm nay.`
            : what === "limit"
            ? `Đã đặt giới hạn ${next.dailyLimit} câu hỏi AI mỗi ngày.`
            : what === "key"
            ? patch.apiKey
              ? "Đã lưu khoá Gemini mới — chatbot dùng ngay, không cần khởi động lại server."
              : "Đã xoá khoá lưu trong hệ thống, quay lại dùng khoá trong file .env."
            : `Đã chuyển sang ${next.mode === "gemini" ? "Gemini AI" : "luật cứng"}.`,
      })
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "Không lưu được" })
    } finally {
      setSaving(null)
    }
  }

  if (loading && !cfg) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cấu hình trợ lý ảo…
        </CardContent>
      </Card>
    )
  }
  if (!cfg) return null

  const isGemini = cfg.mode === "gemini"
  const used = Math.min(cfg.usedToday, cfg.dailyLimit)
  const pct = cfg.dailyLimit > 0 ? Math.round((used / cfg.dailyLimit) * 100) : 0
  const hetLuot = cfg.remaining <= 0
  const dangTamNgung = cfg.quotaCooldownSeconds > 0
  // Cảnh báo khi Gemini không dùng được: hết lượt trong ngày, đang bị tạm ngưng
  // vì Google báo hết hạn mức, hoặc chưa có khoá nào.
  const canhBao = isGemini && (hetLuot || dangTamNgung || !cfg.hasKey)
  const barColor = hetLuot ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary"

  const MODES: { mode: ChatbotMode; icon: typeof Sparkles; title: string; desc: string }[] = [
    {
      mode: "gemini",
      icon: Sparkles,
      title: "Gemini AI",
      desc: "Trả lời tự nhiên, tự tra cứu dữ liệu thật. Khi Google từ chối vì hết hạn mức, hệ thống tự chuyển sang luật cứng.",
    },
    {
      mode: "rules",
      icon: ListChecks,
      title: "Luật cứng (Rules)",
      desc: "Câu trả lời soạn sẵn theo từ khoá. Không gọi Gemini, không tốn lượt, luôn ổn định.",
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" />
              Trợ lý ảo (Chatbot)
            </CardTitle>
            <CardDescription>
              Chọn nguồn trả lời cho khung chat của khách. Gemini trả lời tự nhiên hơn nhưng có giới hạn
              lượt mỗi ngày; luật cứng thì không giới hạn.
            </CardDescription>
          </div>
          <Badge variant={isGemini ? "default" : "secondary"}>
            Đang dùng: {isGemini ? "Gemini AI" : "Luật cứng"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Chọn chế độ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODES.map(({ mode, icon: Icon, title, desc }) => {
            const active = cfg.mode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => !active && save({ mode }, "mode")}
                disabled={saving === "mode"}
                className={`text-left p-3 rounded-xl border-2 transition-all disabled:opacity-60 ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Icon className="h-4 w-4 text-primary" />
                  {title}
                  {active && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
                </span>
                <span className="block text-xs text-muted-foreground mt-1">{desc}</span>
              </button>
            )
          })}
        </div>

        {/* Hạn mức Gemini trong ngày */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
            <span className="text-muted-foreground">
              Lượt gọi Gemini hôm nay:{" "}
              <span className="font-semibold text-foreground tabular-nums">{cfg.usedToday}</span> / {cfg.dailyLimit}
            </span>
            <span className={`font-semibold tabular-nums ${hetLuot ? "text-red-500" : "text-foreground"}`}>
              Còn {cfg.remaining} lượt
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          {/* Giới hạn lấy theo GÓI Gemini đang dùng — admin tự sửa cho khớp, vì
              Google đổi hạn mức free tier theo từng thời điểm và từng model. */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Giới hạn mỗi ngày:</span>
            <Input
              key={cfg.dailyLimit}
              type="number"
              min={1}
              max={10000}
              defaultValue={cfg.dailyLimit}
              disabled={saving === "limit"}
              className="h-7 w-24 text-xs"
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 1 && n !== cfg.dailyLimit) save({ dailyLimit: n }, "limit")
              }}
            />
            <span>lượt gọi (gói miễn phí của Google: 20 lượt/ngày cho mỗi model)</span>
          </div>
          {/* Vì sao "hỏi 1 câu mà hết lượt": mỗi lần AI tra cứu dữ liệu là 1 lượt gọi,
              cộng lượt viết câu trả lời — câu hỏi phức tạp tốn 6+ lượt. */}
          <p className="text-[11px] text-muted-foreground">
            Hôm nay AI đã trả lời <span className="font-medium text-foreground">{cfg.questionsToday}</span> câu hỏi
            {/* Chỉ hiện trung bình khi hai con số cùng khung thời gian — ngày đầu bật
                tính năng, số lượt gọi đếm từ lúc bật còn số câu hỏi tính cả ngày. */}
            {cfg.questionsToday > 0 && cfg.usedToday >= cfg.questionsToday &&
              ` (trung bình ${(cfg.usedToday / cfg.questionsToday).toFixed(1)} lượt/câu)`}
            {cfg.quotaErrorsToday > 0 && ` · ${cfg.quotaErrorsToday} lần bị Google từ chối vì hết hạn mức`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            ≈ {cfg.tongSucChua} lượt/ngày ({cfg.soKhoa} khoá × {cfg.models.length} model × {Math.round(cfg.dailyLimit / Math.max(1, cfg.soKhoa))} lượt)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Model {cfg.model} ·{" "}
            {cfg.keySource === "db"
              ? `khoá lưu trong hệ thống (${cfg.keyMasked})`
              : cfg.keySource === "env"
                ? `khoá trong file .env (${cfg.keyMasked})`
                : "chưa có khoá"}
          </p>
        </div>

        {/* Cảnh báo khi Gemini không dùng được */}
        {canhBao && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {!cfg.hasKey
                ? "Chưa có khoá Gemini — chatbot đang trả lời bằng luật cứng."
                : dangTamNgung
                  ? `Google báo khoá này đã hết hạn mức. Hệ thống tạm ngưng gọi Gemini ${Math.ceil(
                      cfg.quotaCooldownSeconds / 60,
                    )} phút nữa và đang trả lời bằng luật cứng.`
                  : `Đã dùng hết ${cfg.dailyLimit} lượt gọi trong ngày. Gói miễn phí của Google cho 20 lượt/ngày cho mỗi model — đổi sang khoá của dự án khác, hoặc chờ sang ngày mới.`}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              Dán khoá Gemini mới ở ô bên dưới để kết nối lại ngay (dán được cả đường link chứa <code>?key=…</code>).
            </p>
          </div>
        )}

        {/* Chọn model — hạn mức miễn phí của Google tính theo TỪNG model (20 lượt/
            ngày/model), nên hết lượt model này thì đổi sang model khác là dùng tiếp
            được ngay, không cần khoá mới. */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Model Gemini (mỗi model có hạn mức riêng)</label>
          <select
            value={cfg.model}
            disabled={saving === "model"}
            onChange={(e) => save({ model: e.target.value }, "model")}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            {!cfg.models.some((m) => m.id === cfg.model) && <option value={cfg.model}>{cfg.model}</option>}
            {cfg.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — đã dùng {m.usedToday}/{cfg.dailyLimit} lượt hôm nay
              </option>
            ))}
          </select>
        </div>

        {/* Khoá Gemini */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Khoá Gemini — {cfg.soKhoa > 0 ? `đang dùng ${cfg.soKhoa} khoá (${cfg.keyMasked})` : "chưa có khoá"}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Nhiều khoá: mỗi dòng một khoá. Mỗi khoá thuộc một dự án Google khác
                nhau nên có hạn mức riêng — cách trực tiếp nhất để hỏi liên tục lâu hơn. */}
            <textarea
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={"Dán khoá — mỗi dòng một khoá (dán được cả link chứa ?key=…)"}
              rows={3}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs resize-y"
            />
            <div className="flex gap-2">
              <Button onClick={() => save({ apiKey: keyInput }, "key")} disabled={!keyInput.trim() || saving === "key"}>
                {saving === "key" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu khoá"}
              </Button>
              <Button variant="outline" asChild>
                <a href={KEY_PAGE_URL} target="_blank" rel="noopener noreferrer">
                  Lấy khoá <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            </div>
          </div>
          {cfg.keySource === "db" && (
            <button
              type="button"
              onClick={() => save({ apiKey: "" }, "key")}
              disabled={saving === "key"}
              className="text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Xoá khoá đã lưu, quay lại dùng khoá trong file .env
            </button>
          )}
        </div>

        {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  )
}
