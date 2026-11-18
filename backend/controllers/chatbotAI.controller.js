/**
 * AI Chatbot Controller
 * Cung cấp các function handlers để AI gọi database thực
 */

const { pool } = require("../config/database");
const geminiService = require("../services/geminiAI.service");
const { getChatbotConfig, updateChatbotConfig, maskKey, demLuotGoiHomNay, demLuotGoiTheoModel, MODELS_GOI_Y } = require("../services/chatbotConfig.service");
const nlu = require("../services/chatbotNLU.service");
const movieKNN = require("../services/movieKNN.service");
const textDistance = require("../services/textDistance.service");
const markov = require("../services/intentMarkovChain.service");
const sentimentAnalysis = require("../services/sentimentAnalysis.service");
const ChatInteraction = require("../models/ChatInteraction");
const { formatLocalDateString } = require("../utils/dateUtils");

// Định dạng tiền giống HỆT frontend (formatVND trong lib/utils.ts) — trước
// đây chatbot tự ghép chuỗi "...đ" (chữ "đ" thường, không khoảng trắng),
// trong khi card hiển thị cùng lúc trong tin nhắn lại dùng ký hiệu tiền tệ
// thật "₫" (có khoảng trắng) → 2 kiểu định dạng giá khác nhau ngay trong
// cùng 1 tin nhắn, nhìn thiếu chuyên nghiệp.
function formatVND(amount) {
  return (Number(amount) || 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" })
}

// Nhận diện câu hỏi lọc phim theo THỜI LƯỢNG: "phim dài trên 2 tiếng", "phim
// ngắn dưới 90 phút", "phim ngắn nhất/dài nhất đang chiếu"
function parseDurationFilter(msg) {
  if (/ngắn nhất/.test(msg)) return { superlative: "shortest" }
  if (/dài nhất/.test(msg)) return { superlative: "longest" }
  const m = msg.match(/(không quá|tối đa|dưới|kém|ít hơn|trên|hơn|quá)\s*(\d+(?:[.,]\d+)?)\s*(tiếng|giờ|h(?=[\s,.!?;:]|$)|phút|p(?=[\s,.!?;:]|$))/)
  if (!m) return null
  const dir = /không quá|tối đa|dưới|kém|ít hơn/.test(m[1]) ? "lt" : "gt"
  let minutes = parseFloat(m[2].replace(",", "."))
  // So sánh CHÍNH XÁC đơn vị bắt được, không dùng .test() dạng substring — chữ
  // "phút" chứa sẵn ký tự "h" (p-h-út) nên regex /h/ khớp nhầm cả "phút".
  if (m[3] === "tiếng" || m[3] === "giờ" || m[3] === "h") minutes *= 60
  return { dir, minutes: Math.round(minutes) }
}

// Câu "phim buồn" là yêu cầu THỂ LOẠI trực tiếp (phim tâm lý/bi kịch khiến
// rơi nước mắt) — KHÁC HẲN "tôi đang buồn"/"tôi buồn quá" (tự mô tả cảm xúc
// hiện tại). MOOD_MAP cố tình gợi ý phim HÀI cho trường hợp tự mô tả cảm xúc
// (để giải toả tâm trạng), nhưng cả 2 câu đều chứa từ "buồn" nên Naive Bayes
// mood classifier (chỉ nhận từ khoá, không phân biệt "tự mô tả" hay "xin thể
// loại") xếp NHẦM "phim buồn" vào cùng nhóm với "tôi đang buồn" → gợi ý phim
// hài, ngược hoàn toàn với điều người dùng vừa yêu cầu tường minh. Bắt riêng
// mẫu "phim (...) buồn" để ưu tiên đúng ý định thể loại trước khi rơi vào
// Naive Bayes mood classifier.
// "muốn khóc"/"cần khóc một trận" — cùng bản chất YÊU CẦU THỂ LOẠI tường minh
// như "phim buồn" (xin phim để khóc/giải toả, không phải tự mô tả tâm trạng
// hiện tại), nên gộp chung vào đây thay vì để lọt xuống Naive Bayes mood
// classifier (vốn không phân biệt được "xin thể loại" và "tự mô tả cảm xúc").
function isExplicitSadMovieRequest(msg) {
  return /phim\s+(khá |hơi |rất |thật |càng )?buồn\b/.test(msg)
    || /muốn khóc|cần khóc|khóc một trận|khóc thật nhiều|xem.{0,10}cho khóc/.test(msg)
}

// "sinh nhật" của TRẺ NHỎ (con/cháu/em bé) hoàn toàn khác "sinh nhật" của bản
// thân/người yêu (dịp lãng mạn/kỷ niệm) — nhưng MOOD_MAP tier "dịp đặc biệt"
// (Romance/Drama) có tới 6 pattern đều chứa chữ "sinh nhật"/"kỷ niệm", nên bộ
// phân loại Naive Bayes (bag-of-words, không phân biệt được NGỮ CẢNH ai đang
// có sinh nhật) rất dễ chấm nhầm câu hỏi hộ con/cháu vào tier lãng mạn — kiểm
// chứng trực tiếp: "sinh nhật con gái tôi hôm nay xem phim gì được" ra gợi ý
// đầu tiên là **Titanic** (phim tình cảm bi kịch người lớn), hoàn toàn không
// phù hợp cho tiệc sinh nhật của một đứa trẻ. Bắt riêng tổ hợp "sinh nhật" +
// từ chỉ trẻ nhỏ để ép về đúng tier "gia đình" (Animation/Fantasy/Adventure),
// tương tự cách isExplicitSadMovieRequest() đã tách "phim buồn" ra khỏi mood
// classifier chung khi ý định thật sự tường minh hơn bag-of-words có thể phân biệt.
function isChildBirthdayRequest(msg) {
  return /sinh nhật/.test(msg) && /\b(con|cháu|bé|con trai|con gái|em bé)\b/.test(msg)
}

// Cú pháp hỏi tìm phim theo diễn viên (vd "phim nào có Tom Cruise đóng", "Tom
// Cruise đóng phim gì", "diễn viên X") — dùng CHUNG ở cả fallbackResponse (bước
// 9a2, trả lời thật) LẪN classifyIntentForMarkov (gán đúng nhãn "movie_info"
// thay vì "default" cho phân tích/Markov), tránh 2 nơi tự viết regex riêng rồi
// lệch nhau dần theo thời gian khi 1 bên được sửa mà quên sửa bên kia.
const ACTOR_QUERY_PATTERNS = [
  /phim\s+(?:nào|gì)\s+có\s+(.+?)\s+đóng\b/i,
  /^\s*(.+?)\s+đóng\s+phim\s+(?:gì|nào)\b/i,
  /diễn viên\s+(.+?)(?:\s+đóng\s+phim.*)?$/i,
]
function matchActorQuerySyntax(message) {
  for (const re of ACTOR_QUERY_PATTERNS) {
    const m = message.match(re)
    if (m) return m
  }
  return null
}

// Nhận diện câu hỏi lọc phim theo GIÁ VÉ: "phim nào dưới 100k", "vé trên 200k",
// "phim rẻ nhất/đắt nhất" (superlative — đối xứng với parseDurationFilter đã
// hỗ trợ "ngắn nhất"/"dài nhất", trước đây giá vé thiếu khả năng này dù cùng
// 1 kiểu câu hỏi rất tự nhiên "phim nào rẻ nhất").
function parsePriceFilter(msg) {
  if (/(giá\s*)?rẻ nhất/.test(msg)) return { superlative: "cheapest" }
  // "đắt nhất" luôn rõ nghĩa về GIÁ (không cần từ "giá" đi kèm), nhưng "cao
  // nhất" một mình quá mơ hồ (vd "rating cao nhất"/"điểm cao nhất" không hề
  // liên quan tới giá vé) — chỉ coi là hỏi giá khi "cao nhất" đi kèm rõ chữ
  // "giá" ngay trước, tránh khớp nhầm sang câu hỏi đánh giá/rating.
  if (/đắt nhất|giá\s*(vé\s*)?cao nhất/.test(msg)) return { superlative: "priciest" }
  const m = msg.match(/(không quá|tối đa|dưới|rẻ hơn|ít hơn|trên|hơn|quá)\s*(\d+(?:[.,]\d+)?)\s*(k(?=[\s,.!?;:]|$)|nghìn|ngàn|đồng|vnd|₫)/i)
  if (!m) return null
  const dir = /không quá|tối đa|dưới|rẻ hơn|ít hơn/.test(m[1]) ? "lt" : "gt"
  let amount = parseFloat(m[2].replace(",", "."))
  if (/k$|nghìn|ngàn/i.test(m[3])) amount *= 1000
  return { dir, amount: Math.round(amount) }
}

// Nhận diện câu hỏi lọc COMBO/ĐỒ ĂN theo GIÁ: "combo nào rẻ nhất", "có đồ ăn
// nào dưới 50k không". BẮT BUỘC có từ khoá combo/đồ ăn mới xét — parsePriceFilter
// (lọc PHIM theo giá vé) đã dùng đúng cùng regex số tiền không cần chữ "phim"
// đi kèm, nên nếu không giới hạn ngữ cảnh combo ở đây, "dưới 50k" một mình có
// thể bị parsePriceFilter "cướp" mất, trả lời sai chủ đề (tìm phim thay vì tìm combo).
function parseComboPriceFilter(msg) {
  if (!/combo|bắp|nước ngọt|đồ ăn|snack|popcorn/.test(msg)) return null
  if (/rẻ nhất/.test(msg)) return { superlative: "cheapest" }
  if (/đắt nhất/.test(msg)) return { superlative: "priciest" }
  const m = msg.match(/(không quá|tối đa|dưới|rẻ hơn|ít hơn|trên|hơn|quá)\s*(\d+(?:[.,]\d+)?)\s*(k(?=[\s,.!?;:]|$)|nghìn|ngàn|đồng|vnd|₫)/i)
  if (!m) return null
  const dir = /không quá|tối đa|dưới|rẻ hơn|ít hơn/.test(m[1]) ? "lt" : "gt"
  let amount = parseFloat(m[2].replace(",", "."))
  if (/k$|nghìn|ngàn/i.test(m[3])) amount *= 1000
  return { dir, amount: Math.round(amount) }
}

// Nhận diện câu hỏi lọc SUẤT CHIẾU theo KHUNG GIỜ trong ngày: "có suất buổi
// tối không", "suất sáng sớm", "suất chiếu muộn nhất tối nay" (superlative,
// đối xứng với parseDurationFilter/parsePriceFilter). Bắt buộc dùng cụm "buổi
// X"/"suất X" (không dùng chữ "tối"/"sáng" đứng 1 mình) để KHÔNG đụng độ với
// relativeDate NER đã xử lý "tối nay"/"hôm nay" (khác ý nghĩa — đó là NGÀY,
// còn đây là KHUNG GIỜ trong ngày).
function parseTimeOfDayFilter(msg) {
  if (/sớm nhất/.test(msg)) return { superlative: "earliest", label: "sớm nhất" }
  if (/muộn nhất/.test(msg)) return { superlative: "latest", label: "muộn nhất" }
  if (/buổi sáng|sáng sớm/.test(msg)) return { start: "05:00", end: "12:00", label: "buổi sáng" }
  if (/buổi trưa/.test(msg)) return { start: "11:00", end: "13:30", label: "buổi trưa" }
  if (/buổi chiều/.test(msg)) return { start: "13:00", end: "18:00", label: "buổi chiều" }
  if (/buổi tối|suất tối|chiếu tối/.test(msg)) return { start: "18:00", end: "22:00", label: "buổi tối" }
  // label chỉ "khuya" (không phải "suất khuya") — cả 2 câu trả lời dùng label
  // này đều đã tự thêm sẵn chữ "suất" phía trước ("Suất chiếu {label}" / "suất
  // chiếu nào {label}"), nếu label cũng có "suất" sẽ đọc lặp từ kỳ cục
  // ("Suất chiếu suất khuya").
  if (/suất khuya|đêm khuya|chiếu khuya/.test(msg)) return { start: "22:00", end: "23:59", label: "khuya" }

  // Giờ cụ thể: "khoảng 21h", "lúc 21 giờ", "suất 9h tối". Nhánh AI hiểu được nhờ
  // tham số timeOfDay, còn nhánh luật cứng trước đây bỏ qua hẳn vế giờ nên trả
  // nguyên lịch chiếu cả ngày. Lấy khung ±1 tiếng quanh giờ người dùng nói.
  // Bỏ qua nếu đang hỏi THỜI LƯỢNG phim ("phim dưới 2 giờ") — số giờ ở đó không
  // phải giờ chiếu.
  if (/dài|thời lượng|tiếng/.test(msg)) return null
  const gio = msg.match(/(\d{1,2})\s*(?:h|giờ)/)
  if (gio) {
    let h = Number(gio[1])
    if (/tối|đêm/.test(msg) && h <= 12) h += 12
    if (h >= 0 && h <= 23) {
      // Hỏi "21h" thì ưu tiên suất TỪ 21h trở đi (21:00–22:59), không lùi về 20h
      // như trước — người hỏi 21h đêm mà nhận gợi ý 20:05 là sai ý.
      const hai = (n) => String(Math.min(23, Math.max(0, n))).padStart(2, "0")
      return { start: hai(h) + ":00", end: hai(h + 1) + ":59", label: "từ " + h + "h" }
    }
  }
  return null
}

// ─────────────────────────────────────────────
// DATABASE FUNCTION HANDLERS
// ─────────────────────────────────────────────

// dùng chung ở MỌI nơi cần sắp phim theo độ phổ biến — cùng lý do đã sửa ở
// getPopularMoviesDB: KHÔNG sắp theo movies.popularity_score (cột chết, luôn
// 0.00 cho mọi phim vì không có code nào từng UPDATE nó), tính điểm phổ biến
// thật ngay trong query từ vé bán/yêu thích thật. Nhận `movieIdRef` vì mỗi
// nơi gọi alias bảng movies khác nhau (không alias / "m" / "movies").
function popularityJoinSql(movieIdRef) {
  return `
    LEFT JOIN (
      SELECT s.movie_id, COUNT(t.id) AS ticket_count
      FROM showtimes s JOIN tickets t ON t.showtime_id = s.id
      WHERE t.booking_status = 'confirmed'
      GROUP BY s.movie_id
    ) tc ON tc.movie_id = ${movieIdRef}
    LEFT JOIN (
      SELECT movie_id, COUNT(*) AS favorite_count FROM favorites GROUP BY movie_id
    ) fc ON fc.movie_id = ${movieIdRef}
  `;
}
const POPULARITY_ORDER_EXPR = `(COALESCE(tc.ticket_count,0)*3 + COALESCE(fc.favorite_count,0)*2 + COALESCE(average_rating,0)*COALESCE(rating_count,0)) DESC, average_rating DESC`;
// Giữ tên cũ cho 2 chỗ gọi bên dưới đã viết sẵn (movies không alias)
const POPULARITY_JOIN_SQL = popularityJoinSql("movies.id");
const POPULARITY_ORDER_SQL = `ORDER BY ${POPULARITY_ORDER_EXPR}`;

async function searchMoviesDB({ query, status = "all" }) {
  let sql = `
    SELECT movies.id, title, poster_url, rating, duration, status,
           genre, release_date, description, director, \`cast\`,
           average_rating, rating_count, popularity_score
    FROM movies
    ${POPULARITY_JOIN_SQL}
    WHERE (
      title LIKE ? OR description LIKE ? OR genre LIKE ? OR \`cast\` LIKE ? OR director LIKE ?
      -- Gõ liền không dấu cách/gạch ngang (vd "spiderman") không khớp LIKE với
      -- tên thật "Spider-Man: ..." vì dấu "-" chặn giữa — so khớp thêm bản đã
      -- bỏ hết dấu cách/gạch ngang ở cả cột lẫn từ khoá.
      OR REPLACE(REPLACE(title, '-', ''), ' ', '') LIKE REPLACE(?, ' ', '')
    )
  `;
  const p = [...Array(5).fill(`%${query}%`), `%${query}%`];

  if (status !== "all") {
    sql += " AND status = ?";
    p.push(status);
  }

  sql += POPULARITY_ORDER_SQL + " LIMIT 8";
  const [rows] = await pool.query(sql, p);
  return { movies: rows, count: rows.length };
}

// QUAN TRỌNG: KHÔNG sắp theo cột movies.popularity_score — cột này có trong
// bảng nhưng KHÔNG CÓ chỗ nào trong toàn bộ code base từng UPDATE nó (đã
// grep xác nhận; hàm Movie.updatePopularityScore() có tồn tại nhưng không
// ai gọi), nên nó đứng yên ở giá trị mặc định 0.00 cho MỌI phim mãi mãi —
// "phim hot nhất" trước đây thực chất chỉ đang sắp theo average_rating (vì
// popularity_score luôn hoà 0 nên tie-break mới là yếu tố quyết định thật).
// Tính điểm phổ biến TRỰC TIẾP từ dữ liệu thật ngay trong query này (vé đã
// bán thật + lượt yêu thích thật + điểm đánh giá thật), không dùng cột chết.
async function getPopularMoviesDB({ status = "NOW_SHOWING", limit = 5 } = {}) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 5, 10));
  let sql = `
    SELECT m.id, m.title, m.poster_url, m.rating, m.duration, m.status,
           m.genre, m.release_date, m.average_rating, m.rating_count, m.popularity_score,
           COALESCE(tc.ticket_count, 0) AS real_ticket_count,
           COALESCE(fc.favorite_count, 0) AS real_favorite_count
    FROM movies m
    LEFT JOIN (
      SELECT s.movie_id, COUNT(t.id) AS ticket_count
      FROM showtimes s JOIN tickets t ON t.showtime_id = s.id
      WHERE t.booking_status = 'confirmed'
      GROUP BY s.movie_id
    ) tc ON tc.movie_id = m.id
    LEFT JOIN (
      SELECT movie_id, COUNT(*) AS favorite_count FROM favorites GROUP BY movie_id
    ) fc ON fc.movie_id = m.id
    WHERE 1=1
  `;
  const p = [];
  if (status !== "all") {
    sql += " AND m.status = ?";
    p.push(status);
  }
  // Vé bán thật là tín hiệu mạnh nhất (x3), yêu thích thật (x2), điểm đánh
  // giá thật nhân số lượt đánh giá để phim "1 người chấm 5 sao" không thắng
  // phim thật sự được nhiều người đánh giá cao — cùng tinh thần "không có
  // dữ liệu giả" đã áp dụng cho ShowtimeGeneratorService trước đó.
  sql += `
    ORDER BY (
      COALESCE(tc.ticket_count, 0) * 3 +
      COALESCE(fc.favorite_count, 0) * 2 +
      COALESCE(m.average_rating, 0) * COALESCE(m.rating_count, 0)
    ) DESC, m.average_rating DESC
    LIMIT ${safeLimit}
  `;
  const [rows] = await pool.query(sql, p);

  // TỔNG số phim khớp điều kiện — KHÁC với số phim trả về sau LIMIT.
  // Trước đây hàm chỉ trả `count: rows.length` và chỗ gọi dùng luôn con số đó
  // để nói "Đang có N phim đang chiếu"; nhưng rows.length luôn bằng limit (8),
  // nên chatbot khẳng định "đang có 8 phim đang chiếu" trong khi web thực tế có
  // 31. Sai lệch kiểu này nguy hiểm vì câu trả lời nghe rất trôi chảy, không ai
  // nghĩ tới việc đi kiểm chứng con số.
  const [[tong]] = await pool.query(
    `SELECT COUNT(*) n FROM movies m${status !== "all" ? " WHERE m.status = ?" : ""}`,
    status !== "all" ? [status] : [],
  );

  return {
    movies: rows,
    count: rows.length,  // số phim đang hiển thị trong danh sách này
    total: tong.n,       // TỔNG số phim khớp điều kiện trong hệ thống
  };
}

// Tách riêng khỏi getPopularMoviesDB (sắp theo popularity_score — vé bán/yêu
// thích/baseline, KHÔNG phải điểm đánh giá) — trước đây câu hỏi "phim rating
// cao nhất" bị gộp chung vào nhánh "phim hot" nên trả về danh sách sắp theo
// độ PHỔ BIẾN thay vì ĐIỂM ĐÁNH GIÁ thật, 2 thứ tự này có thể khác hẳn nhau
// (phim ít người xem nhưng ai xem cũng chấm điểm cao). Chỉ tính phim có ÍT
// NHẤT 1 lượt đánh giá thật (rating_count > 0) để không xếp phim 0 đánh giá
// lên đầu chỉ vì average_rating mặc định không phải NULL.
async function getTopRatedMoviesDB({ status = "NOW_SHOWING", limit = 5 } = {}) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 5, 10));
  let sql = `
    SELECT id, title, poster_url, rating, duration, status,
           genre, release_date, average_rating, rating_count, popularity_score
    FROM movies
    WHERE rating_count > 0
  `;
  const p = [];
  if (status !== "all") {
    sql += " AND status = ?";
    p.push(status);
  }
  sql += ` ORDER BY average_rating DESC, rating_count DESC LIMIT ${safeLimit}`;
  const [rows] = await pool.query(sql, p);
  return { movies: rows, count: rows.length };
}

// dir: "gt" (dài hơn/trên) hoặc "lt" (ngắn hơn/dưới); minutes: null khi lấy
// phim ngắn nhất/dài nhất (superlative) thay vì so sánh với 1 mốc cụ thể
async function searchMoviesByDurationDB({ dir, minutes, superlative }) {
  let sql = `
    SELECT movies.id, title, poster_url, rating, duration, status, genre, release_date,
           average_rating, rating_count, popularity_score
    FROM movies
    ${popularityJoinSql("movies.id")}
    WHERE status = 'NOW_SHOWING'
  `;
  const p = [];
  if (minutes != null) {
    sql += dir === "gt" ? " AND duration > ?" : " AND duration < ?";
    p.push(minutes);
  }
  sql += superlative === "shortest" ? " ORDER BY duration ASC" : superlative === "longest" ? " ORDER BY duration DESC" : ` ORDER BY ${POPULARITY_ORDER_EXPR}`;
  sql += " LIMIT 8";
  const [rows] = await pool.query(sql, p);
  return { movies: rows, count: rows.length };
}

