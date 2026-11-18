/**
 * ChatbotNLU — tầng xử lý ngôn ngữ tự nhiên + trí nhớ ngữ cảnh cho rule-based
 * fallback của chatbot (chạy khi Gemini AI hết quota/lỗi).
 *
 * Gồm các thành phần:
 *   1. Multinomial Naive Bayes Classifier — phân loại tâm trạng/ý định bằng
 *      xác suất thật (định lý Bayes + giả định độc lập đặc trưng), KHÔNG còn
 *      chỉ đếm từ khoá khớp.
 *   2. Hierarchical Regex NER — nhận dạng thực thể (ngày, giờ, mã vé, số
 *      lượng, tiền, loại phòng...) bằng nhiều TẦNG regex theo độ ưu tiên/độ
 *      đặc hiệu giảm dần; tầng cao hơn luôn được thử trước, tầng dưới chỉ là
 *      phương án dự phòng khi tầng trên không khớp.
 *   3. Context Memory — dò lại lịch sử hội thoại để biết phim/rạp/ngày đang
 *      được nhắc tới, phục vụ câu hỏi nối tiếp ("phim đó", "vậy giá sao").
 *      KHÔNG lưu state trên server — context suy ra lại từ `history` mà
 *      client gửi mỗi request (giữ đúng nguyên tắc stateless, không lẫn dữ
 *      liệu giữa các tài khoản).
 *
 * Tên phim/rạp được nhận diện bằng Aho-Corasick Automaton — dựng 1 automaton
 * từ TOÀN BỘ tên phim/rạp thật trong DB, quét câu chat 1 lượt duy nhất để
 * tìm tất cả tên khớp cùng lúc (O(độ dài câu), thay vì lặp qua từng phim một
 * như cách cũ). Nếu không khớp chính xác (vd người dùng gõ sai), rơi xuống
 * Levenshtein Distance để tìm tên phim GẦN ĐÚNG nhất ("did you mean").
 */

const { pool } = require("../config/database")
const { AhoCorasick } = require("./ahoCorasick.service")
const { findClosestMatch } = require("./textDistance.service")

// ─────────────────────────────────────────────
// LAYER 0 — NORMALIZE
// ─────────────────────────────────────────────

