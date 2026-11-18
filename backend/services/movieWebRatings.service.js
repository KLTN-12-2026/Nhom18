/**
 * TRA ĐIỂM ĐÁNH GIÁ PHIM TRÊN CÁC TRANG LỚN (IMDb, Rotten Tomatoes, Metacritic)
 * — dữ liệu THẬT lấy trực tiếp từ Internet lúc khách hỏi, không phải chữ do AI
 * tự nghĩ ra.
 *
 * Nguồn: Wikidata (query.wikidata.org / www.wikidata.org) — cơ sở dữ liệu mở
 * của Wikimedia, nơi cộng đồng Wikipedia ghi điểm của từng phim trên IMDb,
 * Rotten Tomatoes, Metacritic KÈM NGÀY GHI NHẬN (thuộc tính P444 "review
 * score", bên chấm P447, thời điểm P585). Miễn phí, không cần khoá API.
 *
 * Vì sao không dùng Google Search của Gemini: đã thử trực tiếp ngày
 * 22/09/2026 — khoá Gemini gói miễn phí gọi thường thì được (HTTP 200) nhưng
 * bật google_search thì bị từ chối ngay trên mọi model (HTTP 429): tính năng
 * tìm kiếm chỉ mở khi dự án Google Cloud bật thanh toán.
 *
 * Chatbot gọi hàm này qua function calling (searchWebReviews), rồi Gemini
 * diễn đạt lại các con số THẬT kèm ngày và link nguồn để khách tự kiểm chứng.
 */

const UA = {
  "User-Agent": "CinemaGold/1.0 (khoa luan tot nghiep; https://github.com/)",
  Accept: "application/json",
}
const HET_GIO_MS = 10000
const CACHE_MS = 12 * 60 * 60 * 1000 // điểm số đổi chậm — nhớ 12 giờ, đỡ gọi lại
const cache = new Map()

// Mã Wikidata của các trang chấm điểm (giá trị của bên chấm P447)
const BEN_CHAM = {
  Q37312: "IMDb",
  Q105584: "Rotten Tomatoes",
  Q150248: "Metacritic",
  Q72386398: "Letterboxd",
}

async function layJson(url) {
  const ctrl = new AbortController()
  const hen = setTimeout(() => ctrl.abort(), HET_GIO_MS)
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(hen)
  }
}

/** Tìm mã Wikidata của PHIM theo tên, ưu tiên ứng viên có mô tả chứa đúng năm. */
async function timPhim(tenPhim, nam) {
  const d = await layJson(
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=10&search=" +
      encodeURIComponent(tenPhim),
  )
  const ungVien = (d.search || []).filter((x) => /film|movie/i.test(x.description || ""))
  if (!ungVien.length) return null
  if (nam) {
    const dungNam = ungVien.find((x) => String(x.description || "").includes(String(nam)))
    if (dungNam) return dungNam
  }
  return ungVien[0]
}

/** Chuẩn hoá điểm: "85%" → percent, "7.7/10" → /10, "72/100" → /100 */
function loaiThang(diem) {
  if (/%$/.test(diem)) return "phan_tram"
  const m = diem.match(/\/(\d+)$/)
  return m ? `tren_${m[1]}` : "khac"
}

function nhanHienThi(benCham, thang) {
  if (benCham === "Rotten Tomatoes" && thang === "phan_tram") return "Rotten Tomatoes — Tomatometer (tỉ lệ nhà phê bình khen)"
  if (benCham === "Rotten Tomatoes") return "Rotten Tomatoes — điểm trung bình giới phê bình"
  if (benCham === "Metacritic") return "Metacritic — Metascore (giới phê bình)"
  if (benCham === "IMDb") return "IMDb — điểm khán giả"
  return benCham
}

/**
 * @param {{ movieTitle: string, year?: number }} args
 * @returns {Promise<object>} { found, title, year, ratings[], sources[], retrievedAt, note }
 */