// Phim không có "giá cố định" (giá phụ thuộc suất chiếu/loại phòng) — lọc theo
// phim có ÍT NHẤT 1 suất chiếu thoả điều kiện giá (gt: trên mốc, lt: dưới mốc),
// hoặc sắp theo giá thấp nhất/cao nhất khi hỏi "rẻ nhất"/"đắt nhất" (superlative).
async function searchMoviesByPriceDB({ dir, amount, superlative }) {
  let sql = `
    SELECT m.id, m.title, m.poster_url, m.rating, m.duration, m.status, m.genre,
           m.release_date, m.average_rating, m.rating_count, m.popularity_score,
           MIN(s.price) as min_price, MAX(s.price) as max_price
    FROM movies m
    JOIN showtimes s ON s.movie_id = m.id
    ${popularityJoinSql("m.id")}
    WHERE m.status = 'NOW_SHOWING' AND s.show_date >= CURDATE()
    GROUP BY m.id
  `;
  const p = [];
  if (!superlative) {
    sql += ` HAVING ${dir === "gt" ? "MAX(s.price) > ?" : "MIN(s.price) < ?"}`;
    p.push(amount);
  }
  // tc/fc đã tự GROUP BY movie_id nên về logic là hằng số cho mỗi phim, nhưng
  // vẫn phải bọc MAX() vì sql_mode=only_full_group_by không tự suy ra được
  // phụ thuộc hàm qua JOIN (chỉ tự suy ra được với cột GỐC của bảng đã có
  // trong GROUP BY, ở đây là m.id) — thiếu MAX() sẽ lỗi ngay khi chạy thật.
  sql += superlative === "cheapest" ? " ORDER BY min_price ASC"
    : superlative === "priciest" ? " ORDER BY max_price DESC"
    : " ORDER BY (MAX(COALESCE(tc.ticket_count,0))*3 + MAX(COALESCE(fc.favorite_count,0))*2 + m.average_rating*m.rating_count) DESC, m.average_rating DESC";
  sql += " LIMIT 8";
  const [rows] = await pool.query(sql, p);
  return { movies: rows, count: rows.length };
}

async function getPersonalizedRecommendationsDB({ limit = 5 } = {}, userId) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 5, 10));

  if (!userId) {
    const data = await getPopularMoviesDB({ status: "NOW_SHOWING", limit: safeLimit });
    return { ...data, personalized: false };
  }

  // Thể loại user xem nhiều nhất dựa trên vé đã xác nhận.
  // Cột genre lưu nhiều thể loại gộp chung (vd "Action, Adventure") nên tách
  // riêng từng thể loại rồi cộng dồn số lần xem để xếp hạng cho chính xác.
  const [ticketGenreRows] = await pool.query(
    `SELECT m.genre
     FROM tickets t
     JOIN showtimes s ON t.showtime_id = s.id
     JOIN movies m ON s.movie_id = m.id
     WHERE t.user_id = ? AND t.booking_status = 'confirmed'`,
    [userId]
  );

  if (ticketGenreRows.length === 0) {
    const data = await getPopularMoviesDB({ status: "NOW_SHOWING", limit: safeLimit });
    return { ...data, personalized: false };
  }

  const genreCount = new Map();
  for (const row of ticketGenreRows) {
    for (const g of (row.genre || "").split(",").map((g) => g.trim()).filter(Boolean)) {
      genreCount.set(g, (genreCount.get(g) || 0) + 1);
    }
  }
  const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  if (topGenres.length === 0) {
    const data = await getPopularMoviesDB({ status: "NOW_SHOWING", limit: safeLimit });
    return { ...data, personalized: false };
  }

  // Phim đã xem rồi (kèm đầy đủ field để dựng vector đặc trưng), tránh gợi ý lại
  // popularity_score được TÍNH LẠI TỪ DỮ LIỆU THẬT (alias đè lên tên cột cũ)
  // thay vì đọc thẳng cột chết — xem giải thích đầy đủ ở popularityJoinSql().
  // Quan trọng hơn cả 4 chỗ đã sửa trước đó: 2 query này cấp dữ liệu trực
  // tiếp cho movieKNN.service.js dùng làm 1 CHIỀU trong vector đặc trưng so
  // sánh KNN (gợi ý cá nhân hoá) — nếu vẫn đọc cột chết, chiều "độ phổ biến"
  // trong TOÀN BỘ thuật toán KNN sẽ luôn bằng 0 cho mọi phim (kể cả phim đã
  // xem lẫn phim ứng viên), coi như thuật toán chỉ còn so khớp theo thể
  // loại/đánh giá/thời lượng — mất hẳn 1 chiều dữ liệu mà không ai biết.
  const [watchedRows] = await pool.query(
    `SELECT DISTINCT m.id, m.title, m.genre, m.average_rating, m.duration,
            (COALESCE(tc.ticket_count,0)*3 + COALESCE(fc.favorite_count,0)*2 + COALESCE(m.average_rating,0)*COALESCE(m.rating_count,0)) AS popularity_score
     FROM tickets t
     JOIN showtimes s ON t.showtime_id = s.id
     JOIN movies m ON s.movie_id = m.id
     ${popularityJoinSql("m.id")}
     WHERE t.user_id = ? AND t.booking_status = 'confirmed'`,
    [userId]
  );
  const watchedIds = watchedRows.map((r) => r.id);
  const genreLikeClause = topGenres.map(() => "genre LIKE ?").join(" OR ")
  const excludeClause = watchedIds.length > 0 ? `AND id NOT IN (${watchedIds.map(() => "?").join(",")})` : "";

  // Lấy 1 tập ứng viên rộng hơn limit cuối cùng (cùng nhóm thể loại quan tâm
  // nhất) rồi dùng KNN (Euclidean Distance) xếp hạng lại theo độ giống tổng
  // thể (thể loại + độ phổ biến + đánh giá + thời lượng) với "vector sở
  // thích" của user — thay vì chỉ sort thô theo popularity/rating như cũ.
  const [candidateRows] = await pool.query(
    `SELECT movies.id, title, poster_url, rating, duration, status, genre, release_date,
            average_rating, rating_count,
            (COALESCE(tc.ticket_count,0)*3 + COALESCE(fc.favorite_count,0)*2 + COALESCE(average_rating,0)*COALESCE(rating_count,0)) AS popularity_score
     FROM movies
     ${popularityJoinSql("movies.id")}
     WHERE status = 'NOW_SHOWING' AND (${genreLikeClause}) ${excludeClause}
     ORDER BY popularity_score DESC, average_rating DESC
     LIMIT ${safeLimit * 4}`,
    [...topGenres.map((g) => `%${g}%`), ...watchedIds]
  );

  if (candidateRows.length === 0) {
    const data = await getPopularMoviesDB({ status: "NOW_SHOWING", limit: safeLimit });
    return { ...data, personalized: false };
  }

  const ranked = movieKNN.recommendByKNN(watchedRows, candidateRows, safeLimit);
  const rows = ranked.length ? ranked : candidateRows.slice(0, safeLimit);

  return { movies: rows, count: rows.length, personalized: true, basedOnGenres: topGenres };
}

async function getRoomPricingDB() {
  const [rows] = await pool.query(`
    SELECT r.room_type,
           MIN(s.price) as min_price, MAX(s.price) as max_price, ROUND(AVG(s.price)) as avg_price
    FROM showtimes s
    JOIN rooms r ON s.room_id = r.id
    WHERE s.show_date >= CURDATE()
    GROUP BY r.room_type
    ORDER BY avg_price ASC
  `);
  return { roomPricing: rows };
}

async function getMovieDetailsDB({ movieId }) {
  const [rows] = await pool.query(
    `SELECT id, title, description, poster_url, banner_url, trailer_url,
            rating, duration, release_date, genre, director, \`cast\`,
            language, status, average_rating, rating_count, popularity_score
     FROM movies WHERE id = ?`,
    [movieId]
  );
  if (!rows.length) throw new Error(`Không tìm thấy phim ID ${movieId}`);

  const movie = rows[0];

  // Lấy thêm các suất chiếu sắp tới
  const [showtimes] = await pool.query(
    `SELECT s.id, s.show_date, s.show_time, s.price, s.available_seats,
            c.name as cinema, r.room_name, r.room_type
     FROM showtimes s
     JOIN cinemas c ON s.cinema_id = c.id
     LEFT JOIN rooms r ON s.room_id = r.id
     WHERE s.movie_id = ? AND s.show_date >= CURDATE() AND (s.show_date > CURDATE() OR s.show_time > CURTIME()) AND s.status = 'ACTIVE'
     ORDER BY s.show_date, s.show_time LIMIT 6`,
    [movieId]
  );

  return { movie, upcomingShowtimes: showtimes };
}

// Suất ĐÃ CHIẾU trong hôm nay không phải là suất "sắp tới". Trước đây chỉ lọc
// show_date >= CURDATE() nên lúc 17h chatbot vẫn trả suất 08:15 sáng cùng ngày.
// Kèm điều kiện suất CÒN BÁN — suất bị huỷ vì sự cố (migration 44) vẫn là
// "chưa chiếu" nhưng chatbot tuyệt đối không được gợi ý cho khách đặt.
const CHUA_CHIEU_SQL = "(s.show_date > CURDATE() OR (s.show_date = CURDATE() AND s.show_time > CURTIME())) AND s.status = 'ACTIVE'";

// Khung giờ theo BUỔI — khớp đúng mô tả trong FUNCTION_DECLARATIONS.getShowtimesByTimeOfDay
const KHUNG_GIO_TRONG_NGAY = {
  morning:   ["00:00:00", "11:59:59"],
  afternoon: ["12:00:00", "16:59:59"],
  evening:   ["17:00:00", "20:59:59"],
  night:     ["21:00:00", "23:59:59"],
};

async function getShowtimesDB({ movieTitle, date, cinemaName } = {}) {
  let sql = `
    SELECT s.id, m.id as movie_id, m.title, m.poster_url, m.rating as age_rating,
           c.id as cinema_id, c.name as cinema, c.location,
           s.show_date, s.show_time, s.price, s.available_seats, s.total_seats,
           r.room_name, r.room_type
    FROM showtimes s
    JOIN movies m ON s.movie_id = m.id
    JOIN cinemas c ON s.cinema_id = c.id
    LEFT JOIN rooms r ON s.room_id = r.id
    WHERE 1=1
  `;
  const p = [];

  if (movieTitle) { sql += " AND m.title LIKE ?"; p.push(`%${movieTitle}%`); }
  if (date)       { sql += " AND s.show_date = ?"; p.push(date); }
  else            { sql += " AND s.show_date >= CURDATE()"; }
  if (cinemaName) { sql += " AND c.name LIKE ?"; p.push(`%${cinemaName}%`); }
  sql += ` AND ${CHUA_CHIEU_SQL}`;

  sql += " ORDER BY s.show_date, s.show_time LIMIT 15";
  const [rows] = await pool.query(sql, p);
  return { showtimes: rows, count: rows.length };
}

// Giống getShowtimesDB nhưng lọc thêm theo KHUNG GIỜ trong ngày (start/end,
// vd "18:00".."22:00" cho buổi tối) hoặc lấy suất sớm/muộn nhất (superlative)
// — dùng cho parseTimeOfDayFilter() ở fallbackResponse.
async function getShowtimesByTimeOfDayDB({ movieTitle, date, cinemaName, timeOfDay, start, end, superlative } = {}) {
  // Nhánh AI gửi timeOfDay ("evening"/"night"...), nhánh luật cứng gửi sẵn
  // start/end. Trước đây hàm CHỈ đọc start/end nên mọi câu hỏi theo buổi đi qua
  // AI đều mất bộ lọc giờ — hỏi "suất khoảng 21h" vẫn trả suất 08:15.
  if ((!start || !end) && KHUNG_GIO_TRONG_NGAY[timeOfDay]) {
    [start, end] = KHUNG_GIO_TRONG_NGAY[timeOfDay];
  }
  let sql = `
    SELECT s.id, m.id as movie_id, m.title, m.poster_url, m.rating as age_rating,
           c.id as cinema_id, c.name as cinema, c.location,
           s.show_date, s.show_time, s.price, s.available_seats, s.total_seats,
           r.room_name, r.room_type
    FROM showtimes s
    JOIN movies m ON s.movie_id = m.id
    JOIN cinemas c ON s.cinema_id = c.id
    LEFT JOIN rooms r ON s.room_id = r.id
    WHERE 1=1
  `;
  const p = [];

  if (movieTitle) { sql += " AND m.title LIKE ?"; p.push(`%${movieTitle}%`); }
  if (date)       { sql += " AND s.show_date = ?"; p.push(date); }
  else            { sql += " AND s.show_date >= CURDATE()"; }
  if (cinemaName) { sql += " AND c.name LIKE ?"; p.push(`%${cinemaName}%`); }
  if (start && end) { sql += " AND s.show_time BETWEEN ? AND ?"; p.push(start, end); }
  sql += ` AND ${CHUA_CHIEU_SQL}`;

  sql += superlative === "earliest" ? " ORDER BY s.show_date, s.show_time ASC"
    : superlative === "latest" ? " ORDER BY s.show_date, s.show_time DESC"
    : " ORDER BY s.show_date, s.show_time";
  sql += " LIMIT 15";
  const [rows] = await pool.query(sql, p);
  return { showtimes: rows, count: rows.length };
}

async function getCinemasDB({ location } = {}) {
  let sql = `
    SELECT c.id, c.name, c.location,
           GROUP_CONCAT(DISTINCT r.room_type ORDER BY r.room_type SEPARATOR ', ') as room_types,
           COUNT(DISTINCT r.id) as room_count
    FROM cinemas c
    LEFT JOIN rooms r ON r.cinema_id = c.id
    WHERE 1=1
  `;
  const p = [];
  if (location) { sql += " AND c.location LIKE ?"; p.push(`%${location}%`); }
  sql += " GROUP BY c.id ORDER BY c.name";

  const [rows] = await pool.query(sql, p);
  return { cinemas: rows, count: rows.length };
}

async function getPricingDB({ type = "all" } = {}) {
  const result = {};

  if (type === "tickets" || type === "all") {
    const [[priceRow]] = await pool.query(`
      SELECT MIN(price) as min_price, MAX(price) as max_price, ROUND(AVG(price)) as avg_price
      FROM showtimes WHERE show_date >= CURDATE()
    `);
    result.tickets = {
      ...priceRow,
      // Giá trả về ở đây là giá GỐC của suất chiếu (= giá ghế thường, vé người
      // lớn). Phải nói rõ còn phụ thuộc VỊ TRÍ GHẾ, nếu không khách xem giá ở
      // chatbot rồi tới bước chọn ghế VIP/Premium sẽ thấy đắt hơn và tưởng bị
      // tính sai.
      note: "Đây là giá ghế thường, vé người lớn. Giá thực tế còn thay đổi theo loại phòng (Standard < VIP < IMAX < 4DX), suất chiếu (ban ngày < tối cuối tuần), vị trí ghế (thường < VIP +20% < Premium +35%) và loại vé (học sinh-sinh viên/trẻ em/cao tuổi được giảm)",
    };
  }

  if (type === "combos" || type === "all") {
    const [combos] = await pool.query(
      "SELECT id, name, description, price, category FROM combos WHERE is_available = 1 ORDER BY price"
    );
    result.combos = combos;
  }

  return result;
}

// Dùng cho parseComboPriceFilter() — lọc combo/đồ ăn theo mức giá cụ thể hoặc
// lấy combo rẻ nhất/đắt nhất (superlative), đối xứng với searchMoviesByPriceDB
// nhưng cho bảng combos thay vì suất chiếu phim.
async function searchCombosByPriceDB({ dir, amount, superlative }) {
  let sql = `SELECT id, name, description, price, category FROM combos WHERE is_available = 1`;
  const p = [];
  if (!superlative) {
    sql += ` AND price ${dir === "gt" ? ">" : "<"} ?`;
    p.push(amount);
  }
  sql += superlative === "priciest" ? " ORDER BY price DESC" : " ORDER BY price ASC";
  sql += " LIMIT 8";
  const [rows] = await pool.query(sql, p);
  return { combos: rows, count: rows.length };
}

// Ngày chiếu CUỐI CÙNG hiện có trong lịch của 1 phim (chỉ tính suất SẮP TỚI,
// không tính suất đã qua) — dùng cho câu hỏi "phim này còn chiếu tới khi nào".
// Đây là ngày lịch đã tạo TỚI THỜI ĐIỂM HỎI, không phải cam kết ngày phim
// chính thức ngừng chiếu (lịch có thể được tạo/gia hạn thêm sau đó).
async function getLastShowtimeDateDB({ movieId }) {
  const [[row]] = await pool.query(
    `SELECT MAX(show_date) as last_date FROM showtimes WHERE movie_id = ? AND show_date >= CURDATE()`,
    [movieId]
  );
  return { lastDate: row.last_date || null };
}

async function getBookingByReferenceDB({ reference }) {
  const [rows] = await pool.query(
    `SELECT t.id, t.booking_reference, t.booking_status, t.payment_status,
            t.total_amount, t.combo_total, t.created_at, t.paid_at,
            m.title as movie, m.poster_url,
            c.name as cinema, c.location,
            s.show_date, s.show_time, s.price as seat_price,
            r.room_name, r.room_type,
            (SELECT GROUP_CONCAT(ts2.seat_code ORDER BY ts2.seat_code SEPARATOR ', ')
             FROM ticket_seats ts2 WHERE ts2.ticket_id = t.id) as seats
     FROM tickets t
     JOIN showtimes s ON t.showtime_id = s.id
     JOIN movies m ON s.movie_id = m.id
     JOIN cinemas c ON s.cinema_id = c.id
     LEFT JOIN rooms r ON s.room_id = r.id
     WHERE t.booking_reference = ?`,
    [reference]
  );

  if (!rows.length) {
    return { error: `Không tìm thấy đơn đặt vé với mã "${reference}". Vui lòng kiểm tra lại mã (bắt đầu bằng BK).` };
  }
  return { booking: rows[0] };
}

async function getUserBookingsDB({ status = "all", limit = 5 } = {}, userId) {
  if (!userId) {
    return { error: "Bạn chưa đăng nhập. Vui lòng đăng nhập để xem lịch sử đặt vé." };
  }

  const safeLimit = Math.min(parseInt(limit) || 5, 20);
  let sql = `
    SELECT t.id, t.booking_reference, t.booking_status, t.payment_status,
           t.total_amount, t.created_at,
           m.title as movie, m.poster_url,
           c.name as cinema, s.show_date, s.show_time,
           (SELECT GROUP_CONCAT(ts2.seat_code ORDER BY ts2.seat_code SEPARATOR ', ')
            FROM ticket_seats ts2 WHERE ts2.ticket_id = t.id) as seats
    FROM tickets t
    JOIN showtimes s ON t.showtime_id = s.id
    JOIN movies m ON s.movie_id = m.id
    JOIN cinemas c ON s.cinema_id = c.id
    WHERE t.user_id = ?
  `;
  const p = [userId];

  if (status !== "all") { sql += " AND t.booking_status = ?"; p.push(status); }
  sql += ` ORDER BY t.created_at DESC LIMIT ${safeLimit}`;

  const [rows] = await pool.query(sql, p);
  return { bookings: rows, count: rows.length };
}

/** Tìm phim theo tên diễn viên/đạo diễn CHÍNH XÁC (đã nhận diện qua gazetteer
 * findMentionedPerson, không phải chuỗi người dùng gõ tự do) — đáng tin hơn
 * search chung ở 9b vì search chung LIKE cả câu làm 1 khối, dễ trượt khi câu
 * có thêm tên phim/từ khác đứng cạnh tên người (vd "phim The Dark Knight có
 * Tom Cruise đóng không" → cleanQuery gồm cả cụm tên phim lẫn tên người, LIKE
 * theo cả cụm sẽ không khớp cột cast dù Tom Cruise không có trong phim đó). */
async function searchMoviesByPersonDB({ name }) {
  const [rows] = await pool.query(
    `SELECT movies.id, title, poster_url, rating, duration, status, genre, release_date,
            director, \`cast\`, average_rating, rating_count, popularity_score
     FROM movies
     ${POPULARITY_JOIN_SQL}
     WHERE \`cast\` LIKE ? OR director LIKE ?
     ${POPULARITY_ORDER_SQL} LIMIT 8`,
    [`%${name}%`, `%${name}%`],
  );
  return { movies: rows, count: rows.length };
}

// ─────────────────────────────────────────────
// HANDLER FACTORY (nhận userId để personalize)
// ─────────────────────────────────────────────
function buildHandlers(userId = null) {
  return {
    searchMovies:        (args) => searchMoviesDB(args),
    getPopularMovies:    (args) => getPopularMoviesDB(args),
    getTopRatedMovies:   (args) => getTopRatedMoviesDB(args),
    searchMoviesByDuration: (args) => searchMoviesByDurationDB(args),
    searchMoviesByPrice: (args) => searchMoviesByPriceDB(args),
    searchCombosByPrice: (args) => searchCombosByPriceDB(args),
    getLastShowtimeDate: (args) => getLastShowtimeDateDB(args),
    searchMoviesByPerson: (args) => searchMoviesByPersonDB(args),
    getPersonalizedRecommendations: (args) => getPersonalizedRecommendationsDB(args, userId),
    getMovieDetails:     (args) => getMovieDetailsDB(args),
    getShowtimes:        (args) => getShowtimesDB(args),
    getShowtimesByTimeOfDay: (args) => getShowtimesByTimeOfDayDB(args),
    getCinemas:          (args) => getCinemasDB(args),
    getPricing:          (args) => getPricingDB(args),
    getRoomPricing:      () => getRoomPricingDB(),
    getBookingByReference: (args) => getBookingByReferenceDB(args),
    getUserBookings:     (args) => getUserBookingsDB(args, userId),
    // Điểm thật trên IMDb / Rotten Tomatoes / Metacritic — lấy từ Internet lúc hỏi
    searchWebReviews:    (args) => require("../services/movieWebRatings.service").traDiemTrenMang(args),
  };
}