// Toàn bộ pattern trong FAQ_RULES/MOOD_MAP/các nhánh intent đều viết CÓ dấu.
// Nhưng người Việt gõ chat rất hay bỏ dấu ("toi muon xem phim hom nay") — nếu
// không xử lý, mọi rule match theo .includes("hôm nay") đều trượt hết, rơi về
// câu chào mặc định dù câu hỏi hoàn toàn hợp lệ.
//
// Không thể "khôi phục dấu" tổng quát (bài toán NLP khó, nhập nhằng thật sự:
// "ba" có thể là "ba/bà/bá/bả/bã/bạ"). Nhưng trong phạm vi HẸP của chatbot đặt
// vé xem phim, từ vựng thực tế xuất hiện trong các pattern chỉ có vài trăm từ
// — nên dùng 1 từ điển tra cứu trực tiếp cho ĐÚNG các từ/cụm từ đã dùng làm
// pattern, ưu tiên khớp cụm dài trước (tránh khớp nhầm 1 từ trong cụm dài hơn).
const NO_DIACRITICS_PHRASES = [
  // Thời gian
  ["hom nay", "hôm nay"], ["dem nay", "đêm nay"], ["toi nay", "tối nay"],
  ["ngay mai", "ngày mai"], ["hom qua", "hôm qua"], ["chu nhat", "chủ nhật"],
  // Cụm nhiều từ đặc hiệu (ưu tiên khớp trước để không bị các từ đơn bên dưới
  // cắt vụn sai nghĩa)
  ["lich chieu", "lịch chiếu"], ["suat chieu", "suất chiếu"], ["gio chieu", "giờ chiếu"],
  ["tra lich", "tra lịch"], ["xem lich", "xem lịch"], ["dang chieu", "đang chiếu"],
  ["sap chieu", "sắp chiếu"], ["phim moi", "phim mới"], ["gia ve", "giá vé"],
  ["bao nhieu tien", "bao nhiêu tiền"], ["dat ve", "đặt vé"], ["huy ve", "huỷ vé"],
  ["hoan tien", "hoàn tiền"], ["ve cua toi", "vé của tôi"], ["lich su", "lịch sử"],
  ["da dat", "đã đặt"], ["xin chao", "xin chào"], ["cam on", "cảm ơn"],
  ["tam biet", "tạm biệt"], ["hen gap lai", "hẹn gặp lại"], ["phim gi", "phim gì"],
  ["hay nhat", "hay nhất"], ["pho bien", "phổ biến"], ["de xuat", "đề xuất"],
  ["goi y", "gợi ý"], ["nen xem", "nên xem"], ["dia diem", "địa điểm"],
  ["o dau", "ở đâu"], ["dia chi", "địa chỉ"], ["bao nhieu phut", "bao nhiêu phút"],
  ["thoi luong", "thời lượng"], ["dai khong", "dài không"], ["tre em", "trẻ em"],
  ["gia dinh", "gia đình"], ["hen ho", "hẹn hò"], ["lang man", "lãng mạn"],
  ["hanh dong", "hành động"], ["kinh di", "kinh dị"], ["rung minh", "rùng mình"],
  ["vien tuong", "viễn tưởng"], ["sieu anh hung", "siêu anh hùng"], ["phieu luu", "phiêu lưu"],
  ["cuoi tuan", "cuối tuần"], ["ngay nghi", "ngày nghỉ"], ["tam ly", "tâm lý"],
  ["so sanh gia", "so sánh giá"], ["dat toi da", "đặt tối đa"], ["giu ghe", "giữ ghế"],
  ["doi ve", "đổi vé"], ["loai phong", "loại phòng"], ["giam gia", "giảm giá"],
  ["uu dai", "ưu đãi"], ["ma giam gia", "mã giảm giá"], ["khieu nai", "khiếu nại"],
  ["loi thanh toan", "lỗi thanh toán"], ["gop y", "góp ý"],
  // Từ đơn phổ biến — chỉ thay khi đứng riêng 1 từ (word boundary)
  ["toi", "tôi"], ["muon", "muốn"], ["xem", "xem"], ["phim", "phim"], ["ve", "vé"],
  ["rap", "rạp"], ["gia", "giá"], ["dat", "đặt"], ["ghe", "ghế"], ["phong", "phòng"],
  ["ma", "mã"], ["biet", "biết"], ["tim", "tìm"], ["hoi", "hỏi"], ["giup", "giúp"],
  ["can", "cần"], ["duoc", "được"], ["nao", "nào"], ["dau", "đâu"], ["may", "mấy"],
  ["sao", "sao"], ["buon", "buồn"], ["vui", "vui"], ["chan", "chán"], ["met", "mệt"],
  ["yeu", "yêu"], ["so", "sợ"], ["hai", "hài"], ["re", "rẻ"],
  ["tien", "tiền"], ["gan", "gần"], ["du", "đủ"], ["day", "đầy"],
  // Từ vựng dùng cho sentimentAnalysis.service.js (từ điển tích cực/tiêu cực,
  // phủ định, từ nhấn mạnh — xem POSITIVE_WORDS/NEGATIVE_WORDS ở đó) — thêm
  // vào đây (thay vì tự viết 1 bộ khôi phục dấu RIÊNG cho sentiment) để dùng
  // CHUNG normalize() với toàn bộ pipeline, tránh lệch kết quả giữa 2 nơi.
  // CHỈ thêm những từ/cụm KHÔNG dấu KHÔNG bị đụng độ với 1 từ tiếng Việt phổ
  // biến khác cùng cách gõ không dấu (vd CỐ TÌNH bỏ qua "qua"→"quá" vì "qua"
  // rất hay dùng với nghĩa "đi qua"; bỏ qua "lam"→"lắm" vì trùng "làm"; bỏ qua
  // "dinh"→"đỉnh" vì trùng "định"; bỏ qua "hong"→"hỏng" vì trùng "hồng"; bỏ
  // qua "cha"→"chả" vì trùng "cha"; bỏ qua "dung"→"đừng" vì trùng "dùng") —
  // những từ này nếu thêm sai sẽ làm hỏng câu KHÔNG liên quan tới sentiment.
  // Teencode viết tắt cực phổ biến trong chat tiếng Việt thật — "ko"/"k" đều
  // dùng để viết tắt "không", nhưng CHỈ thêm "ko" (2 ký tự), CỐ TÌNH bỏ qua "k"
  // 1 mình vì "k" còn là đơn vị tiền tệ viết tắt ("100k" = 100 nghìn đồng) đã
  // được parsePriceFilter/parseComboPriceFilter dùng — nếu khôi phục cả "k"
  // thành "không" sẽ phá hỏng toàn bộ câu hỏi lọc giá (vd "phim dưới 100k"
  // thành "phim dưới 100không", gãy regex bắt số tiền ngay lập tức). "j" là
  // teencode phổ biến của "gì" (vd "giá vé j vậy", "sao j"), không đụng độ với
  // từ/tên phim thật nào trong hệ thống (đã kiểm tra không có phim nào có từ
  // "j" đứng riêng trong tên).
  ["ko", "không"], ["j", "gì"],
  ["khong", "không"], ["tuyet voi", "tuyệt vời"], ["tuyet", "tuyệt"],
  ["xuat sac", "xuất sắc"], ["dinh cao", "đỉnh cao"], ["thich", "thích"],
  ["hai long", "hài lòng"], ["an tuong", "ấn tượng"], ["loi cuon", "lôi cuốn"],
  ["kich tinh", "kịch tính"], ["hap dan", "hấp dẫn"], ["dep", "đẹp"], ["muot", "mượt"],
  ["dang xem", "đáng xem"], ["dang tien", "đáng tiền"], ["chat luong", "chất lượng"],
  ["tot", "tốt"], ["cam dong", "cảm động"], ["xung dang", "xứng đáng"],
  ["man nhan", "mãn nhãn"], ["dang dong tien", "đáng đồng tiền"],
  ["dien xuat tot", "diễn xuất tốt"], ["noi dung hay", "nội dung hay"],
  ["ky xao dep", "kỹ xảo đẹp"], ["qua hay", "quá hay"], ["qua te", "quá tệ"],
  ["toi te", "tồi tệ"], ["rac", "rác"], ["phi thoi gian", "phí thời gian"],
  ["buc", "bực"], ["kho chiu", "khó chịu"], ["buc minh", "bực mình"],
  ["ghet", "ghét"], ["uc che", "ức chế"], ["sai sot", "sai sót"],
  ["khong dang", "không đáng"], ["lua dao", "lừa đảo"], ["te", "tệ"],
  ["cham", "chậm"], ["rom", "rởm"], ["cuc", "cực"], ["vo cung", "vô cùng"],
  ["sieu", "siêu"], ["that vong", "thất vọng"], ["that", "thật"],
  ["thuc su", "thực sự"], ["kinh khung", "kinh khủng"], ["cuc ky", "cực kỳ"],
]
// Sắp theo độ dài giảm dần để cụm nhiều từ luôn được thử khớp trước từ đơn
// (tránh "hom nay" bị "hom" — vốn không có trong danh sách — cắt nhầm).
const SORTED_PHRASES = [...NO_DIACRITICS_PHRASES].sort((a, b) => b[0].length - a[0].length)