async function traDiemTrenMang({ movieTitle, year } = {}) {
  const ten = String(movieTitle || "").trim()
  if (!ten) return { found: false, error: "Thiếu tên phim" }

  // Phim có trong danh mục rạp thì lấy tên gốc + năm gốc từ CSDL để tìm chính xác hơn
  let nam = Number(year) || null
  try {
    const { pool } = require("../config/database")
    const [[phim]] = await pool.query(
      "SELECT title, original_year FROM movies WHERE title LIKE ? ORDER BY LENGTH(title) LIMIT 1",
      [`%${ten}%`],
    )
    if (phim && !nam) nam = phim.original_year || null
  } catch (_) { /* không có CSDL vẫn tra được */ }

  const khoa = `${ten.toLowerCase()}|${nam || ""}`
  const daNho = cache.get(khoa)
  if (daNho && Date.now() - daNho.at < CACHE_MS) return daNho.data

  const ungVien = await timPhim(ten, nam)
  if (!ungVien) {
    const kq = { found: false, query: ten, note: "Không tìm thấy phim này trên Wikidata. Hãy thử tên gốc tiếng Anh." }
    cache.set(khoa, { at: Date.now(), data: kq })
    return kq
  }

  // Chỉ lấy đúng các trường cần bằng SPARQL (vài KB) — tải cả hồ sơ phim qua
  // Special:EntityData nặng ~450KB, mạng chậm là vượt hạn chờ.
  const qid = ungVien.id
  const sparql = `SELECT ?diem ?ben ?ngay ?imdb ?rt ?mc ?wiki WHERE {
    OPTIONAL { wd:${qid} p:P444 ?st. ?st ps:P444 ?diem; pq:P447 ?ben. OPTIONAL { ?st pq:P585 ?ngay } }
    OPTIONAL { wd:${qid} wdt:P345 ?imdb }
    OPTIONAL { wd:${qid} wdt:P1258 ?rt }
    OPTIONAL { wd:${qid} wdt:P1712 ?mc }
    OPTIONAL { ?wiki schema:about wd:${qid}; schema:isPartOf <https://en.wikipedia.org/> }
  }`
  const rows = (await layJson(
    'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql),
  )).results.bindings

  // Lấy điểm MỚI NHẤT cho từng (bên chấm, thang điểm)
  const moiNhat = new Map()
  for (const r of rows) {
    const diem = r.diem?.value
    const benCham = BEN_CHAM[String(r.ben?.value || '').split('/').pop()]
    if (!diem || !benCham) continue
    const ngay = r.ngay?.value ? r.ngay.value.slice(0, 10) : null
    const thang = loaiThang(String(diem))
    const k = `${benCham}|${thang}`
    const cu = moiNhat.get(k)
    if (!cu || (ngay && (!cu.asOf || ngay > cu.asOf))) {
      moiNhat.set(k, { source: benCham, label: nhanHienThi(benCham, thang), score: String(diem), asOf: ngay })
    }
  }
  const thuTu = ["IMDb", "Rotten Tomatoes", "Metacritic", "Letterboxd"]
  const ratings = [...moiNhat.values()].sort((a, b) => thuTu.indexOf(a.source) - thuTu.indexOf(b.source))

  // Đường dẫn tới đúng trang của phim trên từng trang chấm điểm
  const dau = rows[0] || {}
  const imdb = dau.imdb?.value
  const rt = dau.rt?.value
  const mc = dau.mc?.value
  const wikiUrl = dau.wiki?.value
  const sources = [
    imdb && { name: "IMDb", url: `https://www.imdb.com/title/${imdb}/` },
    rt && { name: "Rotten Tomatoes", url: `https://www.rottentomatoes.com/${rt}` },
    mc && { name: "Metacritic", url: `https://www.metacritic.com/${mc}` },
    wikiUrl && { name: "Wikipedia", url: wikiUrl },
    { name: "Wikidata", url: `https://www.wikidata.org/wiki/${ungVien.id}` },
  ].filter(Boolean)

  const kq = {
    found: true,
    title: ungVien.label,
    description: ungVien.description,
    year: nam,
    ratings,
    sources,
    retrievedAt: new Date().toISOString(),
    note: ratings.length
      ? "Điểm lấy từ Wikidata (cơ sở dữ liệu mở của Wikipedia), mỗi điểm kèm ngày ghi nhận — điểm trên trang gốc có thể đã thay đổi nhẹ sau ngày đó."
      : "Đã tìm thấy phim nhưng Wikidata chưa ghi điểm đánh giá nào — mời khách xem trực tiếp qua các link nguồn.",
  }
  cache.set(khoa, { at: Date.now(), data: kq })
  return kq
}

module.exports = { traDiemTrenMang }