// ─────────────────────────────────────────────
// MOOD / CONTEXT MAPPING
// Dùng genre LIKE để tìm phim phù hợp tâm trạng
// ─────────────────────────────────────────────
const MOOD_MAP = [
  {
    // "mệt" liệt kê THÊM riêng bên cạnh "mệt mỏi" (không thay thế) — bộ phân
    // loại tâm trạng giờ so khớp CẢ CỤM nguyên văn (xem chatbotNLU.service.js
    // classifyNaiveBayes), không còn tự động nhận diện qua từng từ lẻ tách từ
    // 1 cụm nữa (tránh khớp nhầm như "nhà" tách từ "ở nhà"). Nhưng "mệt" một
    // mình (vd "mệt xỉu", "mệt quá", "hôm nay mệt ghê") vẫn LUÔN mang nghĩa
    // "mệt mỏi" rõ ràng trong tiếng Việt, không mơ hồ như "nhà"/"con"/"anh" —
    // nên cố tình thêm làm 1 pattern ĐỘC LẬP để không mất tín hiệu thật này.
    patterns: ["buồn", "cô đơn", "chán", "mệt", "mệt mỏi", "stress", "áp lực", "thất vọng", "nản"],
    genres: ["Comedy", "Animation", "Romance"],
    reply: "😊 Khi tâm trạng không tốt, những bộ phim vui nhộn sẽ giúp bạn cười và quên đi nỗi buồn:",
    suggestion: "Phim hài hoặc hoạt hình sẽ là liều thuốc tinh thần tuyệt vời! 🌈",
  },
  {
    patterns: ["mưa", "lạnh", "ở nhà", "thư giãn", "cozy", "nghỉ ngơi", "cuộn tròn", "ấm cúng"],
    genres: ["Thriller", "Drama", "Mystery", "Sci-Fi"],
    reply: "🌧️ Ngày mưa xem phim tâm lý hay thriller — cảm giác đúng chất:",
    suggestion: "Pha trà nóng, cuộn chăn và thưởng thức phim thôi! ☕",
  },
  {
    // CỐ TÌNH bỏ "yêu" đứng 1 mình (dù ngữ nghĩa gốc đúng là tín hiệu lãng
    // mạn) — khác với lớp lỗi "từ mảnh vỡ" mà trainNaiveBayes() đã né được
    // (coi cụm nhiều từ là 1 token nguyên vẹn), đây là 1 lớp lỗi RIÊNG: "yêu"
    // vốn dĩ LÀ 1 từ đơn hợp lệ trong tiếng Việt, nhưng lại là 1 phần của rất
    // nhiều từ/cụm KHÔNG liên quan tình cảm (nổi bật nhất: "yêu cầu" = request/
    // đòi hỏi — cực kỳ phổ biến trong ngữ cảnh hỗ trợ/đặt vé, vd "tôi có yêu
    // cầu nhỏ", "yêu cầu hoàn tiền"). Vì tokenize tách theo khoảng trắng,
    // "yêu" trong "yêu cầu" khớp y hệt "yêu" trong vocab, khiến Naive Bayes
    // chấm nhầm hàng loạt câu không hề liên quan thành tâm trạng lãng mạn
    // (kiểm chứng trực tiếp: "tôi có một yêu cầu nhỏ" -> gợi ý **Titanic**).
    // "tình yêu"/"người yêu" (cụm 2 từ, đã đủ bao phủ tín hiệu thật) vẫn giữ
    // nguyên vì chỉ khớp khi user gõ ĐÚNG cả cụm, không bị "yêu cầu" chạm tới.
    patterns: ["bạn gái", "bạn trai", "hẹn hò", "lãng mạn", "couple", "valentine", "tình yêu", "người yêu"],
    genres: ["Romance", "Comedy"],
    reply: "❤️ Phim lãng mạn dành cho buổi hẹn hò ý nghĩa:",
    suggestion: "Những bộ phim tình cảm sẽ làm buổi hẹn hò thêm đặc biệt! 🌹",
  },
  {
    patterns: ["gia đình", "trẻ em", "con cái", "bé", "cả nhà", "bố mẹ", "con nít", "bé con"],
    genres: ["Animation", "Fantasy", "Adventure"],
    reply: "👨‍👩‍👧 Phim dành cho cả gia đình xem cùng nhau:",
    suggestion: "Phim hoạt hình và phiêu lưu — cả nhà đều thích! 🎠",
  },
  {
    patterns: ["hành động", "gay cấn", "kịch tính", "súng", "đánh nhau", "chiến đấu", "bắn súng", "phim xịn"],
    genres: ["Action", "Thriller"],
    reply: "💥 Phim hành động cực kịch tính đang chiếu:",
    suggestion: "Rạp lớn, âm thanh to, xem hành động mới đã! 🎬",
  },
  {
    patterns: ["kinh dị", "ma", "sợ", "rùng mình", "horror", "ám ảnh", "hù", "mà ma"],
    genres: ["Horror", "Thriller", "Mystery"],
    reply: "👻 Muốn rùng mình? Đây là các phim kinh dị/hồi hộp:",
    suggestion: "Xem ban đêm với đèn tắt mới đã! 🌙",
  },
  {
    patterns: ["cười", "hài", "vui vẻ", "funny", "comedy", "vui", "haha"],
    genres: ["Comedy", "Animation"],
    reply: "😂 Phim hài đảm bảo làm bạn cười không ngừng:",
    suggestion: "Cười vỡ bụng với những bộ phim này! 😄",
  },
  {
    patterns: ["viễn tưởng", "vũ trụ", "robot", "tương lai", "sci-fi", "khoa học", "ngoài không gian", "siêu anh hùng", "marvel", "dc"],
    genres: ["Sci-Fi", "Action", "Fantasy"],
    reply: "🚀 Phim khoa học viễn tưởng và siêu anh hùng:",
    suggestion: "Những thế giới tương lai siêu đỉnh! 🌌",
  },
  {
    patterns: ["phiêu lưu", "khám phá", "mạo hiểm", "adventure"],
    genres: ["Adventure", "Action", "Fantasy"],
    reply: "🗺️ Phim phiêu lưu và khám phá hấp dẫn:",
    suggestion: "Thế giới rộng lớn đang chờ bạn khám phá! 🌍",
  },
  {
    patterns: ["cuối tuần", "ngày nghỉ", "rảnh", "không biết xem gì", "giải trí", "xem gì hay"],
    genres: ["Action", "Comedy", "Adventure"],
    reply: "🎬 Gợi ý phim hot cho ngày nghỉ của bạn:",
    suggestion: "Cuối tuần vui vẻ với những bộ phim này! 🎉",
  },
  {
    patterns: ["nhẹ nhàng", "tâm lý", "cảm xúc", "sâu sắc", "ý nghĩa", "drama"],
    genres: ["Drama", "Romance"],
    reply: "🎭 Phim tâm lý sâu sắc và đầy cảm xúc:",
    suggestion: "Những bộ phim giàu cảm xúc sẽ để lại ấn tượng mãi mãi! ✨",
  },
  {
    // Đi chơi/tụ tập với HỘI BẠN — khác "gia đình" (có trẻ nhỏ) và "hẹn hò"
    // (lãng mạn 2 người), nhóm bạn đông thường hợp phim giải trí, cười to,
    // hành động kịch tính để cả nhóm cùng hào hứng.
    patterns: ["đi với bạn bè", "hội bạn thân", "tụ tập bạn bè", "đi chơi với bạn", "nhóm bạn", "hẹn bạn bè"],
    genres: ["Action", "Comedy", "Adventure"],
    reply: "🎉 Đi với hội bạn thì phải chọn phim đã mắt, đã tai — cười to hoặc gay cấn cùng nhau:",
    suggestion: "Rạp lớn, cả nhóm cùng hét cùng cười mới vui! 🍿",
  },
  {
    // Dịp đặc biệt (sinh nhật/kỷ niệm) — KHÁC "hẹn hò" thông thường ở chỗ đây
    // là dịp trọng đại hơn, thiên về phim cảm xúc sâu/lãng mạn đáng nhớ hơn là
    // chỉ "vui vẻ" đơn thuần.
    patterns: ["kỷ niệm ngày yêu", "kỷ niệm ngày cưới", "sinh nhật", "kỷ niệm", "dịp đặc biệt", "anniversary"],
    genres: ["Romance", "Drama"],
    reply: "🎂 Dịp đặc biệt thì nên xem phim thật đáng nhớ:",
    suggestion: "Một bộ phim cảm xúc sẽ làm ngày đặc biệt này trọn vẹn hơn! 💝",
  },
  {
    // Mới chia tay/thất tình — KHÁC nhóm "buồn" chung chung: đây là 1 kiểu
    // buồn ĐẶC THÙ (mất mát tình cảm), lời thoại thấu cảm hơn nên tách riêng
    // thay vì dùng chung câu trả lời "buồn/mệt mỏi" ở nhóm đầu tiên.
    patterns: ["mới chia tay", "vừa chia tay", "thất tình", "chia tay người yêu", "bị đá"],
    genres: ["Comedy", "Animation"],
    reply: "💔 Chia tay ai cũng buồn cả — để mấy bộ phim này giúp bạn cười lại nhé:",
    suggestion: "Cho phép bản thân cười thật to, mọi chuyện rồi sẽ ổn thôi! 🌈",
  },
  {
    // Muốn giải trí ĐƠN GIẢN, không cần động não — dùng cụm đa từ RIÊNG (không
    // tái dùng từ đơn "mệt" đã thuộc nhóm buồn/mệt mỏi ở trên) để tránh model
    // Naive Bayes nhầm lẫn giữa 2 nhóm nghĩa khác nhau của cùng 1 từ.
    patterns: ["không cần suy nghĩ nhiều", "giải trí đơn giản thôi", "xem cho vui không cần não", "không muốn xem phim nặng", "phim nhẹ đầu"],
    genres: ["Action", "Comedy"],
    reply: "🍿 Hiểu rồi, không cần suy nghĩ gì cả — cứ ngồi xem cho vui thôi:",
    suggestion: "Phim giải trí nhẹ nhàng, xem xong nhẹ cả đầu! 😄",
  },
  {
    // Ngày lễ/Tết — khác "cuối tuần" (nghỉ thường xuyên) ở chỗ đây là dịp lễ
    // lớn, thường đi theo cả gia đình nhiều thế hệ nên ưu tiên phim ai xem
    // cũng hợp thay vì phim kén người xem.
    patterns: ["ngày lễ", "nghỉ lễ", "tết", "dịp tết", "lễ tết"],
    genres: ["Animation", "Comedy", "Adventure"],
    reply: "🧧 Ngày lễ cả nhà cùng xem thì nên chọn phim ai cũng hợp gu:",
    suggestion: "Phim hoạt hình/hài — người lớn trẻ nhỏ đều thích! 🎊",
  },
];

// Stopword dùng để làm sạch câu hỏi trước khi tìm phim mờ (bước 9b bên dưới)
// — hoist ra module scope thay vì khai báo trong thân hàm fallbackResponse,
// tránh regex bị biên dịch lại từ nguồn mỗi lượt chat rơi vào nhánh tìm mờ.
// An toàn khi dùng chung 1 object /g cho nhiều lượt gọi .replace() liên tiếp:
// theo spec, String.replace tự reset lastIndex=0 khi bắt đầu mỗi lần gọi.
const FUZZY_SEARCH_STOPWORDS = /(?:^|(?<=[\s,.!?;:]))(xem|phim|gì đó|gì|cho tôi biết|cho|tôi|mình|bạn|hôm nay|hôm qua|ngày|muốn|nên|thì|hay|có|không|làm sao|được|để|thích|nhé|nha|ạ|ơi|à|ừ|vậy|biết|thêm|về|chi tiết|thông tin)(?=[\s,.!?;:]|$)/g;