/** Câu có dấu tiếng Việt sẵn rồi thì không đụng vào (tránh sửa nhầm). */
function hasVietnameseDiacritics(text) {
  return /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text)
}

/** Khôi phục dấu cho các từ/cụm PHỔ BIẾN trong miền đặt vé xem phim — chỉ áp
 * dụng khi câu KHÔNG có dấu sẵn (tránh phá câu đã đúng chính tả). */
function restoreCommonDiacritics(text) {
  if (!text || hasVietnameseDiacritics(text)) return text
  let result = text
  // "thu 2".."thu 7" → "thứ 2".."thứ 7" (khôi phục có điều kiện, chỉ khi theo
  // sau là số 2-7, tránh nhầm với "thu" nghĩa khác như "mùa thu")
  result = result.replace(/\bthu\s*([2-7])\b/gi, "thứ $1")
  for (const [plain, accented] of SORTED_PHRASES) {
    result = result.replace(new RegExp(`\\b${plain}\\b`, "gi"), accented)
  }
  return result
}

// normalize() là hàm THUẦN (pure) của chuỗi đầu vào, nhưng trong 1 lượt chat
// bị gọi lặp lại nhiều lần với CÙNG 1 message thô (classifyIntentForMarkov,
// applyMarkovSuggestion, applySentimentEmpathy, fallbackResponse, và bên
// trong extractEntities) — mỗi lần chạy lại restoreCommonDiacritics (tới ~70
// lượt regex.replace khi câu không dấu). Cache nhỏ, có giới hạn kích thước
// (LRU đơn giản bằng thứ tự chèn của Map) để tránh tính lại vô ích mà không
// phình bộ nhớ vô hạn qua thời gian chạy của server.
const NORMALIZE_CACHE_MAX = 200
const normalizeCache = new Map()

function normalize(text) {
  const raw = text || ""
  const cached = normalizeCache.get(raw)
  if (cached !== undefined) {
    normalizeCache.delete(raw) // đẩy lên "gần đây nhất" (LRU)
    normalizeCache.set(raw, cached)
    return cached
  }

  const result = restoreCommonDiacritics(raw)
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()

  normalizeCache.set(raw, result)
  if (normalizeCache.size > NORMALIZE_CACHE_MAX) {
    normalizeCache.delete(normalizeCache.keys().next().value) // xoá entry cũ nhất
  }
  return result
}

/** Tách câu thành từ — dùng khoảng trắng/dấu câu làm ranh giới (không dùng \b
 * vì \b trong JS regex chỉ nhận ASCII [A-Za-z0-9_], sai với chữ có dấu tiếng Việt) */
function tokenize(text) {
  return normalize(text).split(/[\s,.!?;:"'()]+/).filter(Boolean)
}

// Stop-word: từ phổ biến KHÔNG mang tín hiệu phân loại tâm trạng — phải loại
// khỏi vocabulary khi huấn luyện/phân loại Naive Bayes, nếu không một từ
// xuất hiện ở hầu hết mọi câu (vd "phim" — chatbot phim thì câu nào cũng có
// từ này) sẽ lấn át kết quả chỉ vì nó tình cờ nằm trong 1 pattern mẫu nào đó.
const STOP_WORDS = new Set([
  "phim", "xem", "tôi", "mình", "bạn", "cho", "có", "không", "muốn", "là",
  "gì", "nên", "thì", "được", "để", "thích", "nhé", "nha", "ạ", "ơi", "à",
  "ừ", "vậy", "này", "đó", "nó", "và", "với", "của", "về", "biết", "hay",
  "rất", "quá", "lại", "còn", "nữa", "đi", "ngày", "hôm",
])
function tokenizeForClassification(text) {
  return tokenize(text).filter((w) => !STOP_WORDS.has(w))
}

// ═══════════════════════════════════════════════════════════════════════
// 1. MULTINOMIAL NAIVE BAYES CLASSIFIER
//    P(class|words) ∝ P(class) × Π P(word|class)   (tính trong log-space)
//    P(word|class) dùng Laplace (add-1) smoothing để xử lý từ chưa gặp.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Huấn luyện model Naive Bayes từ "tập mẫu" — mỗi pattern trong moodMap được
 * coi là 1 văn bản huấn luyện thuộc nhãn (class) tương ứng.
 * @param {Array<{patterns: string[], [key:string]: any}>} moodMap
 * @returns model { classes, priors, wordCountByClass, totalWordsByClass, vocab }
 */
function trainNaiveBayes(moodMap) {
  const classes = moodMap.map((mood, idx) => ({ idx, mood }))
  const wordCountByClass = classes.map(() => new Map())
  const totalWordsByClass = classes.map(() => 0)
  const vocab = new Set()
  let totalDocs = 0
  let maxPatternWords = 1

  classes.forEach(({ idx, mood }) => {
    for (const pattern of mood.patterns) {
      totalDocs++
      // QUAN TRỌNG: pattern nhiều từ được coi là 1 "token cụm" DUY NHẤT,
      // KHÔNG tách rời thành từng từ đơn để thêm vào vocab riêng lẻ — nếu
      // tách, các từ MẢNH VỠ (vd "nhà" từ "ở nhà"/"cả nhà", "anh" từ "siêu
      // anh hùng", "ý" từ "ý nghĩa", "tâm" từ "tâm lý") sẽ trở thành tín hiệu
      // ĐỘC LẬP dù tác giả chưa từng liệt kê chúng như 1 dấu hiệu tâm trạng
      // riêng, gây khớp nhầm hàng loạt với câu nói bình thường chứa đúng từ
      // đó nhưng nghĩa hoàn toàn khác (vd "cả nhà tôi đi ăn tối" bị hiểu nhầm
      // thành tâm trạng "ở nhà thư giãn" chỉ vì trùng từ "nhà", "ship vé tận
      // nhà được không" cũng vậy). Coi cả cụm là 1 token giữ nguyên nghĩa cụm
      // từ, loại bỏ hoàn toàn lớp lỗi "từ mảnh vỡ" thay vì phải liệt kê từng
      // từ nguy hiểm vào danh sách chặn tay (không thể liệt kê hết).
      //
      // Dùng tokenize() THUẦN (không lọc stopword) chứ không phải
      // tokenizeForClassification() — "bạn" nằm trong STOP_WORDS, nên nếu
      // lọc stopword TRƯỚC khi ghép cụm, "bạn gái"/"bạn trai" sẽ bị cắt cụt
      // còn mỗi "gái"/"trai" (chính là loại lỗi mảnh vỡ đang cố tránh, chỉ là
      // nguồn gốc khác — mất từ vì lọc stopword thay vì vì tách theo khoảng
      // trắng). Khi so khớp CẢ CỤM nguyên văn thì không cần lọc stopword nữa
      // — mục tiêu lọc stopword ban đầu là tránh từ đệm gây nhiễu điểm số
      // BAG-OF-WORDS, nhưng ở đây đang so khớp CỤM CHÍNH XÁC nên không áp dụng.
      const tokens = tokenize(pattern)
      const token = tokens.join(" ")
      if (!token) continue
      maxPatternWords = Math.max(maxPatternWords, tokens.length)
      vocab.add(token)
      const m = wordCountByClass[idx]
      m.set(token, (m.get(token) || 0) + 1)
      totalWordsByClass[idx]++
    }
  })

  // Prior P(class) — ước lượng theo tỉ trọng số mẫu (pattern) của mỗi lớp,
  // Laplace-smoothed để lớp nào cũng có xác suất khởi điểm > 0.
  const priors = classes.map(({ mood }) => (mood.patterns.length + 1) / (totalDocs + classes.length))

  return { classes, priors, wordCountByClass, totalWordsByClass, vocab, vocabSize: vocab.size, maxPatternWords }
}

/**
 * Phân loại 1 câu bằng model Naive Bayes đã huấn luyện.
 * @returns { mood, classIndex, score, matched } hoặc null nếu câu không có
 *          cụm từ nào trùng với vocabulary đã học — tránh gán nhãn bừa khi
 *          không có tín hiệu liên quan gì cả.
 */
function classifyNaiveBayes(model, text) {
  // Dùng tokenize() THUẦN — khớp đúng cách token hoá của trainNaiveBayes ở
  // trên (không lọc stopword, tránh cắt cụt cụm từ có chứa stopword bên
  // trong như "bạn gái"/"bạn trai").
  const tokens = tokenize(text)
  // Sinh mọi cụm từ LIÊN TIẾP (n-gram, n từ 1 tới độ dài pattern dài nhất đã
  // học) rồi lọc lấy đúng những cụm THẬT SỰ có trong vocab — khớp đúng cách
  // huấn luyện ở trên (mỗi pattern nhiều từ là 1 "token cụm" nguyên vẹn, từ
  // đơn lẻ tách rời từ 1 cụm không tự động có nghĩa).
  const candidates = []
  for (let n = 1; n <= model.maxPatternWords; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      candidates.push(tokens.slice(i, i + n).join(" "))
    }
  }
  const overlapping = candidates.filter((c) => model.vocab.has(c))
  if (overlapping.length === 0) return null // không có tín hiệu nào khớp vocab đã học

  let best = null
  for (const { idx, mood } of model.classes) {
    // log P(class) + Σ log P(cụm|class) — chỉ tính trên các cụm THẬT SỰ khớp
    // vocab (không phải mọi từ trong câu như Naive Bayes văn bản cổ điển) vì
    // đây là bộ phân loại theo CỤM TỪ KÍCH HOẠT (trigger phrase), không phải
    // phân loại tài liệu — từ không liên quan trong câu không nên pha loãng
    // điểm số của các cụm tín hiệu thật đã khớp được.
    let logScore = Math.log(model.priors[idx])
    const wordCounts = model.wordCountByClass[idx]
    const totalWords = model.totalWordsByClass[idx]
    for (const c of overlapping) {
      const count = wordCounts.get(c) || 0
      const pWordGivenClass = (count + 1) / (totalWords + model.vocabSize) // Laplace smoothing
      logScore += Math.log(pWordGivenClass)
    }
    if (!best || logScore > best.logScore) best = { idx, mood, logScore }
  }

  return { mood: best.mood, classIndex: best.idx, score: best.logScore, matchedWords: overlapping }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. HIERARCHICAL REGEX NER
//    Nhiều TẦNG quy tắc regex theo độ đặc hiệu giảm dần. Với mỗi loại thực
//    thể, tầng cao hơn (đặc hiệu/tin cậy hơn) luôn được thử trước; chỉ rơi
//    xuống tầng dưới (tổng quát hơn) nếu tầng trên không khớp được gì.
// ═══════════════════════════════════════════════════════════════════════
const NER_TIERS = [
  // ── Tier 1: định dạng có cấu trúc tường minh (độ tin cậy cao nhất) ──────
  // LƯU Ý CHUNG: \b (word boundary) trong JS regex chỉ nhận diện ký tự ASCII
  // [A-Za-z0-9_], nên với từ tiếng Việt có dấu KẾT THÚC bằng nguyên âm có dấu
  // (vd "ghế", "vé", "chỗ"), \b ở cuối từ sẽ không khớp đúng. Dùng lookahead
  // (?=[\s,.!?;:]|$) thay cho \b ở những vị trí này. text đưa vào match đã
  // được normalize() về chữ thường nên các pattern dưới đây viết chữ thường.
  {
    tier: 1,
    name: "structured",
    rules: [
      { entity: "bookingRef", regex: /\bbk[a-z0-9]{6,}\b/, transform: (m) => m[0].toUpperCase() },
      { entity: "explicitDate", regex: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/, transform: (m) => ({ dd: +m[1], mm: +m[2], yyyy: m[3] ? +m[3] : null }) },
      { entity: "explicitTime", regex: /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/, transform: (m) => ({ hour: +m[1], minute: +m[2] }) },
      { entity: "seatCount", regex: /(\d+)\s*(ghế|vé|chỗ|người)(?=[\s,.!?;:]|$)/, transform: (m) => +m[1] },
      { entity: "priceAmount", regex: /(\d+)\s*(k\b|nghìn|ngàn)/, transform: (m) => +m[1] * 1000 },
    ],
  },
  // ── Tier 2: từ khoá thời gian tương đối (đặc hiệu trung bình) ───────────
  {
    tier: 2,
    name: "relative-time",
    rules: [
      { entity: "relativeDate", regex: /\b(hôm nay|đêm nay|tối nay|ngày mai|hôm qua)\b/, transform: (m) => (m[1] === "đêm nay" || m[1] === "tối nay" ? "hôm nay" : m[1]) },
      { entity: "weekday", regex: /\b(chủ nhật|thứ\s*[2-7]|thứ\s*(hai|ba|tư|năm|sáu|bảy))(?=[\s,.!?;:]|$)/, transform: (m) => m[0] },
      // "cuối tuần" — hệ thống chưa hỗ trợ NGÀY DẠNG KHOẢNG (chỉ 1 ngày cụ thể
      // mỗi lần tra lịch), nên quy ước "cuối tuần" = ngày Thứ 7 gần nhất tới
      // (đã đủ dùng cho câu "lịch chiếu cuối tuần này" — tái dùng logic resolve
      // weekday có sẵn bên dưới thay vì viết thêm 1 nhánh riêng).
      { entity: "weekday", regex: /\bcuối tuần(?:\s*này)?\b/, transform: () => "thứ 7" },
    ],
  },
  // ── Tier 3: thuộc tính/loại sản phẩm cố định (đặc hiệu thấp nhất) ───────
  {
    tier: 3,
    name: "attribute",
    rules: [
      { entity: "roomType", regex: /\b(vip|imax|4dx|standard)\b/, transform: (m) => m[1] },
      { entity: "paymentMethod", regex: /\b(vnpay|momo|zalopay|tiền mặt)\b/, transform: (m) => m[1] },
    ],
  },
]

/**
 * Chạy NER phân tầng trên 1 đoạn văn bản. Với mỗi entity, quét từ tier 1 →
 * tier 3; entity nào đã được tier trước tìm thấy thì các tier sau KHÔNG ghi
 * đè (giữ nguyên kết quả đặc hiệu/tin cậy hơn).
 */
function extractEntitiesHierarchical(rawText) {
  const text = normalize(rawText)
  const result = {}
  for (const { rules } of NER_TIERS) {
    for (const rule of rules) {
      if (result[rule.entity] !== undefined) continue // tầng cao hơn đã tìm được, bỏ qua
      const m = text.match(rule.regex)
      if (m) result[rule.entity] = rule.transform(m)
    }
  }
  return result
}

/** Chuyển kết quả NER phân tầng (explicitDate/relativeDate/weekday) thành 1 chuỗi ngày YYYY-MM-DD thật */
function resolveDateEntity(ner) {
  const today = new Date()
  // KHÔNG dùng d.toISOString() — Date ở đây được dựng theo giờ ĐỊA PHƯƠNG
  // (new Date(y,m,d) / setDate()), nhưng toISOString() quy đổi sang UTC
  // trước khi cắt chuỗi. Ở múi giờ UTC+7 (VN), nửa đêm giờ địa phương lùi
  // về 17h hôm trước theo UTC -> mọi ngày (hôm nay/ngày mai/ngày cụ thể/thứ
  // mấy) bị lùi mất 1 ngày (hỏi lịch chiếu 20/07 lại ra kết quả 19/07). Lấy
  // thẳng năm/tháng/ngày theo local time, không quy đổi UTC.
  const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  if (ner.explicitDate) {
    const { dd, mm, yyyy } = ner.explicitDate
    let d = new Date(yyyy || today.getFullYear(), mm - 1, dd)
    if (!isNaN(d.getTime())) {
      // KHÔNG có năm tường minh (vd chỉ gõ "10/01") + ngày/tháng đó đã QUA
      // trong năm nay → hiểu là năm SAU, không phải cùng ngày/tháng nhưng đã
      // lùi lại quá khứ. Hỏi lịch chiếu 1 ngày trong quá khứ chắc chắn trả về
      // rỗng (không rạp nào có suất chiếu ngày đã qua), khiến chatbot báo "hết
      // suất chiếu" một cách khó hiểu trong khi ý người dùng rõ ràng là ngày
      // sắp tới gần nhất khớp với ngày/tháng họ gõ.
      if (!yyyy) {
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (d < todayDateOnly) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())
      }
      return toStr(d)
    }
  }
  if (ner.relativeDate === "hôm nay") return toStr(today)
  if (ner.relativeDate === "ngày mai") {
    const d = new Date(today); d.setDate(d.getDate() + 1); return toStr(d)
  }
  if (ner.relativeDate === "hôm qua") {
    const d = new Date(today); d.setDate(d.getDate() - 1); return toStr(d)
  }
  if (ner.weekday) {
    const WEEKDAY_NUM = { "chủ nhật": 0, "hai": 1, "ba": 2, "tư": 3, "năm": 4, "sáu": 5, "bảy": 6 }
    const numMatch = ner.weekday.match(/thứ\s*([2-7])/)
    const wordMatch = ner.weekday.match(/thứ\s*(hai|ba|tư|năm|sáu|bảy)/)
    let day = null
    if (ner.weekday === "chủ nhật") day = 0
    else if (numMatch) day = +numMatch[1] - 1
    else if (wordMatch) day = WEEKDAY_NUM[wordMatch[1]]
    if (day !== null) {
      const d = new Date(today)
      const diff = (day - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + diff)
      return toStr(d)
    }
  }
  return null
}

// Giữ lại hàm cũ `extractDate` (dùng nội bộ cho Context Memory quét lịch sử)
function extractDate(rawText) {
  return resolveDateEntity(extractEntitiesHierarchical(rawText))
}

// ═══════════════════════════════════════════════════════════════════════
// GAZETTEER MATCHING (tách biệt khỏi Regex NER) — tên phim/rạp so khớp với
// danh sách THẬT trong DB, cache 5 phút vì đây là dữ liệu công khai dùng
// chung cho mọi người dùng (không phải dữ liệu riêng theo tài khoản).
// ═══════════════════════════════════════════════════════════════════════
const CACHE_TTL_MS = 5 * 60 * 1000
let movieCache = { data: [], at: 0, automaton: null }
let cinemaCache = { data: [], at: 0, automaton: null }
let personCache = { data: [], at: 0, automaton: null }

async function getMovieTitleCache() {
  if (Date.now() - movieCache.at < CACHE_TTL_MS && movieCache.data.length) return movieCache.data
  const [rows] = await pool.query("SELECT id, title FROM movies")
  const data = rows.sort((a, b) => b.title.length - a.title.length)
  // Dựng lại automaton MỖI KHI cache refresh (5 phút/lần) — không phải mỗi câu chat
  const automaton = new AhoCorasick(data.map((m) => m.title.toLowerCase()))
  movieCache = { data, at: Date.now(), automaton }
  return movieCache.data
}

async function getCinemaNameCache() {
  if (Date.now() - cinemaCache.at < CACHE_TTL_MS && cinemaCache.data.length) return cinemaCache.data
  const [rows] = await pool.query("SELECT id, name FROM cinemas")
  const data = rows.sort((a, b) => b.name.length - a.name.length)
  // Mỗi rạp nhận diện bằng TÊN ĐẦY ĐỦ và TÊN RÚT GỌN (bỏ các từ chung của cả
  // chuỗi như "rạp", "CinemaGold", "Đà Nẵng"). Trước đây chỉ có tên đầy đủ nên
  // khách phải gõ nguyên "Rạp CGV Vincom Đà Nẵng" — gõ "rạp Vincom" là trượt.
  // Tên rút gọn chỉ được dùng khi nó là DUY NHẤT, tránh nhận nhầm giữa hai rạp.
  const TU_CHUNG = new Set(["rạp", "cinemagold", "cinema"])
  const rutGon = (ten) => ten.toLowerCase().replace(/đà nẵng/g, " ")
    .split(/\s+/).filter((w) => w && !TU_CHUNG.has(w)).join(" ")
  const patterns = []
  const patternToCinema = []
  data.forEach((c, i) => {
    patterns.push(c.name.toLowerCase()); patternToCinema.push(i)
    const ngan = rutGon(c.name)
    const trung = data.filter((d) => rutGon(d.name) === ngan).length > 1
    if (ngan.length >= 4 && ngan !== c.name.toLowerCase() && !trung) { patterns.push(ngan); patternToCinema.push(i) }
  })
  const automaton = new AhoCorasick(patterns)
  cinemaCache = { data, at: Date.now(), automaton, patterns, patternToCinema }
  return cinemaCache.data
}

// Tên diễn viên/đạo diễn thật lấy từ cột `cast`/`director` (chuỗi phân tách
// bằng dấu phẩy) — gộp thành 1 gazetteer để nhận diện câu kiểu "phim nào có
// Tom Cruise đóng" / "phim của đạo diễn Christopher Nolan". Giữ role (đóng
// phim/đạo diễn/cả 2) để trả lời tự nhiên đúng vai trò thay vì luôn nói
// chung chung "liên quan tới".
async function getPersonNameCache() {
  if (Date.now() - personCache.at < CACHE_TTL_MS && personCache.data.length) return personCache.data
  const [rows] = await pool.query("SELECT `cast`, director FROM movies WHERE `cast` IS NOT NULL OR director IS NOT NULL")
  const roleByName = new Map()
  const addName = (rawName, role) => {
    const name = (rawName || "").trim()
    if (!name) return
    const existing = roleByName.get(name)
    if (!existing) roleByName.set(name, role)
    else if (existing !== role) roleByName.set(name, "both")
  }
  for (const row of rows) {
    if (row.cast) row.cast.split(",").forEach((n) => addName(n, "cast"))
    if (row.director) row.director.split(",").forEach((n) => addName(n, "director"))
  }
  const data = [...roleByName.entries()]
    .map(([name, role]) => ({ name, role }))
    .sort((a, b) => b.name.length - a.name.length)
  const automaton = new AhoCorasick(data.map((p) => p.name.toLowerCase()))
  personCache = { data, at: Date.now(), automaton }
  return personCache.data
}

/** Giống findMentionedCinema — tìm 1 tên diễn viên/đạo diễn THẬT được nhắc
 * trong câu, ưu tiên tên dài nhất nếu có nhiều tên cùng khớp (vd "Tom" là
 * tiền tố của "Tom Cruise" và "Tom Hardy" cùng lúc khớp 1 phần). */
function findMentionedPerson(text, people) {
  const t = normalize(text)
  if (personCache.automaton && personCache.data === people) {
    const matches = personCache.automaton.search(t)
    if (matches.length) {
      let best = matches[0]
      for (const m of matches) {
        if (people[m.patternIndex].name.length > people[best.patternIndex].name.length) best = m
      }
      return people[best.patternIndex]
    }
    return null
  }
  return people.find((p) => t.includes(p.name.toLowerCase())) || null
}

/**
 * Tìm phim được nhắc tới bằng Aho-Corasick (quét câu 1 lượt, tìm mọi tên
 * khớp cùng lúc) — ưu tiên match DÀI NHẤT nếu có nhiều tên cùng khớp. Nếu
 * không khớp chính xác, rơi xuống Levenshtein Distance để tìm tên gần đúng
 * nhất (dung sai lỗi gõ), chỉ áp dụng cho câu KHÔNG quá dài (tránh so khớp
 * vô nghĩa khi câu chứa nhiều nội dung không liên quan đến tên phim).
 */
function findMentionedMovie(text, movies) {
  const t = normalize(text)
  if (movieCache.automaton && movieCache.data === movies) {
    const matches = movieCache.automaton.search(t)
    if (matches.length) {
      let best = matches[0]
      for (const m of matches) {
        if (movies[m.patternIndex].title.length > movies[best.patternIndex].title.length) best = m
      }
      return movies[best.patternIndex]
    }
  } else {
    // Fallback an toàn nếu automaton chưa kịp dựng (vd cache vừa mới đặt data mà chưa gán automaton)
    const direct = movies.find((m) => t.includes(m.title.toLowerCase()))
    if (direct) return direct
  }

  // Không khớp chính xác → thử Levenshtein cho câu ngắn (kiểu user chỉ gõ tên
  // phim, có thể sai chính tả). Lọc bỏ stopword trước khi so khớp để cụm từ
  // còn lại gần với TÊN RIÊNG, tránh khoảng cách edit bị "loãng" bởi các từ
  // đệm không liên quan (vd "cho tôi biết về phim ...").
  if (t.length <= 40) {
    const cleaned = tokenizeForClassification(t).join(" ")
    const closest = findClosestMatch(cleaned || t, movies, (m) => m.title)
    if (closest) return closest.item
  }
  return null
}

/** Khác với findMentionedMovie (chỉ giữ 1 kết quả "tốt nhất"), hàm này trả về
 * TẤT CẢ phim thật được nhắc trong câu — dùng cho câu "so sánh phim A và B",
 * nếu không sẽ chỉ thấy được đúng 1 phim (mất phim còn lại). */
function findAllMentionedMovies(text, movies) {
  const t = normalize(text)
  if (!movieCache.automaton || movieCache.data !== movies) return []
  const matches = movieCache.automaton.search(t)
  const seen = new Map()
  for (const m of matches) {
    const movie = movies[m.patternIndex]
    if (!seen.has(movie.id)) seen.set(movie.id, movie)
  }
  return [...seen.values()]
}

function findMentionedCinema(text, cinemas) {
  const t = normalize(text)
  if (cinemaCache.automaton && cinemaCache.data === cinemas) {
    const matches = cinemaCache.automaton.search(t)
    if (matches.length) {
      // Khớp DÀI nhất thắng (tên đầy đủ ưu tiên hơn tên rút gọn)
      const { patterns, patternToCinema } = cinemaCache
      let best = matches[0]
      for (const m of matches) {
        if (patterns[m.patternIndex].length > patterns[best.patternIndex].length) best = m
      }
      return cinemas[patternToCinema[best.patternIndex]]
    }
    return null
  }
  return cinemas.find((c) => t.includes(c.name.toLowerCase())) || null
}

const ANAPHORA_WORDS = new Set(["đó", "này", "nó", "vậy", "thế"])
function hasAnaphora(msg) {
  return tokenize(msg).some((w) => ANAPHORA_WORDS.has(w))
}

/**
 * Layer 1 tổng hợp: chạy Hierarchical Regex NER + Gazetteer Matching, gộp
 * kết quả thành 1 bộ thực thể duy nhất cho câu hiện tại.
 */
async function extractEntities(rawMessage) {
  const msg = normalize(rawMessage)
  const [movies, cinemas, people] = await Promise.all([getMovieTitleCache(), getCinemaNameCache(), getPersonNameCache()])
  const ner = extractEntitiesHierarchical(rawMessage)

  return {
    msg,
    bookingRef: ner.bookingRef || null,
    roomType: ner.roomType || null,
    paymentMethod: ner.paymentMethod || null,
    seatCount: ner.seatCount ?? null,
    priceAmount: ner.priceAmount ?? null,
    date: resolveDateEntity(ner),
    movie: findMentionedMovie(msg, movies),        // gazetteer, không phải regex
    cinema: findMentionedCinema(msg, cinemas),      // gazetteer, không phải regex
    person: findMentionedPerson(msg, people),       // gazetteer, không phải regex
    anaphora: hasAnaphora(msg),
  }
}

// ─────────────────────────────────────────────
// LAYER 2 — CONTEXT MEMORY
// ─────────────────────────────────────────────
async function buildContext(history = []) {
  const [movies, cinemas] = await Promise.all([getMovieTitleCache(), getCinemaNameCache()])
  const context = { movie: null, cinema: null, date: null, turnCount: 0 }

  context.turnCount = history.filter((h) => h.role === "user").length

  for (let i = history.length - 1; i >= 0; i--) {
    const text = history[i]?.content || ""
    if (!context.movie) {
      const m = findMentionedMovie(text, movies)
      if (m) context.movie = m
    }
    if (!context.cinema) {
      const c = findMentionedCinema(text, cinemas)
      if (c) context.cinema = c
    }
    if (!context.date) {
      const d = extractDate(text)
      if (d) context.date = d
    }
    if (context.movie && context.cinema && context.date) break
  }

  return context
}

// ─────────────────────────────────────────────
// LAYER 3 — MOOD CLASSIFICATION (Naive Bayes)
// Model được huấn luyện 1 LẦN từ moodMap rồi cache lại (moodMap là dữ liệu
// tĩnh import từ controller, không đổi khi server đang chạy).
// ─────────────────────────────────────────────
let cachedModel = null
let cachedMoodMapRef = null

// Câu kiểu "đang vui NHƯNG muốn xem phim buồn" — vế sau "nhưng"/"nhưng mà" mới
// là điều người dùng THỰC SỰ muốn, vế trước chỉ là trạng thái hiện tại bị phủ
// định/đảo ngược. Nếu đưa cả câu vào Naive Bayes, từ khoá "vui" ở vế trước và
// "buồn" ở vế sau cùng góp phần chấm điểm ngang nhau, dễ khiến hệ thống chọn
// nhầm sang mood của vế bị phủ định (vd trả lời gợi ý phim hài trong khi
// người dùng vừa nói rõ muốn xem phim buồn). Chỉ lấy phần SAU từ nối tương
// phản để chấm điểm, bỏ qua vế trước.
const CONTRAST_MARKERS = ["nhưng mà", "nhưng", "tuy nhiên"]
function stripBeforeContrast(msg) {
  for (const marker of CONTRAST_MARKERS) {
    const idx = msg.lastIndexOf(marker)
    if (idx !== -1) return msg.slice(idx + marker.length)
  }
  return msg
}

// Cụm "không thích X" / "không muốn xem X" / "đừng gợi ý X" / "ghét X" — khác
// với phủ định 1-từ-liền-kề kiểu "không hay" (đã xử lý ở
// sentimentAnalysis.service.js), ở đây từ mood-trigger thật sự (X, vd "hành
// động") thường nằm SAU cụm phủ định vài từ, không liền kề. Không xử lý thì
// "mình KHÔNG THÍCH phim hành động, có phim gì nhẹ nhàng hơn không" vẫn bị
// tính điểm cho "hành động" y như thể người dùng đang XIN thể loại đó — gợi ý
// ngược hoàn toàn với điều họ vừa nói rõ là không muốn. Xoá cả cụm từ điểm
// phủ định tới dấu câu gần nhất (thay vì chỉ 1 từ) để loại sạch nội dung bị
// từ chối khỏi tập từ chấm điểm mood.
const DISLIKE_CLAUSE_PATTERNS = [
  /không\s+thích\s+[^,.!?;]*/g,
  /không\s+muốn\s+xem\s+[^,.!?;]*/g,
  /không\s+muốn\s+[^,.!?;]*/g,
  /đừng\s+gợi\s*ý\s+[^,.!?;]*/g,
  /ghét\s+[^,.!?;]*/g,
]
function stripDislikedClauses(msg) {
  let result = msg
  for (const re of DISLIKE_CLAUSE_PATTERNS) result = result.replace(re, " ")
  return result
}

function classifyMood(msg, moodMap) {
  if (cachedMoodMapRef !== moodMap) {
    cachedModel = trainNaiveBayes(moodMap)
    cachedMoodMapRef = moodMap
  }
  const cleaned = stripDislikedClauses(stripBeforeContrast(msg))
  const result = classifyNaiveBayes(cachedModel, cleaned)
  return result ? result.mood : null
}

// Giữ tên cũ `scoreMoods` làm alias để không phải sửa lại nơi gọi trong controller
function scoreMoods(msg, moodMap) {
  return classifyMood(msg, moodMap)
}

module.exports = {
  normalize,
  tokenize,
  tokenizeForClassification,
  // Naive Bayes
  trainNaiveBayes,
  classifyNaiveBayes,
  classifyMood,
  scoreMoods,
  // Hierarchical Regex NER
  extractEntitiesHierarchical,
  resolveDateEntity,
  NER_TIERS,
  // Gazetteer + tổng hợp
  extractEntities,
  extractDate,
  findMentionedMovie,
  findAllMentionedMovies,
  findMentionedCinema,
  findMentionedPerson,
  hasAnaphora,
  buildContext,
  getMovieTitleCache,
  getCinemaNameCache,
  getPersonNameCache,
}