// ─────────────────────────────────────────────
// FAQ tĩnh — kiến thức nền tảng (đồng bộ với SYSTEM_INSTRUCTION của AI)
// để fallback rule-based cũng trả lời được khi AI hết quota
// ─────────────────────────────────────────────
const FAQ_RULES = [
  {
    patterns: ["đặt vé như thế nào", "cách đặt vé", "hướng dẫn đặt vé", "đặt vé thế nào", "mua vé như thế nào"],
    reply: "🎟️ **Cách đặt vé tại CinemaGold:**\n1. Đăng nhập tài khoản\n2. Chọn phim muốn xem\n3. Chọn rạp và suất chiếu\n4. Chọn ghế ngồi\n5. (Tuỳ chọn) thêm combo bắp nước\n6. Thanh toán và nhận vé điện tử\n\nBạn muốn mình gợi ý phim đang chiếu để bắt đầu không? 😊",
  },
  {
    // Trước đây nói có cả "tiền mặt tại rạp" — KHÔNG đúng, hệ thống chỉ chấp
    // nhận 'vnpay'/'momo' khi đặt vé online (xem paymentController.js validate
    // payment_method), không có lựa chọn tiền mặt nào trong luồng đặt vé thật.
    // Cùng lỗi đã sửa ở trang /payment-guide trước đó — chatbot bị bỏ sót.
    patterns: ["thanh toán bằng gì", "phương thức thanh toán", "hình thức thanh toán", "trả tiền bằng", "vnpay", "momo", "trả tiền mặt", "thanh toán tiền mặt", "trả bằng tiền mặt", "thẻ tín dụng", "thẻ ngân hàng", "quẹt thẻ", "trả bằng thẻ", "thanh toán bằng thẻ"],
    reply: "💳 CinemaGold hỗ trợ thanh toán online qua **VNPay** (thẻ ATM/Visa/Mastercard/ví VNPay) và **MoMo** (quét QR). Vé điện tử sẽ được gửi ngay sau khi thanh toán thành công. Hệ thống hiện **chưa hỗ trợ thanh toán tiền mặt** trực tiếp trên web.",
  },
  {
    patterns: ["giữ ghế bao lâu", "giữ ghế trong", "ghế bị mất", "hết thời gian giữ ghế", "khoá ghế"],
    reply: "⏱️ Ghế bạn chọn sẽ được **giữ trong 15 phút** để hoàn tất thanh toán. Sau thời gian này, ghế tự động được mở lại cho người khác nếu bạn chưa thanh toán xong.",
  },
  {
    patterns: ["chọn nhầm ghế", "chọn sai ghế", "đổi ghế được không", "muốn đổi ghế khác", "bỏ chọn ghế"],
    reply: "💺 Trước khi thanh toán, bạn chỉ cần **bấm lại vào ghế đó** để bỏ chọn, rồi chọn ghế khác — chưa thanh toán thì đổi ghế thoải mái. Sau khi đã thanh toán xong thì không tự đổi ghế được nữa, cần liên hệ tổng đài/nhân viên rạp để được hỗ trợ.",
  },
  {
    patterns: ["đặt tối đa", "tối đa bao nhiêu ghế", "mua được mấy vé", "giới hạn ghế", "giới hạn vé"],
    reply: "🎫 Mỗi lượt đặt vé tối đa **10 ghế**. Nếu nhóm bạn đông hơn, có thể tách thành nhiều lượt đặt riêng.",
  },
  {
    // Trước đây tier này gộp chung "huỷ vé" VÀ "đổi vé" rồi trả lời "chưa hỗ
    // trợ tự huỷ/đổi" — SAI với thực tế: trang "Vé của tôi" có nút "Hủy vé"
    // thật (gọi cancelMyTicket -> Ticket.cancelById), tự đánh dấu hoàn tiền
    // nếu vé đã thanh toán, KHÔNG cần liên hệ tổng đài. Tách riêng "huỷ vé"
    // (đã hỗ trợ) khỏi "đổi vé" (chưa hỗ trợ — không có API đổi sang suất
    // khác) để không tiếp tục trả lời sai sự thật cho câu hỏi huỷ vé.
    patterns: ["huỷ vé", "hủy vé", "hoàn tiền", "hoàn lại tiền", "hoàn lại", "refund"],
    reply: "↩️ Bạn có thể **tự huỷ vé** trong mục **\"Vé của tôi\"** — bấm nút **\"Hủy vé\"** trên vé muốn huỷ, miễn là còn cách giờ chiếu **ít nhất 2 tiếng**. Nếu vé đã thanh toán, hệ thống sẽ tự động đánh dấu **hoàn tiền**. Lưu ý: sau khi huỷ sẽ không khôi phục lại được, và không thể huỷ khi đã sát giờ chiếu (dưới 2 tiếng) — lúc đó bạn liên hệ tổng đài để được hỗ trợ.",
  },
  {
    patterns: ["đổi vé", "đổi suất chiếu", "đổi sang suất khác", "đổi ngày xem phim", "chuyển suất chiếu"],
    reply: "🔄 Hiện hệ thống **chưa hỗ trợ đổi vé sang suất chiếu khác** trực tiếp trên web. Nếu muốn xem suất khác, bạn có thể **huỷ vé hiện tại** (tự hoàn tiền nếu đã thanh toán) rồi đặt vé cho suất mới nhé!",
  },
  {
    patterns: ["loại phòng", "phòng chiếu có gì", "imax là gì", "4dx là gì", "vip là gì"],
    reply: "🎬 CinemaGold có 4 loại phòng chiếu:\n- **Standard**: phòng thường, giá tốt\n- **VIP**: ghế rộng, ngả lưng thoải mái\n- **IMAX**: màn hình khổng lồ, âm thanh sống động\n- **4DX**: ghế chuyển động, hiệu ứng mô phỏng theo phim\n\nPhòng cao cấp hơn sẽ có giá cao hơn tương ứng. Hỏi mình \"giá phòng VIP\" để xem giá cụ thể nhé!",
  },
  {
    // Câu hỏi mới nảy sinh sau khi hệ thống thêm phụ phí cuối tuần thật vào
    // giá vé (WEEKEND_PRICE_MODIFIER trong ShowtimeGeneratorService) — trước
    // đây chỉ suất tối mới đắt hơn, giờ cuối tuần cũng nhích giá thêm ~10%.
    patterns: ["tại sao giá vé cuối tuần cao hơn", "sao giá vé thứ 7 cao hơn", "sao giá vé chủ nhật đắt", "giá vé cuối tuần đắt hơn", "vì sao giá vé không giống nhau", "giá vé sao mỗi ngày khác nhau", "sao mỗi ghế một giá", "vì sao ghế khác giá"],
    reply: "📈 Giá vé trên CinemaGold thay đổi theo 4 yếu tố: **loại phòng** (Standard < VIP < IMAX < 4DX), **khung giờ** (suất tối 18h-23h cao hơn ban ngày), **cuối tuần** (Thứ 6 tối, Thứ 7, Chủ nhật nhích thêm khoảng 10%) và **vị trí ghế** (Ghế thường ở hàng đầu → Ghế VIP hàng giữa +20% → Ghế Premium hàng cuối +35%). Bảng giá từng hạng ghế hiện ngay dưới sơ đồ chọn ghế, và mỗi hạng được tô một màu riêng để bạn dễ nhìn.",
  },
  {
    // CẬP NHẬT theo ràng buộc độ tuổi THẬT vừa được áp dụng ở bước chọn loại
    // vé (backend/utils/ticketPricing.js): phim PG-13 khoá vé Trẻ em, phim R
    // khoá cả vé Trẻ em lẫn Học sinh - Sinh viên. Câu trả lời cũ nói R là "từ
    // 17 tuổi trở lên HOẶC có người lớn đi cùng" — nay không còn đúng: hệ thống
    // chặn cứng theo loại vé chứ không có ngoại lệ "đi cùng người lớn".
    patterns: ["phù hợp trẻ em", "trẻ em xem được không", "bao nhiêu tuổi xem được", "phân loại độ tuổi", "pg là gì", "pg-13 là gì", "r là gì", "sao không chọn được vé trẻ em", "vé trẻ em bị khoá"],
    reply: "🔖 **Phân loại độ tuổi phim trên CinemaGold:**\n- **PG**: Mọi lứa tuổi, nên có người lớn hướng dẫn với trẻ nhỏ — chọn được **mọi loại vé**\n- **PG-13**: Từ **13 tuổi** trở lên — **không chọn được vé Trẻ em**\n- **R**: Từ **18 tuổi** trở lên — **không chọn được vé Trẻ em và vé Học sinh - Sinh viên**\n\nỞ bước chọn loại vé, những loại không đủ tuổi sẽ bị khoá sẵn kèm ghi chú, nên bạn không lo chọn nhầm. Nhãn phân loại hiện ngay dưới tên phim (badge cạnh thời lượng) nhé!",
  },
  {
    // Trước đây gộp chung với câu hỏi voucher/vé sinh viên rồi trả lời "chưa
    // có chương trình giảm giá" — SAI với thực tế hiện tại: hệ thống ĐÃ có mã
    // giảm giá thật (bảng vouchers, validate lúc thanh toán) và giá vé phân
    // theo đối tượng thật (người lớn/sinh viên/trẻ em/cao tuổi). Tách riêng
    // câu hỏi "giảm giá nhóm" (KHÔNG có, chỉ là đặt nhiều ghế cùng lượt) khỏi
    // 2 câu hỏi còn lại để không tiếp tục trả lời sai sự thật.
    patterns: ["giảm giá nhóm", "ưu đãi nhóm", "đặt vé nhóm", "vé theo nhóm", "đi đông có giảm giá không", "công ty đặt vé"],
    reply: "👥 CinemaGold hiện **chưa có chương trình giảm giá riêng cho nhóm/đoàn**. Mỗi lượt đặt vé tối đa 10 ghế — nhóm đông hơn có thể tách thành nhiều lượt đặt. Nếu có mã giảm giá (voucher), bạn vẫn áp dụng được bình thường cho từng lượt đặt nhé!",
  },
  {
    // Tier riêng cho ưu đãi sinh nhật — phải đứng TRƯỚC tier voucher chung ở
    // dưới vì cả 2 đều match "voucher"/"mã giảm giá", nhưng câu hỏi có từ
    // "sinh nhật" cần trả lời đúng cơ chế đặc thù (theo tháng sinh, mã cố định
    // HAPPYBIRTHDAY, tự làm mới mỗi năm) thay vì câu trả lời voucher chung chung.
    patterns: ["ưu đãi sinh nhật", "voucher sinh nhật", "mã sinh nhật", "quà sinh nhật", "giảm giá sinh nhật", "khuyến mãi sinh nhật", "sinh nhật được giảm", "tháng sinh nhật có ưu đãi"],
    reply: "🎂 CinemaGold có **ưu đãi sinh nhật** dành riêng cho bạn! Chỉ cần khai **ngày sinh** trong mục **Hồ sơ cá nhân**, tới đúng **tháng sinh nhật**, bạn sẽ dùng được mã **HAPPYBIRTHDAY** để giảm 20% (tối đa 50.000đ) khi đặt vé. Mã này dùng được **1 lần mỗi năm**, tự làm mới vào tháng sinh nhật năm sau. Nếu chưa khai ngày sinh, vào Hồ sơ cá nhân cập nhật ngay để không bỏ lỡ nhé!",
  },
  {
    patterns: ["có khuyến mãi", "có ưu đãi", "mã giảm giá", "voucher", "coupon", "nhập mã giảm giá", "áp dụng mã", "mã khuyến mãi"],
    reply: "🎟️ CinemaGold **có hỗ trợ mã giảm giá**! Ở bước thanh toán, bạn sẽ thấy ô **\"Nhập mã giảm giá\"** — nhập mã và bấm **\"Áp dụng\"** để trừ tiền trực tiếp vào đơn. Mỗi mã có điều kiện riêng (đơn tối thiểu, số lần dùng...) nên nếu báo lỗi, bạn kiểm tra lại điều kiện của mã đó nhé. Theo dõi các dịp lễ/sự kiện để nhận mã mới! Có sinh nhật tháng này? Hỏi mình \"ưu đãi sinh nhật\" để biết thêm nhé 🎂",
  },
  {
    patterns: ["giảm giá sinh viên", "vé sinh viên", "ưu đãi sinh viên", "vé học sinh", "vé trẻ em", "giá vé trẻ em", "vé người cao tuổi", "giảm giá người già", "ưu đãi cao tuổi", "phân loại vé", "loại vé nào", "có cần mang giấy tờ", "xuất trình giấy tờ"],
    reply: "🎫 Khi đặt vé, ở bước thanh toán bạn chọn loại vé cho **từng ghế**: **Người lớn** (giá gốc), **Học sinh - Sinh viên** (giảm ~15%), **Trẻ em** (giảm ~40%), **Người cao tuổi** (giảm ~30%). Giá từng ghế tự cập nhật ngay khi bạn chọn.\n\n⚠️ Hai lưu ý quan trọng:\n- Loại vé nào **không đủ tuổi xem phim đó sẽ bị khoá sẵn** (vd phim 18+ không chọn được vé Trẻ em hay Học sinh - Sinh viên).\n- Người dùng **tự chịu trách nhiệm chọn đúng loại vé** và **có thể được yêu cầu xuất trình giấy tờ chứng minh tại rạp** khi dùng vé ưu đãi.",
  },
  {
    // Trước đây không có câu trả lời riêng cho "làm sao viết đánh giá" — dễ bị
    // hiểu nhầm sang nhánh XEM điểm đánh giá có sẵn (dòng ~1202). Backend hiện
    // BẮT BUỘC đã mua vé (payment_status='paid') mới được review, nên phải nói
    // rõ điều kiện này, tránh người dùng viết xong bị từ chối mà không hiểu vì sao.
    patterns: ["viết đánh giá", "viết review", "cách đánh giá phim", "làm sao đánh giá phim", "làm sao review phim", "để lại đánh giá", "gửi đánh giá", "chưa xem có đánh giá được không", "review khi chưa xem"],
    reply: "✍️ Bạn có thể viết đánh giá ngay trong trang chi tiết phim (mục \"Viết đánh giá của bạn\"). Lưu ý: bạn cần **đã đặt vé và thanh toán xong cho phim đó** mới đánh giá được — hệ thống chỉ chấp nhận đánh giá từ người đã thực sự mua vé xem phim, để đảm bảo đánh giá đáng tin cậy cho mọi người.",
  },
  {
    patterns: ["khiếu nại", "phản hồi dịch vụ", "vé bị lỗi", "không xem được phim", "thanh toán bị lỗi", "trừ tiền nhưng không có vé", "trừ tiền 2 lần", "trừ tiền hai lần", "bị trừ 2 lần", "bị trừ nhiều lần", "lỗi thanh toán", "góp ý", "web lỗi", "web chậm", "web load chậm", "trang web bị lỗi", "app bị lỗi", "load chậm", "tài khoản bị khoá", "tài khoản bị khóa", "khoá tài khoản", "khóa tài khoản", /tài\s*khoản.{0,15}(khoá|khóa)/, /(khoá|khóa).{0,15}tài\s*khoản/],
    reply: "📞 Rất tiếc về sự bất tiện này! Với các vấn đề về **thanh toán lỗi, vé bị lỗi, tài khoản bị khoá, hoặc khiếu nại dịch vụ**, mình khuyên bạn:\n1. Chụp lại màn hình lỗi (nếu có)\n2. Ghi lại mã đặt vé (nếu đã có)\n3. Liên hệ tổng đài hỗ trợ hoặc nhân viên tại rạp để được xử lý nhanh nhất\n\nBạn có mã đặt vé để mình tra cứu giúp trước không? (gửi mã bắt đầu bằng BK)",
    // Chỉ tier NÀY tự có lời xin lỗi/thấu cảm sẵn trong reply — đánh dấu riêng
    // để applySentimentEmpathy() chỉ bỏ qua câu mở đầu thấu cảm cho ĐÚNG tier
    // này, không phải bất kỳ tier FAQ nào (xem applySentimentEmpathy bên dưới).
    apologizes: true,
  },
  {
    patterns: ["liên hệ", "tổng đài", "số điện thoại", "hotline", "làm sao liên hệ", "email hỗ trợ", "contact"],
    // Tổng đài/email đọc từ trang Cài đặt của admin (trước đây ghi cứng
    // "1900 xxxx") — dùng getter để mỗi lần trả lời lấy giá trị mới nhất.
    get reply() {
      const lines = require("../services/systemSettings.service").contactLinesSync()
      return `📞 Bạn có thể liên hệ CinemaGold qua:\n${lines ? lines + "\n" : ""}- Hoặc hỏi trực tiếp mình ở đây, mình sẽ cố gắng hỗ trợ ngay!\n\nXem thêm tại trang **Liên hệ** trên website nhé.`
    },
  },
  {
    patterns: ["web bảo trì", "website bảo trì", "web có đang bảo trì", "trang web bảo trì", "sập web", "web sập", "web die", "web bị sập"],
    reply: "🟢 CinemaGold hiện đang hoạt động bình thường, bạn có thể đặt vé như bình thường nhé! Nếu bạn vẫn gặp lỗi khi truy cập, thử tải lại trang hoặc kiểm tra kết nối mạng — nếu vẫn còn lỗi, hãy cho mình biết chi tiết để hỗ trợ thêm.",
  },
  // Các tier dưới đây chỉ nêu ĐÚNG những gì hệ thống THẬT SỰ có (đã xác nhận
  // qua code: vé QR trong models/Ticket + ticket-qr-code.tsx, email xác nhận
  // qua services/emailService.js) — KHÔNG bịa thêm chính sách (vd tuổi trẻ em,
  // mang đồ ăn riêng, bãi xe...) mà hệ thống chưa từng lưu trữ/định nghĩa ở
  // đâu cả, để tránh trả lời sai sự thật một cách tự tin.
  {
    patterns: ["vé điện tử là gì", "cần in vé không", "in vé ra giấy", "check vé bằng gì", "quét vé bằng gì", "vé qr", "mã qr vé", "vào rạp cần gì", "ship vé", "giao vé tận nhà", "giao vé tận nơi", "gửi vé về nhà", "nhận vé bằng cách nào", "nhận vé ở đâu"],
    reply: "🎫 Vé của bạn là **vé điện tử (mã QR)** — không cần in ra giấy, cũng không cần giao/ship vé tận nhà. Mở mục **\"Vé của tôi\"** trên điện thoại/máy tính rồi đưa nhân viên quét mã QR tại cửa soát vé là được.",
  },
  {
    patterns: ["có nhận được email không", "email xác nhận", "thông báo đặt vé thành công", "có gửi mail không", "xác nhận qua email"],
    reply: "📧 Có — sau khi thanh toán thành công, hệ thống sẽ gửi ngay **email xác nhận kèm vé điện tử** tới địa chỉ email bạn đã đăng ký. Bạn cũng có thể xem lại vé bất cứ lúc nào trong mục \"Vé của tôi\".",
  },
  {
    patterns: ["có app không", "ứng dụng di động", "app điện thoại", "tải app ở đâu", "có app ios không", "có app android không"],
    reply: "📱 CinemaGold hiện là **website**, chưa có ứng dụng di động riêng. Bạn có thể truy cập bằng trình duyệt trên điện thoại hoặc máy tính đều được, giao diện đã tối ưu cho di động.",
  },
  {
    patterns: ["ghế đôi", "ghế couple", "ghế cho cặp đôi", "ghế liền đôi"],
    reply: "💺 Hiện hệ thống chưa có loại **ghế đôi (couple)** riêng — các phòng đều dùng ghế đơn tiêu chuẩn, gồm hạng Standard/VIP/IMAX/4DX tuỳ phòng.",
  },
  // Tier tài khoản (quên/đổi mật khẩu, đăng ký) — trước đây CHƯA có, dù đây là
  // 2 câu hỏi cực phổ biến ở BẤT KỲ web nào có tài khoản. Nội dung khớp ĐÚNG
  // luồng thật trong authController.js: forgotPassword gửi mã xác thực 6 số
  // qua email (hết hạn sau 15 phút, xem `expiresAt = Date.now() + 15*60*1000`),
  // KHÔNG phải gửi link đặt lại mật khẩu như nhiều web khác — nói đúng để
  // người dùng không ngồi chờ 1 email link không tồn tại.
  {
    patterns: ["quên mật khẩu", "quên password", "khôi phục mật khẩu", "reset mật khẩu", "đặt lại mật khẩu", "không nhớ mật khẩu"],
    reply: "🔑 Bạn vào trang **Quên mật khẩu** (link ngay dưới ô đăng nhập), nhập email đã đăng ký — hệ thống sẽ gửi **mã xác thực 6 số** tới email đó (có hiệu lực **15 phút**). Nhập mã cùng mật khẩu mới (tối thiểu 8 ký tự, có chữ hoa/chữ thường/số/ký tự đặc biệt) là xong.",
  },
  {
    patterns: ["đổi mật khẩu", "thay đổi mật khẩu", "cách đổi mật khẩu"],
    reply: "🔑 Nếu đang đăng nhập, bạn đổi mật khẩu trong mục **Hồ sơ cá nhân**. Nếu đã quên mật khẩu cũ (không đăng nhập được), dùng chức năng **\"Quên mật khẩu\"** ở trang đăng nhập — hỏi mình \"quên mật khẩu\" để biết chi tiết nhé!",
  },
  {
    patterns: ["cách đăng ký", "đăng ký tài khoản", "tạo tài khoản", "làm sao đăng ký", "đăng ký như thế nào", "đăng ký thế nào"],
    reply: "📝 Bạn bấm **\"Đăng ký\"** ở góc trên trang chủ, điền email/họ tên/mật khẩu — hệ thống sẽ gửi **mã xác thực về email** để xác nhận trước khi tạo tài khoản (chống spam/email giả). Nhập đúng mã là tài khoản được kích hoạt ngay, không cần chờ duyệt thủ công.",
  },

  // ── Các luật bổ sung: câu khách hay hỏi mà trước đây rơi hết xuống câu trả
  // lời chung chung. TẤT CẢ đều dựa trên tính năng CÓ THẬT trong hệ thống —
  // không bịa thêm chính sách rạp (đã có tiền lệ chatbot nói sai về "thanh
  // toán tiền mặt", "chưa có voucher"...). Việc gì hệ thống KHÔNG quản lý thì
  // nói thẳng là không quản lý, thay vì để AI tự nghĩ ra chính sách.
  {
    patterns: ["ghế vip khác ghế thường", "ghế vip là gì", "ghế premium là gì", "ngồi hàng nào đẹp", "hàng nào xem đẹp nhất", "nên chọn ghế nào", "ghế nào đẹp", "khác nhau giữa các loại ghế"],
    reply: "💺 Ghế trong phòng chia làm **3 hạng theo vị trí**, mỗi hạng một màu riêng trên sơ đồ chọn ghế:\n- **Ghế thường** — các hàng đầu, gần màn hình nhất, **giá gốc**\n- **Ghế VIP** — các hàng giữa, góc nhìn đẹp nhất, **+20%**\n- **Ghế Premium** — các hàng cuối, rộng rãi và tựa lưng cao, **+35%**\n\nBảng giá cụ thể của từng hạng hiện ngay dưới sơ đồ ghế khi bạn chọn suất chiếu. Muốn xem đẹp nhất thì chọn hàng giữa (Ghế VIP) nhé!",
  },
  {
    // Mẫu để NGẮN, đúng phần lõi — khách hay chèn thêm số/chữ vào giữa
    // ("bé **3 tuổi** có cần mua vé không") làm hỏng phép so khớp chuỗi con.
    patterns: ["trẻ mấy tuổi", "bé mấy tuổi", "trẻ em bao nhiêu tuổi", "có cần mua vé", "phải mua vé", "có tốn vé", "cần mua vé không"],
    reply: "👶 CinemaGold tính vé **theo ghế ngồi**: bé ngồi một ghế riêng thì cần một vé, chọn loại **Trẻ em** (giảm ~40% so với vé người lớn). Hệ thống hiện **không có suất miễn phí cho trẻ nhỏ**, kể cả bé ngồi cùng ghế với bố mẹ vẫn nên đặt đủ ghế cho thoải mái.\n\n⚠️ Lưu ý: nếu phim giới hạn độ tuổi (PG-13 từ 13 tuổi, R từ 18 tuổi) thì **loại vé Trẻ em sẽ bị khoá** — bạn hỏi mình \"phân loại độ tuổi\" để biết thêm nhé!",
  },
  {
    patterns: ["vé điện tử", "mã vé", "mất vé", "không thấy vé", "vé ở đâu", "xem lại vé", "tìm lại vé", "mã đặt vé"],
    reply: "🎟️ Vé của bạn là **vé điện tử**, không cần in ra. Sau khi thanh toán thành công:\n- Vé hiện ngay trong mục **\"Vé của tôi\"** (bấm vào ảnh đại diện góc trên phải)\n- Đồng thời **gửi kèm email xác nhận** tới hòm thư bạn đăng ký\n- Mỗi vé có **mã đặt vé bắt đầu bằng \"BK\"** kèm mã QR để quét tại rạp\n\nLỡ xoá email cũng không sao — vào \"Vé của tôi\" là xem lại được toàn bộ vé đã đặt.",
  },
  {
    patterns: ["phụ đề", "có phụ đề không", "thuyết minh", "lồng tiếng", "phim tiếng gì", "ngôn ngữ phim", "phim nói tiếng gì"],
    reply: "🗣️ Ngôn ngữ và phụ đề của từng phim hiện ngay ở **trang chi tiết phim** (mục thông tin, cạnh đạo diễn/diễn viên). Phần lớn phim nước ngoài trên CinemaGold là **tiếng Anh kèm phụ đề Việt**, một số phim Việt thì nói tiếng Việt trực tiếp. Bạn cứ mở trang phim muốn xem, mình có ghi rõ ở đó nhé!",
  },
  {
    // Trả lời THẲNG THẮN cho những việc hệ thống KHÔNG quản lý, thay vì để AI
    // tự bịa ra chính sách gửi xe/đồ ăn/vào trễ rồi khách tới rạp mới biết sai.
    patterns: ["giữ xe", "gửi xe", "bãi xe", "đỗ xe", "mang đồ ăn", "đồ ăn ngoài", "mang nước vào", "đi trễ", "vào trễ", "đến muộn", "rạp mở cửa mấy giờ", "đóng cửa lúc mấy giờ"],
    reply: "ℹ️ Những việc như **gửi xe, mang đồ ăn từ ngoài vào, vào trễ sau khi phim bắt đầu hay giờ mở/đóng cửa** là quy định riêng của từng rạp, CinemaGold **không quản lý phần này** nên mình không dám trả lời chắc để bạn khỏi đi nhầm. Bạn liên hệ trực tiếp rạp mình định tới (thông tin ở mục **Rạp chiếu**) để được xác nhận chính xác nhé!\n\nCòn về suất chiếu, giá vé, đặt/huỷ vé thì cứ hỏi mình thoải mái 😊",
  },
]

/**
 * Chọn luật FAQ KHỚP SÁT NHẤT thay vì luật khai báo sớm nhất.
 *
 * ĐÂY LÀ THAY ĐỔI PHÒNG NGỪA, KHÔNG PHẢI VÁ LỖI ĐANG XẢY RA: đã kiểm tra toàn
 * bộ mẫu của tất cả luật hiện có, cơ chế .find() cũ trả lời đúng chủ đề cho
 * 100% mẫu — không có mẫu nào bị luật khác "cướp".
 *
 * Lý do vẫn đổi: cơ chế cũ ĐÚNG NHỜ THỨ TỰ KHAI BÁO, một sự phụ thuộc mong
 * manh mà chính code đã phải ghi chú để nhắc nhau ("tier sinh nhật PHẢI đứng
 * TRƯỚC tier voucher chung"). Chỉ cần ai đó sắp xếp lại mảng hoặc chèn thêm
 * một luật chung chung lên đầu là câu trả lời sai mà không ai hay. Chấm theo
 * độ dài MẪU KHỚP DÀI NHẤT ("ưu đãi sinh nhật" 15 ký tự thắng "voucher" 7 ký
 * tự) khiến kết quả không còn phụ thuộc thứ tự — đã kiểm chứng bằng cách đảo
 * ngược toàn bộ mảng luật, câu trả lời vẫn giữ nguyên. Cùng nguyên tắc "cụ
 * thể thắng chung chung" đã áp dụng cho GENRE_BASE_SCORES ở
 * ShowtimeGeneratorService. Hoà điểm thì giữ thứ tự khai báo (ổn định).
 */
function scoreFAQRule(rule, msg) {
  let best = 0
  for (const p of rule.patterns) {
    if (p instanceof RegExp) {
      const m = msg.match(p)
      if (m) best = Math.max(best, m[0].length)
    } else if (msg.includes(p)) {
      best = Math.max(best, p.length)
    }
  }
  return best
}

function findFAQRule(msg) {
  let winner = null
  let winnerScore = 0
  for (const rule of FAQ_RULES) {
    const score = scoreFAQRule(rule, msg)
    if (score > winnerScore) { winner = rule; winnerScore = score }
  }
  return winner
}

function matchFAQ(msg) {
  return findFAQRule(msg)?.reply || null
}

/**
 * Phân loại 1 câu nói thành 1 "ý định" (intent) thuộc danh sách INTENTS của
 * Markov Chain — soi theo ĐÚNG các điều kiện thực tế mà fallbackResponse()
 * dùng để định tuyến (không phải model riêng), để nhãn intent phản ánh đúng
 * hành vi thật của chatbot. Dùng cho cả lượt hiện tại và lượt trước (lấy từ
 * history) để Markov Chain học được chuỗi chuyển ý định thật giữa các lượt.
 */
async function classifyIntentForMarkov(message) {
  const msg = nlu.normalize(message || "")
  if (!msg) return "default"
  if (/^(hi|hello|chào|alo|hey)\b/.test(msg) || msg.includes("xin chào") || msg.includes("cảm ơn") || msg.includes("thank")) return "greeting"
  // Bước 0c/0d của fallbackResponse — cùng nhóm small talk/hỗ trợ tĩnh, xét
  // sớm (không cần entities) giống hệt nhánh greeting ngay trên.
  if (/bạn là ai|bạn là gì|bạn có phải.{0,10}(ai|người thật|bot|con người)|bạn là (bot|ai\b|trí tuệ nhân tạo)/.test(msg)) return "greeting"
  if (/gặp nhân viên|nói chuyện với người thật|chat với người|tư vấn viên|nhân viên hỗ trợ trực tiếp|người thật hỗ trợ/.test(msg)) return "faq"
  // Bước 0e (hỏi ngày/thứ hôm nay) — trước đây thiếu nhánh này nên bị gán
  // nhầm "default" dù fallbackResponse đã trả lời đúng thật (kiểm chứng trực
  // tiếp qua log chatbot_interactions: câu "hôm nay ngày mấy" trả lời chính
  // xác nhưng vẫn bị ghi nhãn "default", làm sai lệch số liệu phân tích và
  // khiến Markov chain không học được chuỗi chuyển ý định thật ở đây).
  if (/hôm nay (là )?ngày (mấy|bao nhiêu)|hôm nay (là )?thứ mấy|bây giờ là ngày mấy|ngày hôm nay là gì/.test(msg)) return "faq"

  const entities = await nlu.extractEntities(message)
  const earlyMood = nlu.scoreMoods(msg, MOOD_MAP) // dùng lại bên dưới, tránh tính 2 lần + để loại trừ nhánh lịch chiếu rộng
  if (entities.bookingRef || msg.includes("vé của tôi") || msg.includes("lịch sử") || msg.includes("đã đặt")) return "booking"
  // Lọc suất chiếu theo khung giờ (bước 2b của fallbackResponse) cũng trả về
  // showtime_list giống nhánh lịch chiếu — cùng nhãn "schedule", và PHẢI xét
  // TRƯỚC nhánh lịch chiếu chung chung ngay dưới vì cùng lý do ưu tiên đã áp
  // dụng ở fallbackResponse (câu "suất chiếu buổi tối" chứa sẵn "suất chiếu").
  if (parseTimeOfDayFilter(msg)) return "schedule"
  if (
    msg.includes("lịch chiếu") || msg.includes("suất chiếu") || msg.includes("giờ chiếu") || msg.includes("chiếu mấy giờ") ||
    msg.includes("tra lịch") || msg.includes("xem lịch") || msg.includes("check lịch") ||
    (msg.includes("lịch") && (msg.includes("hôm nay") || msg.includes("ngày mai"))) ||
    // Tín hiệu rộng (ngày + từ chung chung) — chỉ nhận khi KHÔNG có mood rõ
    // ràng hơn, cùng lý do đã sửa ở fallbackResponse (vd "tối nay đi xem phim
    // với bạn gái cho lãng mạn" phải được gán nhãn "mood", không phải "schedule").
    (!!entities.date && !earlyMood && (msg.includes("xem") || msg.includes("coi") || msg.includes("phim"))) ||
    // "còn ghế/còn vé" (bước 3e của fallbackResponse) cũng trả về showtime_list
    // giống nhánh lịch chiếu — cùng nhãn "schedule" cho đúng hành vi thật.
    msg.includes("còn ghế") || msg.includes("còn vé") || msg.includes("còn chỗ") || msg.includes("hết vé") || msg.includes("hết ghế") ||
    msg.includes("còn suất") || msg.includes("còn bao nhiêu suất")
  ) return "schedule"
  if (entities.roomType && (msg.includes("giá") || msg.includes("đắt") || msg.includes("rẻ") || msg.includes("bao nhiêu tiền"))) return "room_pricing"
  if (msg.includes("so sánh giá") && msg.includes("phòng")) return "room_pricing"
  // "so sánh phim" (bước 3b2) trả về movie_list — phải xét TRƯỚC faq vì cùng
  // thứ tự ưu tiên thật trong fallbackResponse. Khớp đúng điều kiện thật của
  // 3b2 (chỉ cần "so sánh" + tìm được 2+ phim thật qua findAllMentionedMovies,
  // KHÔNG bắt buộc câu phải có chữ "phim") — nếu không, câu như "so sánh The
  // Dark Knight Returns và Transformers" sẽ được nhãn sai (không phải movie_info).
  // Cùng điều kiện đã mở rộng ở fallbackResponse bước 3b2: "hay"/"hoặc" giữa
  // 2 phim thật cụ thể (vd "nên xem X hay Y") cũng là so sánh, không chỉ khi
  // có chữ "so sánh".
  if (msg.includes("so sánh") || msg.includes(" hay ") || msg.includes("hoặc")) {
    const movieCacheForCompare = await nlu.getMovieTitleCache()
    if (nlu.findAllMentionedMovies(msg, movieCacheForCompare).length >= 2) return "movie_info"
  }
  if (matchFAQ(msg)) return "faq"
  // Ý định đặt vé MỚI (bước 3d, khác với tra lịch sử vé ở trên) — gộp chung
  // nhãn "booking" vì cùng bản chất ý định người dùng, dù cách xử lý khác nhau.
  // "tôi muốn 15 vé" (entities.seatCount + "muốn", không nói rõ "đặt"/"mua") —
  // cùng điều kiện đã dùng ở bước 3d của fallbackResponse, trước đây thiếu ở
  // đây nên bị gán nhầm "default" dù đã được trả lời đúng (kiểm chứng trực
  // tiếp qua log thật).
  if (msg.includes("muốn đặt") || msg.includes("muốn mua") || msg.includes("đặt vé") || msg.includes("mua vé") || msg.includes("đặt giúp") || (entities.seatCount != null && msg.includes("muốn"))) return "booking"
  // Lọc combo/đồ ăn theo giá (bước 3f) PHẢI xét TRƯỚC parsePriceFilter (lọc
  // PHIM theo giá vé) ngay dưới — cùng lý do đã áp dụng ở fallbackResponse.
  if (parseComboPriceFilter(msg)) return "pricing"
  // Lọc phim theo thời lượng/giá vé (bước 4a) PHẢI xét TRƯỚC nhánh "pricing"
  // chung chung ngay dưới — cùng lý do đã sửa ở fallbackResponse: câu như
  // "phim giá dưới 100k" chứa chữ "giá" nên nếu xét nhánh pricing trước sẽ
  // gán nhãn sai (pricing thay vì movie_info).
  if (parseDurationFilter(msg) || parsePriceFilter(msg)) return "movie_info"
  if (msg.includes("giá") || msg.includes("combo") || msg.includes("bắp") || msg.includes("nước ngọt")) return "pricing"
  if (msg.includes("rạp") || msg.includes("cinema") || msg.includes("địa điểm") || msg.includes("ở đâu")) return "cinema_info"
  const wantsSuggestion = msg.includes("gợi ý") || msg.includes("đề xuất") || msg.includes("nên xem")
  const isPersonal = msg.includes("cho tôi") || msg.includes("riêng") || msg.includes("hợp với tôi") || msg.includes("dành cho tôi")
  // Cùng guard !earlyMood đã thêm ở fallbackResponse bước 5b — "tôi nên xem"
  // dễ vô tình khớp bên trong 1 câu đang thổ lộ tâm trạng cụ thể, tâm trạng
  // luôn được ưu tiên nhãn "mood" hơn "personalized" chung chung.
  if (!earlyMood && ((wantsSuggestion && isPersonal) || msg.includes("tôi nên xem"))) return "personalized"
  // "phim buồn" (bước 5d) là yêu cầu thể loại tường minh, không phải tín hiệu
  // tâm trạng — PHẢI xét TRƯỚC scoreMoods() để khớp đúng nhãn "movie_info"
  // thay vì "mood" (xem isExplicitSadMovieRequest()).
  if (isExplicitSadMovieRequest(msg)) return "movie_info"
  if (earlyMood) return "mood"
  // Phim ĐIỂM ĐÁNH GIÁ cao nhất (bước 6b) — cùng điều kiện loại trừ
  // entities.person (tránh nhầm với câu hỏi diễn viên) đã dùng ở fallbackResponse.
  if (!entities.person && (msg.includes("rating cao") || msg.includes("rating tốt") || msg.includes("đánh giá cao") || msg.includes("điểm cao") || msg.includes("review tốt"))) return "movie_info"
  if (msg.includes("hot") || msg.includes("phổ biến") || msg.includes("hay nhất") || msg.includes("trending") || msg.includes("đang chiếu") || msg.includes("phim mới") || msg.includes("phim gì") || msg.includes("phim khác") || msg.includes("gợi ý khác") || msg.includes("gợi ý thêm")) return "movie_info"
  if (entities.movie || entities.person) return "movie_info"
  // Cú pháp hỏi diễn viên (bước 9a2) mà gazetteer không nhận diện được tên
  // (diễn viên có thật ngoài đời nhưng chưa có phim nào trong catalog) — vẫn
  // được fallbackResponse trả lời thật ("chưa có phim nào của X"), nên gán
  // "movie_info" thay vì để rơi xuống "default" sai lệch số liệu.
  if (!entities.person) {
    const actorCandidate = matchActorQuerySyntax(message)?.[1]?.trim()
    if (actorCandidate && actorCandidate.length >= 2 && actorCandidate.length <= 40) return "movie_info"
  }
  return "default"
}

/** Lấy nội dung lượt nói của USER gần nhất trong history (để biết intent lượt trước) */
function getLastUserMessage(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user" && history[i]?.content) return history[i].content
  }
  return null
}

/** Lấy nội dung lượt trả lời của BOT gần nhất trong history — dùng để kiểm
 * tra bot có vừa chủ động hỏi 1 câu gợi ý (xem applyMarkovSuggestion) mà
 * lượt hiện tại đang TRẢ LỜI hay không. */
function getLastAssistantMessage(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant" && history[i]?.content) return history[i].content
  }
  return null
}

// Xác nhận đồng ý ngắn gọn — PHẢI khớp GẦN NHƯ TRỌN VẸN câu (không dùng
// .includes()), vì các từ này rất ngắn và dễ là 1 phần của câu dài không hề
// mang nghĩa "đồng ý" (vd "có" xuất hiện trong vô số câu khác).
const CONFIRMATION_PATTERN = /^(có|có chứ|có ạ|dạ có|dạ|ừ+m?|ờ|vâng|đồng ý|ok|oke|okay|được|được ạ|được rồi|chắc chắn( rồi)?|muốn chứ|yes)[\s!.]*$/

/** Bot vừa hỏi "Bạn có muốn X luôn không?" (xem applyMarkovSuggestion) — tách
 * ra cụm X rồi map ngược về đúng intent đã sinh ra gợi ý đó, dựa vào
 * markov.INTENT_SUGGESTIONS (nguồn DUY NHẤT sinh ra câu hỏi này, nên tra
 * ngược lại đảm bảo khớp chính xác, không cần đoán bằng từ khoá). */
function resolvePendingSuggestionIntent(history) {
  const lastBotMsg = getLastAssistantMessage(history)
  if (!lastBotMsg) return null
  const match = lastBotMsg.match(/bạn có muốn (.+?) luôn không\?/i)
  if (!match) return null
  const suggestionText = match[1].trim().toLowerCase()
  for (const [intent, suggestion] of Object.entries(markov.INTENT_SUGGESTIONS)) {
    if (suggestion.toLowerCase() === suggestionText) return intent
  }
  return null
}

/**
 * Ghi nhận chuyển trạng thái (lượt trước → lượt hiện tại) vào Markov Chain,
 * rồi dự đoán ý định kế tiếp NHIỀU KHẢ NĂNG NHẤT để chủ động gợi ý thêm cho
 * người dùng — kiểu "hỏi lịch chiếu xong thường hỏi giá vé tiếp theo".
 *
 * Trả về cả `intent` của lượt hiện tại (không chỉ `reply`) để nơi gọi (log
 * ẩn danh chatbot_interactions) TÁI SỬ DỤNG thay vì phải tự
 * classifyIntentForMarkov(message) thêm 1 lần nữa — classify này đã gọi
 * extractEntities (dò tên phim/rạp qua Aho-Corasick), gọi lại vô ích 2 lần
 * mỗi lượt chat sẽ tốn công bằng thừa.
 */
async function applyMarkovSuggestion(reply, message, history) {
  let currentIntent = null
  try {
    currentIntent = await classifyIntentForMarkov(message)
    const prevMessage = getLastUserMessage(history)
    const prevIntent = prevMessage ? await classifyIntentForMarkov(prevMessage) : null
    if (prevIntent) markov.recordTransition(prevIntent, currentIntent)

    // Không gợi ý dồn lên các câu chào hỏi/FAQ/mặc định — phần trả lời đó đã
    // tự đầy đủ hoặc không phù hợp để gợi ý thêm hành động kế tiếp.
    const SUGGESTABLE = new Set(["schedule", "pricing", "room_pricing", "movie_info", "mood", "personalized", "cinema_info"])
    if (!SUGGESTABLE.has(currentIntent)) return { reply, intent: currentIntent }

    const prediction = markov.predictNextIntent(currentIntent)
    if (!prediction || !prediction.suggestion || prediction.intent === currentIntent) return { reply, intent: currentIntent }
    if (prediction.probability < 0.3) return { reply, intent: currentIntent } // dự đoán không đủ chắc thì không gợi ý kẻo gây nhiễu

    return { reply: `${reply}\n\n💡 _Bạn có muốn ${prediction.suggestion} luôn không?_`, intent: currentIntent }
  } catch {
    return { reply, intent: currentIntent } // Markov chỉ là gợi ý phụ — lỗi ở đây không được làm hỏng câu trả lời chính
  }
}

/**
 * Phân tích sắc thái câu hỏi của khách (Sentiment Analysis) — nếu khách đang
 * tỏ rõ sự khó chịu/thất vọng (sentiment rất tiêu cực) mà KHÔNG phải đang
 * khiếu nại đúng quy trình (tier FAQ "khiếu nại" đã có lời xin lỗi riêng),
 * thêm 1 câu mở đầu thấu cảm trước khi trả lời chính — để chatbot có cảm
 * giác "hiểu cảm xúc" người dùng hơn, không trả lời khô khan như tra dữ liệu.
 */
function applySentimentEmpathy(reply, message) {
  try {
    const msg = nlu.normalize(message)
    // CHỈ bỏ qua câu mở đầu thấu cảm khi khớp đúng tier "khiếu nại" (tier duy
    // nhất tự có lời xin lỗi sẵn trong reply) — trước đây kiểm tra bằng
    // matchFAQ(msg) chung chung, khiến MỌI câu khớp bất kỳ tier FAQ nào (vd
    // "giữ ghế bao lâu", "loại phòng có gì") cũng bị bỏ qua câu thấu cảm dù
    // các tier đó không hề đề cập gì tới cảm xúc/lời xin lỗi của người dùng.
    if (findFAQRule(msg)?.apologizes) return reply

    const sentiment = sentimentAnalysis.analyzeSentiment(message)
    if (sentiment.label !== "negative" || sentiment.score > -3) return reply // chỉ can thiệp khi RÕ RÀNG tiêu cực

    return `Mình hiểu bạn đang không hài lòng, mình sẽ cố gắng hỗ trợ tốt nhất có thể 🙏\n\n${reply}`
  } catch {
    return reply
  }
}

// ─────────────────────────────────────────────
// FALLBACK khi AI quota hết — pipeline NLU nhiều tầng + trí nhớ ngữ cảnh
//   Layer 0: normalize (nlu.normalize)
//   Layer 1: entity extraction (nlu.extractEntities) — ngày, mã vé, loại
//            phòng, tên phim/rạp được nhắc TRỰC TIẾP trong câu hiện tại
//   Layer 2: context memory (nlu.buildContext) — suy ra phim/rạp/ngày đang
//            được nói tới từ LỊCH SỬ hội thoại, dùng khi câu hiện tại dùng
//            đại từ ám chỉ ("phim đó", "rạp đó", "vậy giá sao")
//   Layer 3: phân tầng intent theo độ ưu tiên (policy tĩnh → dữ liệu có tham
//            số → mood theo điểm số → tìm kiếm tự do → mặc định có ngữ cảnh)
// ─────────────────────────────────────────────
// Câu hỏi về điểm trên các trang đánh giá lớn (không phải điểm khách của rạp chấm)
const WEB_REVIEW_PATTERN = /imdb|rotten|metacritic|metascore|phê bình|trên mạng|trên internet|đánh giá (thế nào |ra sao )?trên/;

// Tên phim tiếng Việt quen thuộc → tên gốc tiếng Anh để tra (Wikidata tìm theo tên tiếng Anh)
const TEN_VIET_SANG_ANH = {
  "người sắt": "Iron Man", "người dơi": "The Batman", "người nhện": "Spider-Man",
  "siêu nhân": "Superman", "báo đen": "Black Panther", "người kiến": "Ant-Man",
  "chúa tể những chiếc nhẫn": "The Lord of the Rings", "vua sư tử": "The Lion King",
}

/** Lấy tên phim từ câu hỏi dạng "phim X được chấm bao nhiêu trên IMDb". */
function tachTenPhimHoiDiem(msg) {
  for (const [viet, anh] of Object.entries(TEN_VIET_SANG_ANH)) if (msg.includes(viet)) return anh
  const trongNgoac = msg.match(/["“'](.+?)["”']/)
  if (trongNgoac) return trongNgoac[1].trim()
  // Tách theo khoảng trắng rồi bỏ từ nối — KHÔNG dùng \b vì \b của JS chỉ hiểu
  // chữ ASCII, sai với chữ có dấu (xem chú thích ở chatbotNLU.tokenize).
  let s = ` ${msg.replace(/[?!.,]/g, " ")} `
  for (const cum of ["rotten tomatoes", "đánh giá", "thế nào", "ra sao", "bao nhiêu", "phê bình", "nói gì", "số điểm", "bộ phim"]) {
    s = s.split(` ${cum} `).join(" ")
  }
  const TU_NOI = new Set(["phim", "được", "chấm", "điểm", "trên", "của", "các", "trang", "mạng", "internet", "imdb", "rotten",
    "metacritic", "metascore", "giới", "về", "là", "có", "cao", "không", "nhỉ", "vậy", "ạ", "cho", "mình", "tôi", "xem", "như"])
  const ten = s.split(/\s+/).filter((w) => w && !TU_NOI.has(w)).join(" ").trim()
  return ten.length >= 2 && ten.length <= 60 ? ten : null
}

async function fallbackResponse(message, handlers, history = []) {
  const msg = nlu.normalize(message);

  try {
    const entities = await nlu.extractEntities(message);
    const context = await nlu.buildContext(history);
    // Phim/rạp đang "trong tâm điểm hội thoại": ưu tiên thực thể nhắc trực
    // tiếp trong câu hiện tại, nếu không có thì lấy từ ngữ cảnh trước đó
    const focusMovie = entities.movie || (entities.anaphora ? context.movie : null);
    const focusCinema = entities.cinema || (entities.anaphora ? context.cinema : null);
    const focusDate = entities.date || context.date;
    // Chấm điểm tâm trạng SỚM (dùng lại ở bước 3 lẫn bước 6) — câu như "mình
    // với bạn gái tối nay không biết coi gì cho lãng mạn" vừa có tín hiệu
    // NGÀY (tối nay → entities.date) vừa có tín hiệu TÂM TRẠNG rõ ràng (bạn
    // gái, lãng mạn); nếu không biết trước có mood hay không, nhánh lịch
    // chiếu "date + xem/coi/phim" ở bước 3 (vốn khá rộng, chỉ để bắt câu kiểu
    // "muốn xem phim ngày mai") sẽ nuốt mất câu này trước khi tới được bước 6,
    // trả lời lịch chiếu chung chung thay vì gợi ý phim lãng mạn đúng ý.
    const matchedMood = isChildBirthdayRequest(msg)
      ? MOOD_MAP.find((m) => m.patterns.includes("gia đình"))
      : nlu.scoreMoods(msg, MOOD_MAP);
    // QUAN TRỌNG: frontend chỉ lưu lại CHUỖI reply vào history (không lưu
    // `cards`) — nếu 1 câu trả lời liệt kê phim không nhắc tên phim nào bằng
    // CHỮ trong text, buildContext() ở lượt SAU sẽ không thấy được phim đang
    // "trong tâm điểm hội thoại" (chỉ quét text, không đọc được card). Hậu
    // quả thực tế đã gặp: bot gợi ý theo tâm trạng có nêu tên phim (đã sửa),
    // nhưng nhánh tìm mờ/phim hot KHÔNG nêu tên — khiến context.movie "dính"
    // mãi vào phim CŨ hơn (từ lượt gợi ý tâm trạng trước đó) thay vì cập
    // nhật theo danh sách MỚI vừa hiện ra, dù về mặt hội thoại người dùng đã
    // chuyển sang nói về nhóm phim khác. Dùng chung 1 helper cho MỌI nhánh
    // trả về danh sách phim để tránh lặp lại lỗi này ở chỗ khác.
    const withTopMovie = (baseReply, movies) =>
      movies.length ? `${baseReply}\n\n🎬 Gợi ý đầu tiên: **${movies[0].title}**` : baseReply

    // 0. Điểm đánh giá TRÊN MẠNG (IMDb / Rotten Tomatoes / Metacritic) — vẫn
    // phải trả lời bằng số liệu thật khi Gemini hết lượt/lỗi, nên nhánh luật
    // cứng tự gọi thẳng dịch vụ tra Wikidata (xem movieWebRatings.service.js).
    if (WEB_REVIEW_PATTERN.test(msg)) {
      const ten = focusMovie?.title || tachTenPhimHoiDiem(msg)
      if (ten) {
        const d = await handlers.searchWebReviews({ movieTitle: ten });
        if (!d.found) {
          return { reply: `😔 Mình chưa tìm thấy điểm đánh giá của "${ten}" trên mạng. Bạn thử gõ tên gốc tiếng Anh của phim nhé (vd: The Batman, Iron Man).`, cards: [] };
        }
        const dong = d.ratings.map((r) => `• ${r.label}: **${r.score}**${r.asOf ? ` (ghi nhận ${r.asOf.split("-").reverse().join("/")})` : ""}`);
        return {
          reply: `🌐 Điểm của **${d.title}** trên các trang lớn:\n${dong.join("\n") || "• Chưa có điểm nào được ghi nhận."}\n\nNguồn: Wikidata/Wikipedia — bấm các link bên dưới để xem trực tiếp.`,
          cards: [{ type: "web_ratings", title: d.title, description: d.description, ratings: d.ratings, sources: d.sources }],
        };
      }
    }

    // 0a. Xác nhận đồng ý cho câu gợi ý CHỦ ĐỘNG mà bot vừa hỏi (xem
    // applyMarkovSuggestion — "💡 Bạn có muốn tra lịch chiếu luôn không?").
    // Trước đây trả lời "có"/"ok" cho câu hỏi này KHÔNG khớp bất kỳ nhánh
    // nào bên dưới (những từ quá ngắn, không mang thực thể/từ khoá gì), rơi
    // thẳng xuống câu chào mặc định ở cuối — trải nghiệm rất tệ: bot vừa chủ
    // động hỏi xong "quên" luôn câu hỏi của chính mình. Dùng CONFIRMATION_
    // PATTERN + resolvePendingSuggestionIntent để tra lại ĐÚNG hành động bot
    // vừa đề xuất, rồi trả lời NGAY bằng dữ liệu thật — dùng context.movie/
    // cinema/date trực tiếp (KHÔNG qua cổng entities.anaphora, vì "có" một
    // mình không phải từ ám chỉ nhưng vẫn ngầm chỉ tới điều bot vừa hỏi).
    if (CONFIRMATION_PATTERN.test(msg)) {
      const pendingIntent = resolvePendingSuggestionIntent(history)
      if (pendingIntent === "schedule") {
        const data = await handlers.getShowtimes({ date: context.date || undefined, movieTitle: context.movie?.title, cinemaName: context.cinema?.name });
        const movieLabel = context.movie ? ` phim **${context.movie.title}**` : ""
        return { reply: `📅 Lịch chiếu${movieLabel} (${data.count} suất):`, cards: [{ type: "showtime_list", showtimes: data.showtimes }] };
      }
      if (pendingIntent === "pricing") {
        // QUAN TRỌNG: trước đây LUÔN trả giá vé CHUNG CHUNG dù đang có
        // context.movie (vd vừa hỏi lịch chiếu Oppenheimer, bot chủ động hỏi
        // "xem giá vé luôn không", user xác nhận "có" — đáng lẽ phải trả lời
        // GIÁ VÉ CỦA OPPENHEIMER, không phải bảng giá catalog chung) — mất
        // đúng ngữ cảnh vừa thiết lập, giống hệt lỗi đã sửa ở nhánh 1b. Áp
        // dụng cùng cách xử lý: có context.movie thì trả lời riêng cho phim
        // đó, không thì mới dùng bảng giá chung.
        if (context.movie) {
          const showtimeData = await handlers.getShowtimes({ movieTitle: context.movie.title });
          const prices = showtimeData.showtimes.map((s) => s.price).filter(Boolean);
          if (prices.length) {
            return {
              reply: `💰 Giá vé phim **${context.movie.title}**: từ ${formatVND(Math.min(...prices))} đến ${formatVND(Math.max(...prices))} tuỳ phòng và giờ chiếu.`,
              cards: [{ type: "showtime_list", showtimes: showtimeData.showtimes.slice(0, 5) }],
            };
          }
          return {
            reply: `😔 **${context.movie.title}** hiện chưa có suất chiếu nào nên chưa có giá vé cụ thể.`,
            cards: [],
          };
        }
        const data = await handlers.getPricing({ type: "all" });
        return { reply: "💰 Thông tin giá vé và combo:", cards: [{ type: "pricing", tickets: data.tickets, combos: data.combos }] };
      }
      if (pendingIntent === "room_pricing") {
        const data = await handlers.getRoomPricing();
        const lines = data.roomPricing.map((r) => `- **${r.room_type.toUpperCase()}**: trung bình ${formatVND(r.avg_price)}`);
        return { reply: `💰 So sánh giá các loại phòng (giá trung bình):\n${lines.join("\n")}`, cards: [] };
      }
      if (pendingIntent === "cinema_info") {
        const data = await handlers.getCinemas({});
        return { reply: `📍 Có ${data.count} rạp chiếu phim:`, cards: [{ type: "cinema_list", cinemas: data.cinemas }] };
      }
      if (pendingIntent === "movie_info" && context.movie) {
        const detail = await handlers.getMovieDetails({ movieId: context.movie.id });
        return {
          reply: `🎬 **${detail.movie.title}** — bạn muốn xem lịch chiếu hay giá vé của phim này không?`,
          cards: [{ type: "movie_detail", movie: detail.movie, showtimes: detail.upcomingShowtimes }],
        };
      }
      if (pendingIntent === "personalized") {
        const data = await handlers.getPersonalizedRecommendations({ limit: 5 });
        const reply = data.personalized
          ? `🎯 Dựa trên các phim bạn từng xem, đây là gợi ý dành riêng cho bạn:`
          : `🔥 Mình chưa có đủ lịch sử xem của bạn, đây là top phim hot hiện tại:`;
        return { reply, cards: [{ type: "movie_list", movies: data.movies }] };
      }
      if (pendingIntent === "booking") {
        return { reply: "🎫 Bạn cho mình xin mã đặt vé nhé (dạng BK...) để mình tra cứu giúp bạn!", cards: [] };
      }
      if (pendingIntent === "faq") {
        return { reply: "❓ Bạn muốn hỏi về phần nào — đặt vé, huỷ/đổi vé, thanh toán hay giữ ghế? Cứ hỏi cụ thể mình sẽ trả lời ngay!", cards: [] };
      }
      if (pendingIntent === "mood") {
        return { reply: "😊 Bạn đang cảm thấy thế nào — vui, buồn, muốn thư giãn hay đang tìm cảm giác mạnh? Nói mình biết để gợi ý phim hợp gu nhé!", cards: [] };
      }
      // Không có gợi ý nào đang chờ (bot lượt trước không hỏi kiểu này) —
      // để "có" rơi tiếp xuống các nhánh bên dưới như bình thường, không chặn.
    }

    // 0b. Từ chối phim vừa được gợi ý/đang nói tới ("tôi không thích phim
    // này", "chán phim này", "không hợp gu tôi") — PHẢI xét TRƯỚC các nhánh
    // tìm kiếm tự do (đặc biệt bước 9b, tìm mờ) — nếu không, câu từ chối bị
    // coi như 1 câu TRUY VẤN TÌM KIẾM thật (đã xảy ra thực tế: "tôi không
    // thích xem phim này" tìm mờ ra "Joker" — hoàn toàn không liên quan,
    // trông như bot không hiểu câu vừa nói). Đồng thời PHẢI nêu tên phim MỚI
    // gợi ý bằng chữ (không chỉ trong card) để context.movie cập nhật đúng
    // — nếu không, phim vừa bị từ chối sẽ tiếp tục "dính" trong ngữ cảnh ở
    // các lượt hỏi mơ hồ sau đó (vd hỏi "suất chiếu" chung chung sau khi đã
    // từ chối phim, vẫn bị tra nhầm lịch của đúng phim vừa bị từ chối).
    if (
      focusMovie &&
      /không thích|chán(?!\s*nản)|không hợp|không muốn xem|không mê/.test(msg) &&
      (msg.includes("phim này") || msg.includes("phim đó") || entities.anaphora)
    ) {
      const data = await handlers.getPopularMovies({ status: "NOW_SHOWING", limit: 6 });
      const alternatives = data.movies.filter((m) => m.id !== focusMovie.id);
      if (alternatives.length > 0) {
        return {
          reply: `😅 Không sao, để mình gợi ý phim khác nhé!\n\n🎬 Thử xem **${alternatives[0].title}** được không?`,
          cards: [{ type: "movie_list", movies: alternatives.slice(0, 5) }],
        };
      }
    }

    // 0. Chào hỏi / cảm ơn — small talk tự nhiên
    if (/^(hi|hello|chào|alo|hey)\b/.test(msg) || msg === "chào bạn" || msg.includes("xin chào") || msg === "ê" || msg === "e oi" || msg === "êi") {
      const greet = context.turnCount > 0
        ? "Chào bạn quay lại! 👋 Mình vẫn ở đây, cần tiếp gì cứ nói nhé!"
        : "Chào bạn! 👋 Mình là **Cine** — trợ lý điện ảnh của CinemaGold. Mình có thể gợi ý phim theo tâm trạng, tra lịch chiếu, giá vé hoặc đơn đặt vé. Bạn cần giúp gì nào? 😊"
      return { reply: greet, cards: [] }
    }
    if (msg.includes("cảm ơn") || msg.includes("thank")) {
      return { reply: "Không có gì đâu! 🎬 Chúc bạn xem phim vui vẻ. Cần gì thêm cứ hỏi mình nhé!", cards: [] }
    }
    if (msg.includes("tạm biệt") || msg.includes("bye") || msg.includes("hẹn gặp lại") || msg === "ok" || msg === "oke") {
      return { reply: "Tạm biệt bạn! 👋 Hẹn gặp lại, chúc bạn xem phim vui vẻ nhé! 🍿", cards: [] }
    }

    // 0c. Câu hỏi META về chính bot (danh tính) — khác hẳn câu hỏi về phim/rạp,
    // cần xét SỚM (cùng nhóm small talk) để không bị nuốt bởi các nhánh tìm
    // kiếm phía dưới (vd "bạn là ai" từng có nguy cơ rơi vào tìm phim mờ).
    if (/bạn là ai|bạn là gì|bạn có phải.{0,10}(ai|người thật|bot|con người)|bạn là (bot|ai\b|trí tuệ nhân tạo)/.test(msg)) {
      return {
        reply: "🤖 Mình là **Cine** — chatbot AI của CinemaGold, được tạo ra để giúp bạn tìm phim, tra lịch chiếu, giá vé và hỗ trợ đặt vé nhanh hơn. Mình không phải người thật, nhưng luôn cố gắng hiểu đúng ý bạn nhất có thể! 😊",
        cards: [],
      }
    }

    // 0d. Yêu cầu gặp NHÂN VIÊN THẬT (escalation) — khác "liên hệ" (hỏi cách
    // liên hệ chung chung) ở chỗ đây là người dùng đã THỬ với bot và muốn
    // chuyển sang người thật, nên cần lời thừa nhận giới hạn của bot trước khi
    // đưa kênh liên hệ, tránh cảm giác bị bot "đá qua đá lại" khô khan.
    if (/gặp nhân viên|nói chuyện với người thật|chat với người|tư vấn viên|nhân viên hỗ trợ trực tiếp|người thật hỗ trợ/.test(msg)) {
      return {
        // Tổng đài/email đọc từ trang Cài đặt của admin (trước đây ghi cứng "1900 xxxx").
        get reply() {
          const lines = require("../services/systemSettings.service").contactLinesSync() || "- Trang **Liên hệ** trên website"
          return `🙋 Mình hiểu bạn muốn được hỗ trợ trực tiếp hơn! Bạn có thể liên hệ nhân viên CinemaGold qua:\n${lines}\n\nNếu vấn đề liên quan tới 1 đơn vé cụ thể, gửi mình mã đặt vé (BK...) để mình tra cứu giúp trước cũng được nhé!`
        },
        cards: [],
      }
    }

    // 0e. Hỏi ngày/thứ hôm nay — câu hỏi thực tế đơn giản, KHÔNG liên quan phim,
    // nhưng trước đây rơi thẳng xuống câu chào mặc định vì không khớp nhánh
    // nào. Dùng ngày giờ THẬT của server (giờ Việt Nam), không bịa.
    if (/hôm nay (là )?ngày (mấy|bao nhiêu)|hôm nay (là )?thứ mấy|bây giờ là ngày mấy|ngày hôm nay là gì/.test(msg)) {
      const todayVN = new Date().toLocaleDateString("vi-VN", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
      })
      return { reply: `📅 Hôm nay là **${todayVN}**. Bạn muốn xem lịch chiếu hôm nay không?`, cards: [] }
    }

    // 1. Tra cứu mã đặt vé
    if (entities.bookingRef) {
      const data = await handlers.getBookingByReference({ reference: entities.bookingRef });
      if (data.booking) return { reply: "🎫 Tìm thấy đơn đặt vé của bạn:", cards: [{ type: "booking_detail", booking: data.booking }] };
      // KHÔNG tìm thấy mã → getBookingByReferenceDB trả về {error}, không phải
      // {booking} — trước đây thiếu nhánh else nên rơi thẳng xuống hết các
      // bước bên dưới (không khớp gì vì message toàn ký tự mã BK), cuối cùng
      // rớt xuống câu chào mặc định — người dùng gõ hẳn mã vé mà bot coi như
      // không thấy gì, trả lời lạc đề hoàn toàn (kiểm chứng trực tiếp: "BK9999999999XXXX" → câu chào Cine).
      if (data.error) return { reply: `😔 ${data.error}`, cards: [] };
    }

    // 1a. Khiếu nại/phàn nàn (lỗi thanh toán, trừ tiền 2 lần, tài khoản bị
    // khoá...) PHẢI xét TRƯỚC bước 2 (lịch sử vé) — câu phàn nàn thật ngoài
    // đời rất hay lẫn cụm "đã đặt" (vd "tôi ĐÃ ĐẶT vé nhưng bị trừ tiền 2
    // lần"), nên nếu để bước 2 xét trước sẽ chỉ trả về danh sách vé (hoặc yêu
    // cầu đăng nhập nếu là khách), hoàn toàn bỏ qua đúng vấn đề người dùng
    // đang gặp phải.
    const complaintRule = findFAQRule(msg)
    if (complaintRule?.apologizes) return { reply: complaintRule.reply, cards: [] }

    // 1b. Câu hỏi về 1 CHI TIẾT CỤ THỂ của phim/rạp — hoặc hỏi NỐI TIẾP dùng
    // đại từ ám chỉ + Context Memory (vd hỏi "Avatar có suất nào không", rồi
    // hỏi tiếp "vậy giá vé phim đó bao nhiêu?"), HOẶC nêu thẳng tên phim kèm
    // câu hỏi cụ thể trong CÙNG 1 câu (vd "Phim Avatar dài bao nhiêu phút",
    // "Phim Avatar giá vé bao nhiêu") — 2 kiểu câu này hỏi cùng 1 loại thông
    // tin, chỉ khác cách nhắc tới phim (đại từ ám chỉ so với nêu tên trực
    // tiếp). Trước đây CHỈ xét khi có đại từ ám chỉ (entities.anaphora), nên
    // hỏi thẳng "phim X dài bao nhiêu phút" (không dùng "phim đó") lại rơi
    // xuống bước 9a chỉ trả lời chung chung "bạn muốn xem lịch chiếu hay giá
    // vé không" — không trả lời được luôn câu hỏi cụ thể đã hỏi. focusMovie
    // (dùng bên dưới) đã tự ưu tiên entities.movie khi có, nên chỉ cần mở
    // rộng điều kiện xét khối này, không cần đổi gì trong logic từng nhánh.
    if ((entities.anaphora && (context.movie || context.cinema)) || entities.movie || entities.cinema) {
      if (focusMovie && (msg.includes("giờ") || msg.includes("suất") || msg.includes("lịch chiếu") || msg.includes("khi nào"))) {
        const data = await handlers.getShowtimes({ movieTitle: focusMovie.title, date: focusDate || undefined, cinemaName: focusCinema?.name });
        return {
          reply: `📅 Suất chiếu phim **${focusMovie.title}**${focusCinema ? ` tại ${focusCinema.name}` : ""} (${data.count} suất):`,
          cards: [{ type: "showtime_list", showtimes: data.showtimes }],
        }
      }
      if (focusMovie && (msg.includes("giá"))) {
        const data = await handlers.getShowtimes({ movieTitle: focusMovie.title });
        const prices = data.showtimes.map((s) => s.price).filter(Boolean)
        if (prices.length) {
          return {
            reply: `💰 Giá vé phim **${focusMovie.title}**: từ ${formatVND(Math.min(...prices))} đến ${formatVND(Math.max(...prices))} tuỳ phòng và giờ chiếu.`,
            cards: [{ type: "showtime_list", showtimes: data.showtimes.slice(0, 5) }],
          }
        }
        // QUAN TRỌNG: trước đây thiếu nhánh else này — khi phim CHƯA CÓ suất
        // chiếu nào (vd phim mới thêm/mới khôi phục, chưa kịp tạo lịch chiếu),
        // `prices` rỗng, code cũ KHÔNG return gì cả ở đây, rơi tọt qua toàn bộ
        // phần còn lại của hàm xuống tít nhánh "giá vé" CHUNG CHUNG (bước 7),
        // trả lời y hệt như không hề biết người dùng đang hỏi về phim cụ thể
        // nào — trông như bot "quên" luôn ngữ cảnh vừa nói. Trả lời thẳng sự
        // thật (chưa có suất/giá) thay vì im lặng rơi xuống nhánh sai.
        return {
          reply: `😔 **${focusMovie.title}** hiện chưa có suất chiếu nào nên chưa có giá vé cụ thể. Bạn xem thử phim khác đang chiếu nhé!`,
          cards: [],
        }
      }
      if (focusCinema && (msg.includes("ở đâu") || msg.includes("địa chỉ"))) {
        return { reply: `📍 **${focusCinema.name}** — bạn có thể xem địa chỉ chi tiết và suất chiếu tại trang Rạp chiếu nhé!`, cards: [] }
      }
      if (focusMovie && (msg.includes("bao nhiêu phút") || msg.includes("thời lượng") || msg.includes("dài không"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        return {
          reply: `⏱️ **${focusMovie.title}** dài **${detail.movie.duration} phút**.`,
          cards: [{ type: "movie_detail", movie: detail.movie, showtimes: detail.upcomingShowtimes }],
        }
      }
      if (focusMovie && (msg.includes("phù hợp trẻ em") || msg.includes("trẻ em xem được") || msg.includes("mấy tuổi"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        return { reply: `🔖 **${focusMovie.title}** phân loại **${detail.movie.rating || "chưa rõ"}**.`, cards: [] }
      }
      if (focusMovie && (msg.includes("phụ đề") || msg.includes("thuyết minh") || msg.includes("ngôn ngữ") || msg.includes("lồng tiếng"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        return {
          reply: detail.movie.language
            ? `🗣️ **${focusMovie.title}**: ${detail.movie.language}.`
            : `😔 Mình chưa có thông tin phụ đề/ngôn ngữ cho **${focusMovie.title}**, bạn kiểm tra lại ở trang chi tiết phim nhé!`,
          cards: [],
        }
      }
      if (focusMovie && (msg.includes("diễn viên") || msg.includes("đạo diễn") || msg.includes("ai đóng") || msg.includes("ai làm đạo diễn"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        const parts = [];
        if (msg.includes("đạo diễn") || msg.includes("ai làm đạo diễn")) {
          parts.push(detail.movie.director ? `🎬 Đạo diễn: **${detail.movie.director}**` : null);
        }
        if (msg.includes("diễn viên") || msg.includes("ai đóng")) {
          parts.push(detail.movie.cast ? `🎭 Diễn viên: **${detail.movie.cast}**` : null);
        }
        const filtered = parts.filter(Boolean);
        return {
          reply: filtered.length
            ? `${filtered.join("\n")} (phim **${focusMovie.title}**)`
            : `😔 Mình chưa có thông tin này cho **${focusMovie.title}**.`,
          cards: [],
        }
      }
      if (focusMovie && (msg.includes("rating") || msg.includes("đánh giá") || msg.includes("điểm số") || msg.includes("mấy sao"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        return {
          reply: Number(detail.movie.average_rating) > 0
            ? `⭐ **${focusMovie.title}** được đánh giá **${Number(detail.movie.average_rating).toFixed(1)}/5** (${detail.movie.rating_count || 0} lượt đánh giá).`
            : `😔 **${focusMovie.title}** chưa có đánh giá nào.`,
          cards: [],
        }
      }
      // "phim giống X" / "phim tương tự X" — tìm phim cùng thể loại với
      // focusMovie, loại trừ chính nó khỏi kết quả. Lấy thể loại qua
      // getMovieDetails() vì gazetteer (findMentionedMovie) chỉ có id/title,
      // không có genre sẵn.
      if (focusMovie && (msg.includes("giống") || msg.includes("tương tự"))) {
        const detail = await handlers.getMovieDetails({ movieId: focusMovie.id });
        const primaryGenre = (detail.movie.genre || "").split(",")[0]?.trim();
        if (primaryGenre) {
          const data = await handlers.searchMovies({ query: primaryGenre, status: "NOW_SHOWING" });
          const similar = data.movies.filter((m) => m.id !== focusMovie.id);
          if (similar.length > 0) {
            return {
              reply: `🎬 Phim cùng thể loại **${primaryGenre}** với **${focusMovie.title}**:`,
              cards: [{ type: "movie_list", movies: similar.slice(0, 5) }],
            }
          }
        }
        return { reply: `😔 Mình chưa tìm được phim nào tương tự **${focusMovie.title}** đang chiếu. Bạn xem thử danh sách phim hot hiện tại nhé!`, cards: [] }
      }
      // "phim này chiếu đến khi nào" / "sắp hết chiếu chưa" — ngày chiếu CUỐI
      // CÙNG hiện có trong lịch (không phải cam kết ngày ngừng chiếu chính
      // thức, vì lịch có thể được tạo thêm sau — nêu rõ trong câu trả lời để
      // không hiểu lầm thành thông tin chắc chắn).
      if (focusMovie && (msg.includes("chiếu đến khi nào") || msg.includes("chiếu tới khi nào") || msg.includes("còn chiếu không") || msg.includes("sắp hết chiếu") || msg.includes("chiếu tới bao giờ") || msg.includes("chiếu đến bao giờ"))) {
        const data = await handlers.getLastShowtimeDate({ movieId: focusMovie.id });
        if (data.lastDate) {
          return {
            reply: `📅 **${focusMovie.title}** hiện có lịch chiếu tới ngày **${data.lastDate.split("-").reverse().join("/")}** (lịch có thể được cập nhật thêm sau đó, bạn kiểm tra lại gần ngày để chắc chắn nhé).`,
            cards: [],
          }
        }
        return { reply: `😔 Hiện **${focusMovie.title}** chưa có suất chiếu nào sắp tới trong hệ thống — có thể phim đã ngừng chiếu hoặc lịch chưa được cập nhật.`, cards: [] }
      }
    }

    // 2. Lịch sử vé của user
    if (msg.includes("vé của tôi") || msg.includes("lịch sử") || msg.includes("đã đặt") || msg.includes("vé tôi")) {
      const data = await handlers.getUserBookings({ status: "all", limit: 5 });
      if (data.error) return { reply: "🔐 " + data.error, cards: [] };
      return { reply: `🎫 Bạn có ${data.count} vé gần đây:`, cards: [{ type: "booking_list", bookings: data.bookings }] };
    }

    // 2b. Lọc suất chiếu theo KHUNG GIỜ trong ngày ("suất buổi tối", "có suất
    // sáng không", "suất sớm nhất/muộn nhất") — PHẢI xét TRƯỚC bước 3 (lịch
    // chiếu chung chung ngay dưới), cùng lý do đã áp dụng cho duration/price
    // filter ở bước 4a: câu "suất chiếu buổi tối có phim gì" chứa sẵn cụm
    // "suất chiếu" nên nếu để bước 3 xét trước sẽ nuốt mất, trả về TOÀN BỘ
    // lịch chiếu trong ngày thay vì lọc đúng khung giờ người dùng muốn.
    const timeOfDayFilter = parseTimeOfDayFilter(msg);
    if (timeOfDayFilter) {
      const data = await handlers.getShowtimesByTimeOfDay({
        date: focusDate || undefined,
        movieTitle: entities.movie?.title,
        cinemaName: entities.cinema?.name,
        ...timeOfDayFilter,
      });
      const label = timeOfDayFilter.label;
      const movieLabel = entities.movie ? ` phim **${entities.movie.title}**` : "";
      if (data.count > 0) {
        return { reply: `🕐 Suất chiếu ${label}${movieLabel}:`, cards: [{ type: "showtime_list", showtimes: data.showtimes }] };
      }
      return { reply: `😔 Không tìm thấy suất chiếu nào ${label}${movieLabel}. Bạn xem lịch chiếu đầy đủ để biết thêm nhé!`, cards: [] };
    }

    // 3. Lịch chiếu / giờ chiếu (nhận diện ngày cụ thể + tên phim/rạp nếu có nhắc tới)
    if (
      msg.includes("lịch chiếu") || msg.includes("suất chiếu") || msg.includes("giờ chiếu") ||
      msg.includes("chiếu lúc mấy") || msg.includes("chiếu mấy giờ") ||
      msg.includes("tra lịch") || msg.includes("xem lịch") || msg.includes("check lịch") ||
      (msg.includes("lịch") && (msg.includes("hôm nay") || msg.includes("ngày mai") || !!focusDate)) ||
      (msg.includes("hôm nay") && (msg.includes("chiếu") || msg.includes("suất"))) ||
      // Có ngày cụ thể (hôm nay/ngày mai/thứ mấy/dd-mm) + ý định xem phim —
      // vd "tôi muốn xem phim vào ngày mai", "phim hôm nay có gì" — người
      // dùng không nhất thiết gõ đúng chữ "lịch chiếu"/"suất chiếu". Tín hiệu
      // này khá RỘNG (chỉ cần 1 từ ngày + 1 từ chung chung), nên CHỈ áp dụng
      // khi KHÔNG có tín hiệu tâm trạng rõ ràng hơn — nếu không, câu như "tối
      // nay đi xem phim với bạn gái cho lãng mạn" sẽ bị nuốt vào đây, bỏ lỡ
      // gợi ý đúng mood (xem bước 6).
      (!!entities.date && !matchedMood && (msg.includes("xem") || msg.includes("coi") || msg.includes("phim")))
    ) {
      const data = await handlers.getShowtimes({
        date: focusDate || undefined,
        movieTitle: entities.movie?.title,
        cinemaName: entities.cinema?.name,
      });
      const dateLabel = focusDate ? ` ngày ${focusDate.split("-").reverse().join("/")}` : ""
      const movieLabel = entities.movie ? ` phim **${entities.movie.title}**` : ""
      return { reply: `📅 Lịch chiếu${movieLabel}${dateLabel} (${data.count} suất):`, cards: [{ type: "showtime_list", showtimes: data.showtimes }] };
    }

    // 3b. Giá theo loại phòng cụ thể (vd "phòng vip giá bao nhiêu", "imax có đắt không")
    // Chạy TRƯỚC FAQ tĩnh vì FAQ có pattern "loại phòng" rộng, dễ chặn nhầm các câu hỏi giá.
    if (entities.roomType && (msg.includes("giá") || msg.includes("đắt") || msg.includes("bao nhiêu tiền") || msg.includes("rẻ"))) {
      const askedRoomType = entities.roomType
      const data = await handlers.getRoomPricing()
      const row = data.roomPricing.find((r) => r.room_type === askedRoomType)
      if (row) {
        return {
          reply: `💰 Giá phòng **${askedRoomType.toUpperCase()}**: từ ${formatVND(row.min_price)} đến ${formatVND(row.max_price)} (trung bình ${formatVND(row.avg_price)}). Giá thay đổi theo suất chiếu (giờ vàng cao hơn giờ thường).`,
          cards: [],
        }
      }
      return { reply: `😔 Hiện chưa có suất chiếu nào ở phòng ${askedRoomType.toUpperCase()} trong thời gian tới.`, cards: [] }
    }
    if (msg.includes("so sánh giá") && msg.includes("phòng")) {
      const data = await handlers.getRoomPricing()
      const lines = data.roomPricing.map((r) => `- **${r.room_type.toUpperCase()}**: trung bình ${formatVND(r.avg_price)}`)
      return { reply: `💰 So sánh giá các loại phòng (giá trung bình):\n${lines.join("\n")}\n\nPhòng cao cấp hơn (VIP/IMAX/4DX) sẽ có giá cao hơn phòng Standard.`, cards: [] }
    }

    // 3b2. So sánh 2+ phim cụ thể (vd "so sánh phim A và B", hoặc chỉ "so
    // sánh A và B" không cần nói chữ "phim" nếu A/B là tên phim thật). Trước
    // đây bắt buộc câu phải chứa CẢ "so sánh" LẪN chữ "phim" mới xét — nhưng
    // người dùng thường chỉ nêu thẳng 2 tên phim mà không nói "phim" (vd "so
    // sánh The Dark Knight Returns và Transformers"), khiến câu so sánh hoàn
    // toàn hợp lệ bị bỏ qua dù findAllMentionedMovies nhận diện đúng cả 2 tên
    // phim thật. entities.movie (findMentionedMovie) chỉ giữ lại 1 kết quả
    // "khớp tốt nhất" nên trước đó còn 1 lớp lỗi khác: chỉ trả lời về phim
    // nhắc SAU CÙNG, hoàn toàn bỏ qua phim đầu — không đúng trọng tâm câu hỏi
    // "so sánh". Dùng findAllMentionedMovies để lấy đủ tất cả phim thật sự
    // được nhắc tới trong câu, chỉ cần có "so sánh" là đủ điều kiện xét.
    // Cũng xét khi câu KHÔNG có chữ "so sánh" nhưng rõ ràng đang PHÂN VÂN
    // CHỌN GIỮA 2 phim thật cụ thể bằng "hay"/"hoặc" (vd "tôi nên xem John
    // Wick hay Venom") — cách hỏi rất tự nhiên, phổ biến hơn cả nói "so
    // sánh". Trước đây câu này rơi vào nhánh "tôi nên xem" (gợi ý cá nhân
    // hoá chung chung), bỏ qua việc người dùng đã nêu thẳng 2 phim cụ thể
    // muốn được so sánh để chọn. CHỈ bắt "hay"/"hoặc" khi đã chắc chắn tìm
    // được ≥2 phim thật (không xét "hay" một mình — tránh lặp lại đúng lỗi
    // "hay" (tốt) bị nhầm "hay" (hoặc) đã sửa ở nhánh phim hot).
    if (msg.includes("so sánh") || msg.includes(" hay ") || msg.includes("hoặc")) {
      const movieCache = await nlu.getMovieTitleCache()
      const allMovies = nlu.findAllMentionedMovies(msg, movieCache)
      if (allMovies.length >= 2) {
        const details = await Promise.all(allMovies.slice(0, 3).map((m) => handlers.getMovieDetails({ movieId: m.id })))
        const lines = details.map(({ movie }) => {
          const ratingLabel = Number(movie.average_rating) > 0 ? `${Number(movie.average_rating).toFixed(1)}/5` : "chưa có đánh giá"
          return `**${movie.title}**\n- Thể loại: ${movie.genre || "chưa rõ"}\n- Thời lượng: ${movie.duration} phút\n- Đánh giá: ${ratingLabel}\n- Phân loại: ${movie.rating || "chưa rõ"}`
        })
        return {
          reply: `🎬 So sánh ${details.length} phim:\n\n${lines.join("\n\n")}`,
          cards: [{ type: "movie_list", movies: details.map((d) => d.movie) }],
        }
      }
    }

    // 3c. Câu hỏi về quy trình/chính sách (FAQ tĩnh)
    const faqReply = matchFAQ(msg)
    if (faqReply) return { reply: faqReply, cards: [] }

    // 3d. Ý ĐỊNH đặt vé thật sự (khác với câu hỏi "cách đặt vé thế nào" đã xử
    // lý ở FAQ trên) — vd "tôi muốn đặt 3 vé", "đặt vé phim Batman cho tôi",
    // hoặc chỉ "tôi muốn 15 vé" (không nói rõ "đặt"/"mua" nhưng entities.
    // seatCount đã bắt được số lượng + "muốn" đủ để hiểu là ý định đặt vé).
    // Chatbot không tự chốt được ghế/thanh toán qua chat, nên dẫn thẳng người
    // dùng tới đúng suất chiếu (nếu có nhắc tên phim) để họ bấm vào chọn ghế.
    if (msg.includes("muốn đặt") || msg.includes("muốn mua") || msg.includes("đặt vé") || msg.includes("mua vé") || msg.includes("đặt giúp") || (entities.seatCount != null && msg.includes("muốn"))) {
      // Chủ động cảnh báo giới hạn 10 ghế/lượt NGAY nếu số lượng hỏi đã vượt
      // — tránh người dùng chọn ghế xong ở bước sau mới biết bị chặn giữa chừng.
      const seatLimitNote = entities.seatCount != null && entities.seatCount > 10
        ? `\n\n⚠️ Lưu ý: mỗi lượt đặt vé tối đa **10 ghế** — bạn cần tách thành nhiều lượt đặt nếu muốn ${entities.seatCount} vé.`
        : ""
      if (entities.movie) {
        const data = await handlers.getShowtimes({ movieTitle: entities.movie.title, date: focusDate || undefined });
        return {
          reply: `🎟️ Để đặt vé phim **${entities.movie.title}**, bạn chọn 1 suất chiếu bên dưới rồi bấm vào để tới bước chọn ghế nhé!${seatLimitNote}`,
          cards: [{ type: "showtime_list", showtimes: data.showtimes }],
        }
      }
      return {
        reply: `🎬 Bạn muốn đặt vé phim nào? Cho mình biết tên phim (hoặc rạp/ngày bạn muốn xem), mình sẽ tìm suất chiếu phù hợp ngay!${seatLimitNote}`,
        cards: [],
      }
    }

    // 3e. Hỏi còn ghế/vé trống hay không (không nhắc phim cụ thể) — mỗi thẻ
    // suất chiếu đã có sẵn số ghế trống, nên trả về lịch chiếu là đủ trả lời.
    // "còn suất"/"còn bao nhiêu suất" — hỏi SỐ LƯỢNG SUẤT CHIẾU còn lại (khác
    // "còn ghế" hỏi CHỖ NGỒI trong 1 suất, nhưng cùng trả lời được bằng lịch
    // chiếu) — trước đây thiếu cụm này, câu như "giờ này còn bao nhiêu suất"
    // lọt qua hết các nhánh và rơi nhầm vào nhánh "phim hot" (do chữ "hay"
    // trong "suất hay liệt kê" khớp nhầm với "phim hay").
    if (msg.includes("còn ghế") || msg.includes("còn vé") || msg.includes("còn chỗ") || msg.includes("hết vé") || msg.includes("hết ghế") || msg.includes("còn suất") || msg.includes("còn bao nhiêu suất")) {
      const data = await handlers.getShowtimes({ date: focusDate || undefined, movieTitle: entities.movie?.title, cinemaName: entities.cinema?.name });
      return {
        reply: `📅 Đây là các suất chiếu còn ghế trống${entities.movie ? ` cho phim **${entities.movie.title}**` : ""}:`,
        cards: [{ type: "showtime_list", showtimes: data.showtimes }],
      }
    }

    // 3f. Lọc COMBO/ĐỒ ĂN theo giá ("combo nào rẻ nhất", "đồ ăn dưới 50k") —
    // PHẢI xét TRƯỚC bước 4a ngay dưới, vì parsePriceFilter (lọc PHIM theo
    // giá vé) dùng chung 1 kiểu regex số tiền không cần ngữ cảnh combo — nếu
    // để 4a xét trước, câu hỏi combo sẽ bị hiểu nhầm thành hỏi giá vé phim.
    const comboPriceFilter = parseComboPriceFilter(msg);
    if (comboPriceFilter) {
      const data = await handlers.searchCombosByPrice(comboPriceFilter);
      if (data.count > 0) {
        const label = comboPriceFilter.superlative === "cheapest" ? "rẻ nhất"
          : comboPriceFilter.superlative === "priciest" ? "đắt nhất"
          : comboPriceFilter.dir === "gt" ? `trên ${formatVND(comboPriceFilter.amount)}` : `dưới ${formatVND(comboPriceFilter.amount)}`;
        const lines = data.combos.map((c) => `- **${c.name}**: ${formatVND(c.price)}`);
        return { reply: `🍿 Combo/đồ ăn ${label}:\n${lines.join("\n")}`, cards: [{ type: "combo_list", combos: data.combos }] };
      }
      return { reply: "🍿 Không tìm thấy combo nào khớp mức giá bạn hỏi. Hỏi mình \"giá combo\" để xem đầy đủ danh sách nhé!", cards: [] };
    }

    // 4a. Lọc phim theo THỜI LƯỢNG ("phim dài trên 2 tiếng", "phim ngắn nhất")
    // hoặc GIÁ VÉ ("phim nào dưới 100k", "phim giá dưới 100k") — PHẢI xét
    // TRƯỚC bước 4b (giá vé/combo chung chung ngay dưới đây). Cả 2 câu ví dụ
    // trên đều chứa/ngầm liên quan tới từ "giá", nên nếu để bước 4b (chỉ cần
    // thấy chữ "giá" là trả lời) chạy trước, nó sẽ "nuốt" mất câu hỏi đáng lẽ
    // phải lọc theo mức giá cụ thể, trả về bảng giá chung chung sai trọng tâm.
    // Tương tự cũng phải xét trước bước 7/8 (phim hot/đang chiếu) vì các câu
    // này thường lẫn từ "đang chiếu"/"phim gì" khiến bị bước đó "nuốt" mất.
    const durationFilter = parseDurationFilter(msg);
    if (durationFilter) {
      const data = await handlers.searchMoviesByDuration(durationFilter);
      if (data.count > 0) {
        const fmtDuration = (mins) => (mins % 60 === 0 ? `${mins / 60} tiếng` : `${mins} phút`);
        const label = durationFilter.superlative === "shortest" ? "ngắn nhất"
          : durationFilter.superlative === "longest" ? "dài nhất"
          : durationFilter.dir === "gt" ? `trên ${fmtDuration(durationFilter.minutes)}`
          : `dưới ${fmtDuration(durationFilter.minutes)}`;
        return { reply: `⏱️ Phim ${label} đang chiếu:`, cards: [{ type: "movie_list", movies: data.movies }] };
      }
      return { reply: "⏱️ Hiện chưa có phim nào đang chiếu khớp thời lượng bạn tìm. Bạn xem danh sách phim đang chiếu để biết thêm nhé!", cards: [] };
    }
    const priceFilter = parsePriceFilter(msg);
    if (priceFilter) {
      const data = await handlers.searchMoviesByPrice(priceFilter);
      if (data.count > 0) {
        const label = priceFilter.superlative === "cheapest" ? "rẻ nhất"
          : priceFilter.superlative === "priciest" ? "đắt nhất"
          : priceFilter.dir === "gt" ? `trên ${formatVND(priceFilter.amount)}` : `dưới ${formatVND(priceFilter.amount)}`;
        return { reply: `💰 Phim có suất chiếu giá vé ${label}:`, cards: [{ type: "movie_list", movies: data.movies }] };
      }
      return { reply: "💰 Hiện chưa tìm thấy suất chiếu nào khớp mức giá bạn tìm. Hỏi mình \"giá vé bao nhiêu\" để xem khoảng giá hiện tại nhé!", cards: [] };
    }

    // 4b. Giá vé / combo (chung chung, không lọc theo mức giá cụ thể)
    if (msg.includes("giá") || msg.includes("combo") || msg.includes("bắp") || msg.includes("nước ngọt") || msg.includes("bao nhiêu tiền") || msg.includes("giá vé")) {
      const data = await handlers.getPricing({ type: "all" });
      return { reply: "💰 Thông tin giá vé và combo:", cards: [{ type: "pricing", tickets: data.tickets, combos: data.combos }] };
    }

    // 5. Danh sách rạp (trả lời cụ thể nếu có nhắc tên 1 rạp)
    if (msg.includes("rạp") || msg.includes("cinema") || msg.includes("địa điểm") || msg.includes("rạp chiếu") || msg.includes("ở đâu")) {
      // Hỏi RẠP CỤ THỂ đang chiếu PHIM GÌ (vd "rạp CGV Vincom có phim gì") —
      // ý định thật là muốn xem DANH SÁCH PHIM/SUẤT CHIẾU tại rạp đó, không
      // phải địa chỉ rạp — trước đây luôn trả về địa chỉ dù câu hỏi rõ ràng
      // đang hỏi về phim, lạc đề so với điều người dùng thực sự cần.
      if (entities.cinema && (msg.includes("phim gì") || msg.includes("phim nào") || msg.includes("chiếu phim") || msg.includes("có phim"))) {
        const data = await handlers.getShowtimes({ cinemaName: entities.cinema.name, date: focusDate || undefined });
        if (data.count > 0) {
          return { reply: `🎬 Phim đang chiếu tại **${entities.cinema.name}**:`, cards: [{ type: "showtime_list", showtimes: data.showtimes }] }
        }
        return { reply: `😔 Hiện chưa có suất chiếu nào sắp tới tại **${entities.cinema.name}** trong hệ thống.`, cards: [] }
      }
      const data = await handlers.getCinemas({});
      if (entities.cinema) {
        const found = data.cinemas.find((c) => c.id === entities.cinema.id)
        if (found) return { reply: `📍 **${found.name}** — ${found.location}`, cards: [{ type: "cinema_list", cinemas: [found] }] }
      }
      return { reply: `📍 Có ${data.count} rạp chiếu phim:`, cards: [{ type: "cinema_list", cinemas: data.cinemas }] };
    }

    // 5b. Gợi ý cá nhân hoá theo lịch sử xem của user
    // PHẢI loại trừ khi đã có matchedMood rõ ràng — "tôi nên xem" là cụm rất
    // rộng, dễ vô tình khớp ngay TRONG 1 câu đang thổ lộ tâm trạng cụ thể (vd
    // "tôi đang buồn quá không biết tôi nên xem phim gì" chứa sẵn "tôi nên
    // xem" như 1 phần câu, không phải ý định RIÊNG BIỆT xin gợi ý cá nhân
    // hoá) — kiểm chứng trực tiếp: câu trên bị nuốt mất tín hiệu "buồn" hoàn
    // toàn rõ ràng, trả về "top phim hot" chung chung thay vì gợi ý phim hài/
    // hoạt hình đúng tâm trạng. Tâm trạng cụ thể luôn là tín hiệu ưu tiên hơn
    // (xử lý ở bước 6 ngay dưới), personalization chung chung chỉ nên áp dụng
    // khi KHÔNG có tâm trạng cụ thể nào rõ hơn.
    const wantsSuggestion = msg.includes("gợi ý") || msg.includes("đề xuất") || msg.includes("nên xem");
    const isPersonal = msg.includes("cho tôi") || msg.includes("riêng") || msg.includes("hợp với tôi") || msg.includes("dành cho tôi");
    if (!matchedMood && ((wantsSuggestion && isPersonal) || msg.includes("tôi nên xem"))) {
      const data = await handlers.getPersonalizedRecommendations({ limit: 5 });
      const reply = data.personalized
        ? `🎯 Dựa trên các phim bạn từng xem, đây là gợi ý dành riêng cho bạn:`
        : `🔥 Mình chưa có đủ lịch sử xem của bạn, đây là top phim hot hiện tại:`;
      return { reply, cards: [{ type: "movie_list", movies: data.movies }] };
    }

    // 5d. Yêu cầu thể loại tường minh "phim buồn" — PHẢI xét TRƯỚC bước 6
    // (mood classifier), xem giải thích ở isExplicitSadMovieRequest() phía trên.
    if (isExplicitSadMovieRequest(msg)) {
      const data = await handlers.searchMovies({ query: "Drama", status: "NOW_SHOWING" });
      if (data.count > 0) {
        return {
          reply: "🎭 Phim tâm lý/bi kịch đang chiếu, chạm đến cảm xúc:",
          cards: [{ type: "movie_list", movies: data.movies.slice(0, 5) }],
        };
      }
    }

    // 6. MOOD/CONTEXT DETECTION — chấm điểm TẤT CẢ tâm trạng theo số từ khoá
    // khớp, chọn tâm trạng khớp NHIỀU NHẤT (thông minh hơn kiểu "khớp đầu tiên
    // thắng" cũ — câu có nhiều tín hiệu trộn lẫn sẽ được phân loại đúng hơn).
    // matchedMood đã tính SẴN ở đầu hàm (dùng lại ở bước 3), không tính lại.
    if (matchedMood) {
      const mood = matchedMood;
      // Tìm phim theo thể loại phù hợp — thử từng genre
      for (const genre of mood.genres) {
        const data = await handlers.searchMovies({ query: genre, status: "NOW_SHOWING" });
        if (data.count > 0) {
          const movies = data.movies.slice(0, 5);
          return {
            reply: withTopMovie(`${mood.reply}\n\n💡 _${mood.suggestion}_`, movies),
            cards: [{ type: "movie_list", movies }],
          };
        }
      }
      // ĐÃ BỎ nhánh tìm theo genre với status:"all" từng có ở đây — bug thật
      // đã xảy ra: "all" gồm cả phim ENDED, khiến bot gợi ý phim ĐÃ NGỪNG
      // CHIẾU cho người dùng đi xem (vd The Super Mario Bros. Movie, ENDED,
      // từng bị 👎 vì lý do này). Không có ích gì khi gợi ý 1 phim không xem
      // được — thà rơi thẳng xuống phim hot NOW_SHOWING bên dưới còn hơn.
      //
      // Nếu vẫn không tìm được → fallback sang phim hot, NHƯNG dùng câu trả
      // lời THẬT THÀ khác hẳn mood.reply gốc — trước đây dùng nguyên
      // mood.reply/mood.suggestion (vd "Phim lãng mạn cho buổi hẹn hò ý
      // nghĩa 🌹") rồi lại hiện ra **John Wick** (phim hành động) làm gợi ý
      // đầu tiên, vì rạp hiện KHÔNG có phim nào thể loại Romance/Comedy đang
      // chiếu — trông như bot nói dối/không hiểu ý. Rạp thật gặp tình huống
      // này cũng chỉ nên nói thẳng "chưa có phim đúng gu, đây là top phim
      // đang chiếu thay thế", không giả vờ phim hot là đúng thể loại đã hỏi.
      const hotData = await handlers.getPopularMovies({ status: "NOW_SHOWING", limit: 5 });
      return {
        reply: withTopMovie(`😔 Hiện chưa có phim nào đúng gu bạn đang chiếu. Đây là top phim đang được xem nhiều nhất thay thế:`, hotData.movies),
        cards: [{ type: "movie_list", movies: hotData.movies }],
      };
    }

    // 7. Phim hot / phổ biến / đề xuất — kể cả câu hỏi mở kiểu "có phim gì",
    // "coi phim gì", "bây giờ có phim gì" (rất phổ biến, không nhất thiết có
    // các từ khoá "hot"/"trending" cụ thể)
    // Loại trừ khi đã nhận diện được TÊN NGƯỜI cụ thể (entities.person) —
    // các cụm bắt rộng ở đây ("hay", "phim gì", "gợi ý phim") rất dễ lẫn vào
    // câu hỏi tìm phim theo diễn viên/đạo diễn (vd "gợi ý phim có Tom Hardy",
    // "Zendaya đóng phim gì"), nếu không loại trừ thì nhánh 9a2 bên dưới
    // không bao giờ được chạy tới với các câu này.
    // 6b. Phim ĐIỂM ĐÁNH GIÁ cao nhất — TÁCH RIÊNG khỏi nhánh "phim hot" ngay
    // dưới (xem giải thích ở getTopRatedMoviesDB): "rating"/"đánh giá"/"điểm"
    // là hỏi về ĐIỂM CHẤM thật của người xem, khác hẳn "hot"/"phổ biến" (đo
    // bằng vé bán). Phải xét TRƯỚC nhánh "hot" vì cùng có thể chứa chữ "cao"/
    // "tốt" gây nhầm nếu gộp chung.
    if (!entities.person && (msg.includes("rating cao") || msg.includes("rating tốt") || msg.includes("đánh giá cao") || msg.includes("điểm cao") || msg.includes("review tốt"))) {
      const rated = await handlers.getTopRatedMovies({ status: "NOW_SHOWING", limit: 6 });
      if (rated.count > 0) {
        return { reply: withTopMovie(`⭐ Top ${rated.count} phim được đánh giá cao nhất (theo điểm chấm thật của người xem):`, rated.movies), cards: [{ type: "movie_list", movies: rated.movies }] };
      }
      // Chưa có phim nào đủ lượt đánh giá thật — nói rõ thay vì im lặng rơi
      // xuống danh sách phim hot (sẽ trông như bot "lờ" đúng ý hỏi đánh giá).
      const hotFallback = await handlers.getPopularMovies({ status: "NOW_SHOWING", limit: 6 });
      return { reply: withTopMovie(`😔 Hiện chưa có phim nào đủ lượt đánh giá thật để xếp hạng. Đây là top phim đang được xem nhiều nhất thay thế:`, hotFallback.movies), cards: [{ type: "movie_list", movies: hotFallback.movies }] };
    }

    if (
      !entities.person && (
        msg.includes("hot") || msg.includes("phổ biến") || msg.includes("hay nhất") || msg.includes("trending") ||
        msg.includes("đề xuất") || msg.includes("gợi ý phim") || msg.includes("hay") || msg.includes("phim gì") ||
        // Yêu cầu thêm LỰA CHỌN KHÁC — không kèm lời chê cụ thể 1 phim (đã xử
        // lý riêng ở bước 0b), chỉ đơn giản muốn xem thêm gợi ý khác. Không
        // biết chính xác phim nào đã hiện ra lượt trước (frontend chỉ lưu
        // text, không lưu cards — xem comment withTopMovie phía trên) nên chỉ
        // trả lại top phim hot, không lọc trừ được phim đã gợi ý.
        msg.includes("phim khác") || msg.includes("gợi ý khác") || msg.includes("gợi ý thêm")
      )
    ) {
      const data = await handlers.getPopularMovies({ status: "NOW_SHOWING", limit: 6 });
      return { reply: withTopMovie(`🔥 Top ${data.count} phim hot nhất đang chiếu:`, data.movies), cards: [{ type: "movie_list", movies: data.movies }] };
    }

    // 8. Phim đang chiếu / sắp chiếu
    if (msg.includes("đang chiếu") || msg.includes("now showing") || msg.includes("phim mới")) {
      const data = await handlers.getPopularMovies({ status: "NOW_SHOWING", limit: 8 });
      // Nói rõ TỔNG và số đang hiển thị — không gộp làm một (xem getPopularMoviesDB)
      const reply = data.total > data.count
        ? `🎬 Đang có ${data.total} phim đang chiếu — đây là ${data.count} phim nổi bật nhất:`
        : `🎬 Đang có ${data.total} phim đang chiếu:`;
      return { reply, cards: [{ type: "movie_list", movies: data.movies }] };
    }
    if (msg.includes("sắp chiếu") || msg.includes("coming soon") || msg.includes("sắp ra") || msg.includes("sắp có")) {
      const data = await handlers.getPopularMovies({ status: "COMING_SOON", limit: 8 });
      const replySap = data.total > data.count
        ? `🎭 Có ${data.total} phim sắp chiếu — đây là ${data.count} phim đáng chú ý nhất:`
        : `🎭 Phim sắp chiếu (${data.total} phim):`;
      return { reply: replySap, cards: [{ type: "movie_list", movies: data.movies }] };
    }

    // 9a. Tên phim được nhận diện CHÍNH XÁC từ danh sách phim thật (đáng tin
    // hơn tìm mờ ở bước 9b) → trả thông tin chi tiết kèm suất chiếu luôn
    if (entities.movie) {
      const detail = await handlers.getMovieDetails({ movieId: entities.movie.id });
      return {
        reply: `🎬 **${detail.movie.title}** — bạn muốn xem lịch chiếu hay giá vé của phim này không?`,
        cards: [{ type: "movie_detail", movie: detail.movie, showtimes: detail.upcomingShowtimes }],
      };
    }

    // 9a2. Tên diễn viên/đạo diễn được nhận diện CHÍNH XÁC từ gazetteer (NER
    // người, xem findMentionedPerson) — chỉ xét khi câu KHÔNG nêu tên phim cụ
    // thể (9a đã ưu tiên xử lý trước ở trên), tức đây là câu hỏi "phim nào có
    // X đóng"/"phim của đạo diễn X" chứ không phải hỏi chi tiết 1 phim đã biết.
    if (entities.person) {
      const data = await handlers.searchMoviesByPerson({ name: entities.person.name });
      if (data.count > 0) {
        const roleLabel = entities.person.role === "director" ? "đạo diễn" : entities.person.role === "cast" ? "diễn viên" : "diễn viên/đạo diễn";
        return {
          reply: `🎬 Phim có sự tham gia của ${roleLabel} **${entities.person.name}** (${data.count} phim):`,
          cards: [{ type: "movie_list", movies: data.movies }],
        };
      }
      return {
        reply: `😔 Hiện chưa có phim nào của **${entities.person.name}** trong hệ thống. Bạn xem thử danh sách phim đang chiếu nhé!`,
        cards: [],
      };
    }

    // 9a2. Câu hỏi RÕ RÀNG là tìm phim theo diễn viên (vd "phim nào có Tom
    // Cruise đóng", "Tom Cruise đóng phim gì") nhưng entities.person ở trên
    // KHÔNG nhận diện được — vì gazetteer chỉ chứa tên diễn viên/đạo diễn của
    // NHỮNG PHIM ĐÃ CÓ trong hệ thống (xem findMentionedPerson), nên 1 diễn
    // viên có thật ngoài đời nhưng chưa có phim nào trong catalog sẽ luôn bị
    // bỏ qua ở bước 9a — trước đây rơi thẳng xuống câu chào mặc định, trông
    // như bot không hiểu câu hỏi. Dò riêng CÚ PHÁP hỏi diễn viên bằng regex
    // (không cần biết tên có thật hay không) để ít nhất trả lời đúng sự thật
    // "chưa có phim nào của X" thay vì im lặng — dùng `message` GỐC (chưa qua
    // normalize/lowercase) để giữ đúng hoa/thường tên riêng khi hiển thị lại.
    if (!entities.person) {
      const actorSyntaxMatch = matchActorQuerySyntax(message);
      const candidateName = actorSyntaxMatch?.[1]?.trim();
      if (candidateName && candidateName.length >= 2 && candidateName.length <= 40) {
        return {
          reply: `😔 Hiện chưa có phim nào của **${candidateName}** trong hệ thống. Bạn xem thử danh sách phim đang chiếu nhé!`,
          cards: [],
        };
      }
    }

    // 9b. Tìm kiếm phim theo tên / diễn viên / đạo diễn (tìm mờ)
    // Loại bỏ các từ phổ biến trước khi tìm kiếm để tránh kết quả sai
    // LƯU Ý: dùng lookahead/lookbehind thay vì \b — \b trong JS regex chỉ nhận
    // diện ranh giới ASCII [A-Za-z0-9_], nên với từ tiếng Việt có dấu KẾT
    // THÚC bằng nguyên âm có dấu (vd "về", "nhé"), \b ở cuối từ không khớp
    // đúng, khiến từ đó không bị coi là stopword và làm hỏng LIKE query sau đó.
    const cleanQuery = message.toLowerCase().replace(FUZZY_SEARCH_STOPWORDS, " ").replace(/\s+/g, " ").trim();
    if (cleanQuery.length >= 3) {
      const data = await handlers.searchMovies({ query: cleanQuery, status: "all" });
      // Bỏ dấu cách/gạch ngang khi so khớp — khớp SQL đã tính tới việc gõ liền
      // không dấu cách (vd "spiderman" ~ "Spider-Man"), nhưng nếu bước kiểm
      // tra "có thực sự liên quan" dưới đây vẫn so trên chuỗi gốc còn "-" thì
      // kết quả đúng từ SQL vẫn bị loại oan ở đây.
      const stripPunct = (s) => s.replace(/[-\s]/g, "");
      if (data.count > 0 && data.movies.some((m) => {
        // Chỉ trả về nếu có ít nhất 1 kết quả thực sự liên quan (không phải do query quá chung)
        const lowerTitle = stripPunct(m.title.toLowerCase());
        const lowerGenre = stripPunct((m.genre || "").toLowerCase());
        const lowerDesc = (m.description || "").toLowerCase();
        return cleanQuery.split(" ").filter(w => w.length > 2).some(w =>
          lowerTitle.includes(stripPunct(w)) || lowerGenre.includes(stripPunct(w)) || lowerDesc.includes(w)
        );
      })) {
        const movies = data.movies.slice(0, 5);
        return { reply: withTopMovie(`🎬 Tìm thấy phim liên quan:`, movies), cards: [{ type: "movie_list", movies }] };
      }

      // 9c. Không tìm thấy gì cả → có thể do GÕ SAI tên phim. Lọc bỏ stopword
      // mạnh hơn nữa (giữ lại gần như chỉ TÊN RIÊNG người dùng gõ) rồi dùng
      // Levenshtein Distance tìm tên phim THẬT gần giống nhất, gợi ý "Có
      // phải bạn muốn tìm...?" — so khớp trên cụm từ đã lọc sạch thay vì cả
      // câu thô để khoảng cách edit không bị "loãng" bởi từ không liên quan.
      const levQuery = nlu.tokenizeForClassification(message).join(" ");
      const allMovies = await nlu.getMovieTitleCache();
      const closest = textDistance.findClosestMatch(levQuery || cleanQuery, allMovies, (m) => m.title);
      if (closest) {
        const detail = await handlers.getMovieDetails({ movieId: closest.item.id });
        return {
          reply: `🤔 Mình không tìm thấy phim đúng như vậy, có phải bạn muốn tìm **${closest.item.title}** không?`,
          cards: [{ type: "movie_detail", movie: detail.movie, showtimes: detail.upcomingShowtimes }],
        };
      }
    }

    // 10. Mặc định — Cine persona welcome, CÓ NGỮ CẢNH nếu đang nói về 1 phim/rạp
    if (focusMovie) {
      return {
        reply:
          `Mình chưa chắc bạn muốn hỏi gì thêm về **${focusMovie.title}** 🤔\n\n` +
          "Bạn có thể hỏi cụ thể hơn:\n" +
          "- \"Phim đó chiếu lúc mấy giờ?\"\n" +
          "- \"Giá vé phim đó bao nhiêu?\"\n" +
          "- \"Phim đó có phù hợp trẻ em không?\"",
        cards: [],
      };
    }
    return {
      reply:
        "Xin chào! Mình là **Cine** 🎬 — người bạn điện ảnh của bạn.\n\n" +
        "Hôm nay bạn cảm thấy thế nào? Mình có thể giúp:\n" +
        "- 🎭 **Phim theo tâm trạng**: \"Tôi đang buồn\", \"Hôm nay hẹn hò\", \"Xem cùng gia đình\"\n" +
        "- 🔥 **Phim hot**: \"Phim hay nhất hiện tại\"\n" +
        "- 📅 **Lịch chiếu**: \"Lịch chiếu hôm nay\"\n" +
        "- 💰 **Giá vé**: \"Giá vé bao nhiêu?\"\n" +
        "- 🎫 **Tra vé**: Nhập mã BK...\n" +
        "- 📍 **Rạp chiếu**: \"Các rạp gần đây\"\n\n" +
        "Thử hỏi mình: _\"Hôm nay tôi mệt mỏi, nên xem phim gì?\"_ 😊",
      cards: [],
    };
  } catch (err) {
    console.error("Fallback error:", err.message);
    return { reply: "Xin lỗi, hệ thống đang gặp sự cố. Vui lòng thử lại sau.", cards: [] };
  }
}

function buildCards(results) {
  return (results || []).map((r) => {
    const d = r.data;
    if (!d || d.error) return null;
    // Phải xét TRƯỚC d.movies — kết quả tra điểm trên mạng có cấu trúc riêng
    if (d.ratings && d.sources) return { type: "web_ratings", title: d.title, description: d.description, ratings: d.ratings, sources: d.sources };
    if (d.movies)    return { type: "movie_list",    movies: d.movies };
    if (d.movie)     return { type: "movie_detail",  movie: d.movie, showtimes: d.upcomingShowtimes };
    if (d.showtimes) return { type: "showtime_list", showtimes: d.showtimes };
    if (d.cinemas)   return { type: "cinema_list",   cinemas: d.cinemas };
    if (d.booking)   return { type: "booking_detail",booking: d.booking };
    if (d.bookings)  return { type: "booking_list",  bookings: d.bookings };
    if (d.tickets)   return { type: "pricing",       tickets: d.tickets, combos: d.combos };
    if (d.combos && !d.tickets) return { type: "combo_list", combos: d.combos };
    return null;
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
// ROUTE HANDLERS
// ─────────────────────────────────────────────

/**
 * Log ẨN DANH 1 lượt hỏi-đáp (không kèm user_id/email/IP) để phân tích xu
 * hướng câu hỏi thật — ý định nào phổ biến, AI hay fallback trả lời, câu nào
 * bị đánh giá 👎 nhiều (qua bảng chatbot_feedback). Lỗi ghi log KHÔNG được
 * làm hỏng câu trả lời chính, nên nuốt lỗi và trả về null (interactionId
 * vắng mặt chỉ khiến nút feedback ở frontend không hiện ra, không vỡ luồng chat).
 *
 * `intent` PHẢI được truyền vào từ applyMarkovSuggestion (đã classify sẵn),
 * không tự classify lại ở đây — classifyIntentForMarkov gọi extractEntities
 * (dò tên phim/rạp), gọi thêm 1 lần nữa mỗi lượt chat là công thừa vô ích.
 */
async function logInteraction(message, reply, cards, aiAvailable, intent) {
  try {
    const sentiment = sentimentAnalysis.analyzeSentiment(message);
    return await ChatInteraction.create({
      message,
      reply,
      intent,
      aiAvailable,
      sentimentLabel: sentiment.label,
      hasCards: Array.isArray(cards) && cards.length > 0,
    });
  } catch (e) {
    console.error("Log chat lỗi (non-critical):", e.message);
    return null;
  }
}

async function chatWithAI(req, res) {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message là bắt buộc" });
    }

    // QUAN TRỌNG: danh tính user PHẢI lấy từ token đã xác thực (req.user, gắn
    // bởi middleware optionalAuth), KHÔNG được dùng userId do client tự gửi
    // trong body — nếu không, ai cũng có thể giả userId để xem vé/gợi ý của
    // người khác mà không cần đăng nhập.
    const handlers = buildHandlers(req.user?.id || null);
    // Admin có thể CHỦ ĐỘNG tắt AI ở Bảng quản trị (thẻ "Trợ lý ảo") — ví dụ
    // khi Gemini trục trặc, hoặc muốn demo riêng phần luật cứng. Chế độ "rules"
    // thì KHÔNG gọi Gemini lượt nào: không tốn hạn mức, không phải chờ.
    const { mode: chatbotMode } = await getChatbotConfig();
    const result = chatbotMode === "rules"
      ? { error: "Admin đang đặt chatbot ở chế độ luật cứng" }
      : await geminiService.chat(message.trim(), history, handlers);

    // Nếu AI thất bại do quota/lỗi → fallback về keyword matching
    if (result.quotaError || result.error) {
      console.log("AI không khả dụng, dùng fallback...");
      const fallback = await fallbackResponse(message.trim(), handlers, history);
      const markovResult = await applyMarkovSuggestion(fallback.reply, message.trim(), history);
      const reply = applySentimentEmpathy(markovResult.reply, message.trim());
      const interactionId = await logInteraction(message.trim(), reply, fallback.cards, false, markovResult.intent);
      return res.json({
        reply,
        cards: fallback.cards,
        aiAvailable: false,
        mode: chatbotMode,
        interactionId,
        timestamp: new Date().toISOString(),
      });
    }

    const markovResult = await applyMarkovSuggestion(result.reply, message.trim(), history);
    const reply = applySentimentEmpathy(markovResult.reply, message.trim());
    const cards = buildCards(result.results);
    const interactionId = await logInteraction(message.trim(), reply, cards, true, markovResult.intent);
    return res.json({
      reply,
      cards,
      aiAvailable: true,
      mode: "gemini",
      interactionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("ChatAI error:", error);
    // Fallback khi có exception
    try {
      const handlers = buildHandlers(req.user?.id || null);
      const msg = req.body?.message || "";
      const history = req.body?.history || [];
      const fallback = await fallbackResponse(msg, handlers, history);
      const markovResult = await applyMarkovSuggestion(fallback.reply, msg, history);
      const reply = applySentimentEmpathy(markovResult.reply, msg);
      const interactionId = await logInteraction(msg, reply, fallback.cards, false, markovResult.intent);
      return res.json({ reply, cards: fallback.cards, aiAvailable: false, interactionId, timestamp: new Date().toISOString() });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}

/** Người dùng đánh giá 1 câu trả lời hữu ích (👍) hay không (👎) — tín hiệu
 * dùng để biết fallback/AI đang trả lời sai ở đâu, phục vụ cải thiện dần. */
async function submitFeedback(req, res) {
  try {
    const { interactionId, rating } = req.body;
    if (!interactionId || (rating !== "up" && rating !== "down")) {
      return res.status(400).json({ error: "interactionId và rating ('up'|'down') là bắt buộc" });
    }
    await ChatInteraction.addFeedback(interactionId, rating);
    return res.json({ success: true });
  } catch (error) {
    console.error("Chat feedback error:", error.message);
    return res.status(400).json({ error: error.message || "Không thể lưu phản hồi" });
  }
}

/**
 * Trang admin "trend" chatbot — tổng hợp dữ liệu ẩn danh đã log để trả lời:
 * AI hay fallback đang trả lời nhiều hơn, ý định nào phổ biến nhất, sắc thái
 * người dùng ra sao, tỉ lệ 👍/👎, và các câu bị đánh giá 👎 gần đây (để biết
 * cụ thể chatbot đang trả lời sai chỗ nào, không chỉ nhìn con số tổng).
 */
async function getAnalytics(req, res) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    // buildTrendComparison() cần ÍT NHẤT 14 ngày dữ liệu để tính "7 ngày qua
    // so với 7 ngày trước" (7 ngày gần nhất + 7 ngày liền trước đó). Nếu admin
    // chọn filter "7 ngày qua", fetch đúng 7 ngày cho biểu đồ sẽ khiến 7 ngày
    // TRƯỚC ĐÓ NỮA không có trong dữ liệu — prev7Days LUÔN hiện "0/chưa có dữ
    // liệu" dù thực tế có thể có dữ liệu thật, trông như so sánh bị lỗi. Fetch
    // riêng đủ 14 ngày cho phần so sánh, biểu đồ hiển thị vẫn chỉ lấy đúng
    // `days` ngày gần nhất (cắt từ mảng 14 ngày này) — không tốn thêm truy vấn.
    const trendFetchDays = Math.min(Math.max(days, 14), 90);
    const [summary, intents, sentiments, feedback, recentDownvoted, recentUnanswered, trendSource] = await Promise.all([
      ChatInteraction.getSummary(days),
      ChatInteraction.getIntentDistribution(days),
      ChatInteraction.getSentimentDistribution(days),
      ChatInteraction.getFeedbackSummary(days),
      ChatInteraction.getRecentDownvoted(20, days),
      ChatInteraction.getRecentUnanswered(20, days),
      ChatInteraction.getDailyTrend(trendFetchDays),
    ]);
    const dailyTrend = trendSource.slice(-Math.min(days, 90));
    const trendComparison = buildTrendComparison(trendSource);
    return res.json({ days, summary, intents, sentiments, feedback, recentDownvoted, recentUnanswered, dailyTrend, trendComparison });
  } catch (error) {
    console.error("Chat analytics error:", error.message);
    return res.status(500).json({ error: "Không thể tải dữ liệu phân tích chatbot" });
  }
}

/** So sánh hôm nay với hôm qua, và 7 ngày gần nhất với 7 ngày trước đó —
 * trả lời trực tiếp câu hỏi "chatbot có đang cải thiện theo thời gian
 * không" thay vì admin phải tự nhìn biểu đồ rồi ước lượng bằng mắt. */
function buildTrendComparison(dailyTrend) {
  const byDate = new Map(dailyTrend.map((d) => [d.date, d]));
  // KHÔNG dùng d.toISOString() — quy đổi Date sang UTC trước khi cắt chuỗi,
  // lệch ngày so với dailyTrend (ChatInteraction.getDailyTrend, nhóm theo
  // DATE(created_at) — cột đã ở giờ VN sẵn trên server này, xem giải thích ở
  // Ticket.getDashboardStats()). Dùng formatLocalDateString
  // (getFullYear/getMonth/getDate — giờ địa phương) để khớp đúng ngày.
  const toDateKey = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return formatLocalDateString(d);
  };
  const dayMetrics = (d) => {
    if (!d) return { total: 0, aiRate: null, unansweredRate: null, satisfactionRate: null };
    const aiRate = d.total > 0 ? d.aiCount / d.total : null;
    const unansweredRate = d.total > 0 ? d.unansweredCount / d.total : null;
    const votes = d.upvotes + d.downvotes;
    const satisfactionRate = votes > 0 ? d.upvotes / votes : null;
    return { total: d.total, aiRate, unansweredRate, satisfactionRate };
  };
  const sumRange = (startOffset, endOffset) => {
    const acc = { total: 0, aiCount: 0, unansweredCount: 0, upvotes: 0, downvotes: 0 };
    for (let i = startOffset; i < endOffset; i++) {
      const d = byDate.get(toDateKey(i));
      if (!d) continue;
      acc.total += d.total;
      acc.aiCount += d.aiCount;
      acc.unansweredCount += d.unansweredCount;
      acc.upvotes += d.upvotes;
      acc.downvotes += d.downvotes;
    }
    return dayMetrics(acc.total > 0 ? acc : null);
  };
  return {
    today: dayMetrics(byDate.get(toDateKey(0))),
    yesterday: dayMetrics(byDate.get(toDateKey(1))),
    last7Days: sumRange(0, 7),
    prev7Days: sumRange(7, 14),
  };
}

/** Xoá sạch dữ liệu "học dần" của Markov chain (cả RAM lẫn DB) — dùng khi
 * muốn chatbot học lại từ đầu (vd sau khi phát hiện dữ liệu bị nhiễu). */
async function resetMarkovLearning(req, res) {
  try {
    await markov.resetLiveCounts();
    return res.json({ success: true });
  } catch (error) {
    console.error("Reset Markov chain error:", error.message);
    return res.status(500).json({ error: "Không thể reset dữ liệu học của chatbot" });
  }
}

async function search(req, res) {
  try {
    const result = await searchMoviesDB({ query: req.query.q || "", status: "all" });
    return res.json(result);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
}

async function getRecommendations(req, res) {
  try {
    const { genre, mood } = req.query;
    const query = genre || mood || "phim hay";
    const result = await getPopularMoviesDB({ status: "NOW_SHOWING", limit: 6 });
    const aiResult = await geminiService.chat(
      `Gợi ý phim ${genre ? "thể loại " + genre : ""} ${mood ? "cho tâm trạng " + mood : "hay nhất hiện tại"} từ danh sách này.`,
      [],
      {}
    );
    return res.json({ recommendation: aiResult.reply, ...result });
  } catch (error) {
    console.error("Recommendations error:", error);
    return res.status(500).json({ error: "Failed to get recommendations" });
  }
}

async function health(req, res) {
  try {
    await pool.query("SELECT 1");
    const aiTest = await geminiService.testConnection();
    return res.json({
      status: "ok",
      database: "connected",
      ai: aiTest.success ? "connected" : "error",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      aiMessage: aiTest.response || aiTest.error,
    });
  } catch (error) {
    console.error("Chatbot health check error:", error);
    return res.status(500).json({ status: "error", error: "Kiểm tra trạng thái thất bại" });
  }
}

// ─── Điều khiển chatbot từ Bảng quản trị (chỉ admin) ────────────────────────

/** Số câu hỏi ĐÃ được AI trả lời hôm nay — đếm từ log chat thật, không ước lượng. */
async function countAiQuestionsToday() {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS n FROM chatbot_interactions WHERE ai_available = 1 AND DATE(created_at) = CURDATE()",
  );
  return Number(row.n) || 0;
}

async function buildChatbotConfigPayload() {
  const cfg = await getChatbotConfig({ fresh: true });
  const envKey = String(process.env.GEMINI_API_KEY || "").trim();
  // Admin dán được nhiều khoá; mỗi khoá là một dự án Google với hạn mức riêng.
  const khoas = cfg.geminiApiKeys?.length ? cfg.geminiApiKeys : envKey ? [envKey] : [];
  const key = khoas[0] || null;
  // Hạn mức Google đếm theo SỐ LƯỢT GỌI API, không phải số câu hỏi: một câu hỏi
  // phức tạp có thể tốn 6+ lượt (mỗi lần AI tra cứu dữ liệu là 1 lượt). Trước đây
  // thẻ đếm số câu hỏi nên vẫn báo "còn 12 câu" trong khi Google đã trả 429.
  // Model đang dùng: admin chọn trên dashboard > biến môi trường > mặc định.
  const activeModel = cfg.model || geminiService.MODEL_MAC_DINH;
  const { requests: usedToday, quotaErrors } = await demLuotGoiHomNay(activeModel);
  const luotTheoModel = await demLuotGoiTheoModel();
  const questionsToday = await countAiQuestionsToday();
  return {
    mode: cfg.mode,
    model: activeModel,
    // Mỗi model có hạn mức RIÊNG 20 lượt/ngày — kèm số đã dùng để admin biết
    // model nào còn lượt mà chuyển sang khi đang demo.
    models: MODELS_GOI_Y.map((m) => ({ ...m, usedToday: luotTheoModel[m.id] || 0 })),
    hasKey: khoas.length > 0,
    soKhoa: khoas.length,
    keySource: cfg.geminiApiKeys?.length ? "db" : envKey ? "env" : "none",
    // CHỈ trả khoá đã che — khoá đầy đủ không bao giờ rời khỏi server.
    keyMasked: khoas.length > 1 ? `${maskKey(key)} +${khoas.length - 1} khoá nữa` : maskKey(key),
    // Hạn mức 20 lượt/ngày tính cho TỪNG model của TỪNG khoá, nên trần thật của
    // model đang dùng = dailyLimit × số khoá.
    dailyLimit: cfg.dailyLimit * Math.max(1, khoas.length),
    usedToday,
    remaining: Math.max(0, cfg.dailyLimit * Math.max(1, khoas.length) - usedToday),
    // Tổng sức chứa ước tính trong ngày: số khoá × số model × hạn mức mỗi model.
    tongSucChua: cfg.dailyLimit * Math.max(1, khoas.length) * MODELS_GOI_Y.length,
    // Số CÂU HỎI được AI trả lời hôm nay — để so sánh với số lượt gọi ở trên.
    questionsToday,
    quotaErrorsToday: quotaErrors,
    quotaCooldownSeconds: geminiService.getQuotaCooldownSeconds(activeModel),
  };
}

async function getChatbotRuntimeConfig(req, res) {
  try {
    return res.json(await buildChatbotConfigPayload());
  } catch (error) {
    console.error("Get chatbot config error:", error.message);
    return res.status(500).json({ error: "Không tải được cấu hình chatbot" });
  }
}

async function updateChatbotRuntimeConfig(req, res) {
  try {
    const { mode, apiKey, dailyLimit, model } = req.body || {};
    await updateChatbotConfig({
      ...(mode !== undefined ? { mode } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(dailyLimit !== undefined ? { dailyLimit } : {}),
      ...(model !== undefined ? { model } : {}),
    });
    // Dán khoá mới = bỏ luôn khoảng tạm ngưng do khoá CŨ hết hạn mức, để thử lại ngay.
    // Dán khoá mới HOẶC đổi model đều là "nguồn mới" -> bỏ khoảng tạm ngưng cũ.
    if (apiKey !== undefined || model !== undefined) geminiService.clearQuotaCooldown();
    return res.json(await buildChatbotConfigPayload());
  } catch (error) {
    console.error("Update chatbot config error:", error.message);
    return res.status(400).json({ error: error.message || "Không lưu được cấu hình chatbot" });
  }
}

module.exports = { chatWithAI, search, getRecommendations, health, submitFeedback, getAnalytics, resetMarkovLearning, getChatbotRuntimeConfig, updateChatbotRuntimeConfig };
