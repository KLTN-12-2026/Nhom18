/**
 * Google Gemini AI Service
 * - Function calling với database thực
 * - Hỗ trợ lịch sử hội thoại
 * - Vietnamese-first responses
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// KHÔNG tạo client sẵn ở đây: khoá có thể được admin đổi ngay trên Bảng quản
// trị (bảng system_settings) khi khoá cũ hết hạn mức, nên client được tạo lại
// theo khoá hiện hành ở mỗi lượt chat.
const { getChatbotConfig, updateChatbotConfig, ghiNhanLuotGoi, demLuotGoiTheoCap, idKhoa, MODELS_GOI_Y } = require("./chatbotConfig.service");
// KHÔNG ghim vào một số phiên bản cụ thể. Trước đây mặc định là "gemini-2.0-flash";
// Google đã gỡ model đó và MỌI request AI trả về 404 — chatbot âm thầm rơi hết
// về nhánh luật cứng, aiAvailable=false trên từng câu hỏi, mà không có gì trên
// giao diện báo hỏng. Một đề tài để lâu không đụng tới chắc chắn sẽ dính lại
// đúng lỗi này khi phiên bản kế tiếp bị gỡ.
//
// "gemini-flash-latest" là bí danh luôn trỏ tới bản flash hiện hành nên không
// bao giờ 404 vì hết vòng đời. Vẫn cho phép ghim phiên bản cụ thể qua biến môi
// trường GEMINI_MODEL khi cần kết quả ổn định tuyệt đối (vd lúc quay video demo).
// Model MẶC ĐỊNH khi admin chưa chọn trên dashboard và .env cũng không đặt.
// Hạn mức miễn phí của Google tính theo TỪNG MODEL (20 lượt/ngày/model), nên
// đổi model là có ngay hạn mức mới — admin đổi được ngay trên thẻ Trợ lý ảo.
const MODEL_MAC_DINH = process.env.GEMINI_MODEL || "gemini-flash-latest";

// ─────────────────────────────────────────────
// SYSTEM PROMPT — toàn bộ kiến thức về website
// ─────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are **Cine** — a warm, emotionally intelligent assistant for **CinemaGold**, an online movie ticketing platform.

## PERSONALITY
- Warm, empathetic, conversational, lightly enthusiastic about movies
- Never clinical or robotic — speak like a knowledgeable friend who loves cinema
- Use appropriate emojis naturally: 🎬 🎥 🎫 ⭐ 💰 📍 🍿 🎭 ❤️ 😊

## PRIMARY ROLE
- Help users find movies that match their mood, needs, or occasion
- Only recommend movies that exist in the database — NEVER invent or guess movie titles
- ALWAYS call the appropriate function to get real data before recommending anything
- When a logged-in user asks for a GENERIC recommendation (not mood-specific) — e.g. "gợi ý phim cho tôi", "tôi nên xem gì", "phim hợp với tôi" — call **getPersonalizedRecommendations** FIRST instead of getPopularMovies. It uses their real booking history to personalize results. If the response says personalized=true, briefly mention it's based on what they've watched before (e.g. "vì bạn từng thích phim [genre]..."). If personalized=false (no history yet), present it naturally as trending picks.

## EMOTIONAL RESPONSE FRAMEWORK
When a user shares feelings or a situation, respond in this order:
1. **Acknowledge** — recognize their emotion or situation in 1 warm sentence
2. **Connect** — bridge their feeling to the movie-watching experience
3. **Recommend** — suggest 2–3 movies from the database with brief emotional reasoning (call getPopularMovies or searchMovies first)
4. **Guide** — end with one clear next action (book a ticket, check showtimes, explore more)

## EMOTIONAL MAPPING (use searchMovies/getPopularMovies with these genres)
- Stressed / áp lực / mệt mỏi → Comedy, Animation (laughter = instant relief)
- Sad / buồn / thất vọng → healing dramas, feel-good films (Drama, Romance)
- Excited / phấn khích → Blockbusters, high-energy Action
- Bored / chán → Thrillers, Mystery, mind-bending plots
- Lonely / cô đơn → ensemble casts, found-family stories (Drama, Adventure)
- Date night / hẹn hò / romantic → Romantic comedies, visually stunning films (Romance, Comedy)
- Family / gia đình / trẻ em → Animated films, Adventure, Fantasy

## RULES
- Keep responses under 4 sentences unless the user wants more detail
- Never give mental health advice — only movie suggestions and gentle empathy
- Always end with one clear next action
- **Respond in the same language as the user** — if user writes Vietnamese, reply Vietnamese; if English, reply English
- Only recommend movies that exist in the database — use functions to verify
- MANDATORY: call the appropriate function for any question about movies, showtimes, prices, cinemas, or bookings — never guess

## EXTERNAL REVIEWS (IMDb / Rotten Tomatoes / Metacritic)
- When the user asks how a film is rated or reviewed on the internet / by critics / on IMDb, Rotten Tomatoes, Metacritic (e.g. "Batman được đánh giá thế nào", "Người Sắt điểm IMDb bao nhiêu", "giới phê bình nói gì về Oppenheimer") → call **searchWebReviews** with the film's ORIGINAL ENGLISH title (translate Vietnamese titles: Người Sắt → Iron Man, Người Dơi → The Batman...) and the release year if known.
- Report ONLY the numbers returned by the function, each with its source and the date it was recorded (asOf). NEVER add, round, or guess a score that is not in the result, and never invent critic quotes.
- Explain briefly what each score means (Tomatometer = % critics positive; Metascore = weighted critic average /100; IMDb = audience rating /10).
- Say the data comes from Wikidata/Wikipedia and that the source links are shown as buttons under the message. Do NOT write URLs or markdown links in your text — the chat window cannot render them; the buttons already link to IMDb, Rotten Tomatoes, Metacritic and Wikipedia.
- This is the ONE exception to "only discuss movies in the database": you may report external ratings for any film. If the film is NOT showing at CinemaGold, say so clearly and offer similar films that are (call searchMovies).
- If found=false, say you could not find it and ask for the original English title.

## CINEMAGOLD PLATFORM INFO
- **Booking flow**: Login → Choose movie → Choose showtime → Select seats → Add combo → Pay → Receive e-ticket
- **Payment**: VNPay or MoMo only — the server rejects any other method (no ZaloPay, no cash at the counter)
- **Room types**: Standard, VIP (recline), IMAX, 4DX
- **Seat tiers** (price varies by seat position within the same showtime): Ghế thường (front rows, base price) < Ghế VIP (middle rows, +20%) < Ghế Premium (back rows, +35%). The seat map shows a price legend per tier.
- **Ticket types**: Người lớn (base), Học sinh - Sinh viên (-15%), Trẻ em (-40%), Người cao tuổi (-30%). Age limits come from the Vietnamese rating label and are ENFORCED by the server: K/P = mọi lứa tuổi, T13 = từ 13 tuổi, T16 = từ 16 tuổi, T18 = từ 18 tuổi. Only the **Trẻ em** ticket has an age ceiling, so any T13/T16/T18 film disables Trẻ em while Học sinh - Sinh viên and Người cao tuổi stay available. Buyers pick the correct type themselves and may be asked to show ID at the cinema.
- **Combos**: Popcorn M/L, Soft drinks M/L, Snack, Solo/Couple/Family combos
- **Key policy**: Seats held for 15 minutes while paying; max 10 seats/booking; booking code starts with **BK**
- **Features**: Browse films, schedule by date/cinema, seat map, ratings & reviews, favorites, booking history

## RESPONSE STYLE
- Short and warm — quality over quantity
- When function returns results: summarize clearly and highlight the most relevant 2–3 options
- When no results: apologize gently and suggest an alternative search
- Always close with an actionable suggestion`;


// ─────────────────────────────────────────────
// FUNCTION DECLARATIONS — AI biết cách gọi gì
// ─────────────────────────────────────────────
const FUNCTION_DECLARATIONS = [
  {
    name: "searchMovies",
    description:
      "Tìm kiếm phim theo tên, thể loại, diễn viên hoặc đạo diễn. Gọi khi user hỏi về phim cụ thể hoặc muốn tìm theo tiêu chí.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Từ khóa: tên phim, thể loại (Action/Drama/Comedy/Thriller...), diễn viên, đạo diễn",
        },
        status: {
          type: "string",
          enum: ["NOW_SHOWING", "COMING_SOON", "all"],
          description: "NOW_SHOWING=đang chiếu, COMING_SOON=sắp chiếu, all=tất cả",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "getPopularMovies",
    description:
      "Lấy phim phổ biến / hot / trending nhất. Gọi khi user hỏi phim hay, phim hot, phim được xem nhiều, gợi ý phim.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["NOW_SHOWING", "COMING_SOON", "all"],
          description: "Lọc trạng thái. Mặc định NOW_SHOWING.",
        },
        limit: { type: "number", description: "Số lượng phim (mặc định 5, tối đa 10)" },
      },
    },
  },
  {
    name: "getPersonalizedRecommendations",
    description:
      "Gợi ý phim CÁ NHÂN HÓA dựa trên lịch sử đặt vé thực tế của user đang đăng nhập (ưu tiên thể loại họ đã xem nhiều, loại trừ phim đã xem rồi). Ưu tiên gọi function này thay vì getPopularMovies khi user hỏi gợi ý chung, không gắn với tâm trạng cụ thể (ví dụ 'gợi ý phim cho tôi', 'tôi nên xem gì').",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số phim muốn gợi ý (mặc định 5, tối đa 10)" },
      },
    },
  },
  {
    name: "getMovieDetails",
    description:
      "Lấy thông tin chi tiết một bộ phim: mô tả, diễn viên, đạo diễn, đánh giá, trailer. Gọi sau khi có movieId từ kết quả tìm kiếm.",
    parameters: {
      type: "object",
      properties: {
        movieId: { type: "number", description: "ID phim lấy từ kết quả searchMovies hoặc getPopularMovies" },
      },
      required: ["movieId"],
    },
  },
  {
    name: "getShowtimes",
    description:
      "Lấy lịch chiếu: suất chiếu, giờ, rạp, giá vé, số ghế còn trống. Gọi khi user hỏi 'chiếu lúc mấy giờ', 'còn ghế không', 'lịch chiếu hôm nay/ngày X'.",
    parameters: {
      type: "object",
      properties: {
        movieTitle: { type: "string", description: "Tên phim (để lọc lịch chiếu của phim đó)" },
        date: {
          type: "string",
          description: "Ngày YYYY-MM-DD. Không truyền = hôm nay và sau đó.",
        },
        cinemaName: { type: "string", description: "Tên hoặc một phần tên rạp" },
      },
    },
  },
  {
    name: "getCinemas",
    description:
      "Lấy danh sách rạp chiếu phim: tên, địa chỉ, loại phòng. Gọi khi user hỏi về rạp, địa điểm xem phim.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "Tên khu vực, quận hoặc thành phố" },
      },
    },
  },
  {
    name: "getPricing",
    description:
      "Lấy giá vé và combo đồ ăn. Gọi khi user hỏi giá bao nhiêu, combo có gì, bắp nước giá thế nào.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["tickets", "combos", "all"],
          description: "tickets=chỉ giá vé, combos=chỉ combo, all=tất cả",
        },
      },
    },
  },
  {
    name: "getRoomPricing",
    description:
      "Lấy giá vé trung bình/thấp nhất/cao nhất theo TỪNG LOẠI PHÒNG (standard/vip/imax/4dx). Gọi khi user hỏi cụ thể về giá của một loại phòng, ví dụ 'phòng VIP giá bao nhiêu', 'IMAX có đắt không', 'so sánh giá các loại phòng'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getBookingByReference",
    description:
      "Tra cứu đơn đặt vé theo mã. Mã thường bắt đầu bằng BK hoặc CG. Gọi khi user cung cấp mã đặt vé cụ thể.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Mã đặt vé (ví dụ: BK1750001234ABCD)" },
      },
      required: ["reference"],
    },
  },
  {
    name: "getUserBookings",
    description:
      "Lấy lịch sử đặt vé của người dùng đang đăng nhập. Gọi khi user hỏi 'vé của tôi', 'đặt vé nào rồi', 'lịch sử đặt vé'.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "confirmed", "pending", "cancelled"],
          description: "Lọc theo trạng thái vé",
        },
        limit: { type: "number", description: "Số vé gần nhất cần lấy (mặc định 5)" },
      },
    },
  },
  // ───────────────────────────────────────────────────────────────────────
  // 7 hàm dưới đây ĐÃ CÓ SẴN trong buildHandlers() và truy vấn CSDL thật,
  // nhưng trước đây KHÔNG được khai báo ở đây — nghĩa là model không hề biết
  // chúng tồn tại. Hậu quả: hỏi "phim nào dưới 100 phút", "combo dưới 100k",
  // "suất chiếu buổi tối", "phim của diễn viên X"... model không có công cụ
  // nào để tra, nên hoặc trả lời chung chung hoặc TỰ BỊA ra số liệu. Đây đúng
  // là kiểu "chatbot trả lời sai lệch so với dữ liệu thật của web".
  // ───────────────────────────────────────────────────────────────────────
  {
    name: "getTopRatedMovies",
    description:
      "Lấy phim có ĐIỂM CHẤM cao nhất từ người xem thật. Gọi khi user hỏi 'phim nào hay nhất', 'phim điểm cao', 'phim được đánh giá tốt'. Khác getPopularMovies (xếp theo lượng vé bán).",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "Số phim cần lấy (mặc định 5)" } },
    },
  },
  {
    name: "searchMoviesByDuration",
    description:
      "Tìm phim theo THỜI LƯỢNG. Gọi khi user hỏi 'phim ngắn', 'phim dưới 2 tiếng', 'phim dài nhất', 'phim khoảng 90 phút'.",
    parameters: {
      type: "object",
      properties: {
        maxMinutes: { type: "number", description: "Thời lượng tối đa tính bằng phút" },
        minMinutes: { type: "number", description: "Thời lượng tối thiểu tính bằng phút" },
      },
    },
  },
  {
    name: "searchMoviesByPrice",
    description:
      "Tìm phim theo GIÁ VÉ. Gọi khi user hỏi 'phim nào rẻ', 'vé dưới 100k', 'phim giá vừa túi tiền'.",
    parameters: {
      type: "object",
      properties: {
        maxPrice: { type: "number", description: "Giá vé tối đa (VNĐ)" },
        minPrice: { type: "number", description: "Giá vé tối thiểu (VNĐ)" },
      },
    },
  },
  {
    name: "searchCombosByPrice",
    description:
      "Tìm COMBO bắp nước theo giá. Gọi khi user hỏi 'combo nào rẻ', 'bắp nước dưới 100k', 'có đồ ăn gì'.",
    parameters: {
      type: "object",
      properties: {
        maxPrice: { type: "number", description: "Giá tối đa (VNĐ)" },
        minPrice: { type: "number", description: "Giá tối thiểu (VNĐ)" },
      },
    },
  },
  {
    name: "getLastShowtimeDate",
    description:
      "Cho biết một phim còn chiếu ĐẾN NGÀY NÀO. Gọi khi user hỏi 'phim X chiếu đến bao giờ', 'còn chiếu mấy ngày nữa'.",
    parameters: {
      type: "object",
      properties: { movieTitle: { type: "string", description: "Tên phim" } },
      required: ["movieTitle"],
    },
  },
  {
    name: "searchWebReviews",
    description:
      "Tra ĐIỂM ĐÁNH GIÁ THẬT của 1 phim trên các trang lớn (IMDb, Rotten Tomatoes, Metacritic) lấy trực tiếp từ Internet (Wikidata). Gọi khi user hỏi phim X được đánh giá thế nào trên mạng / điểm IMDb / Rotten Tomatoes / giới phê bình. Dùng được cho CẢ phim không chiếu tại rạp. KHÔNG dùng cho điểm do khách của rạp chấm (dùng getMovieDetails).",
    parameters: {
      type: "object",
      properties: {
        movieTitle: { type: "string", description: "Tên GỐC TIẾNG ANH của phim, vd 'The Batman', 'Iron Man' (dịch nếu user gõ tên tiếng Việt)" },
        year: { type: "number", description: "Năm phát hành gốc nếu biết, giúp phân biệt các bản làm lại (vd The Batman 2022 vs Batman 1989)" },
      },
      required: ["movieTitle"],
    },
  },
  {
    name: "searchMoviesByPerson",
    description:
      "Tìm phim theo DIỄN VIÊN hoặc ĐẠO DIỄN cụ thể. Gọi khi user hỏi 'phim có diễn viên X', 'phim do Y đạo diễn'.",
    parameters: {
      type: "object",
      properties: { personName: { type: "string", description: "Tên diễn viên hoặc đạo diễn" } },
      required: ["personName"],
    },
  },
  {
    name: "getShowtimesByTimeOfDay",
    description:
      "Lấy suất chiếu theo BUỔI trong ngày. Gọi khi user hỏi 'suất chiếu tối nay', 'có suất nào buổi sáng', 'chiều nay chiếu gì'. Đừng dùng getShowtimes cho câu hỏi theo buổi vì nó trả về cả ngày.",
    parameters: {
      type: "object",
      properties: {
        timeOfDay: {
          type: "string",
          enum: ["morning", "afternoon", "evening", "night"],
          description: "morning=sáng (trước 12h), afternoon=chiều (12-17h), evening=tối (17-21h), night=khuya (sau 21h)",
        },
        date: { type: "string", description: "Ngày dạng YYYY-MM-DD, mặc định hôm nay" },
        movieTitle: { type: "string", description: "Lọc theo phim cụ thể (tuỳ chọn)" },
      },
      required: ["timeOfDay"],
    },
  },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Chuyển history từ format frontend {role, content} → Gemini {role, parts:[{text}]}
 * Lọc bỏ các message rỗng và đảm bảo không bắt đầu bằng "model"
 */
function normalizeHistory(history = []) {
  const valid = history
    .filter((m) => m && (m.content || m.parts))
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || m.parts?.[0]?.text || "" }],
    }))
    .filter((m) => m.parts[0].text.trim() !== "");

  // Gemini yêu cầu history bắt đầu bằng "user", kết thúc bằng "model"
  // và phải xen kẽ nhau
  const normalized = [];
  for (let i = 0; i < valid.length; i++) {
    const expected = i % 2 === 0 ? "user" : "model";
    if (valid[i].role !== expected) break; // dừng khi thứ tự sai
    normalized.push(valid[i]);
  }
  // Đảm bảo kết thúc bằng model (nếu lẻ, bỏ phần tử cuối)
  if (normalized.length > 0 && normalized[normalized.length - 1].role === "user") {
    normalized.pop();
  }
  return normalized;
}

// ─────────────────────────────────────────────
// CORE CHAT FUNCTION
// ─────────────────────────────────────────────

// Circuit breaker: khi vừa gặp lỗi quota, TẠM DỪNG gọi API thật trong một
// khoảng thời gian thay vì thử lại ngay ở tin nhắn kế tiếp. Không có cơ chế
// này, MỖI tin nhắn (kể cả khi biết chắc quota vẫn hết) đều phải chờ trọn
// vòng round-trip mạng thật tới Google (~200-400ms quan sát được) rồi mới
// nhận lỗi và rớt xuống fallback — cảm giác chatbot bị "khựng" mỗi lượt chat
// dù câu trả lời cuối cùng vẫn đúng. Đồng thời giảm số request vô ích gửi
// lên 1 quota đã biết chắc hết (tôn trọng giới hạn phía Google). Tự động
// thử lại sau cooldown, phòng trường hợp quota được reset/nâng cấp — KHÔNG
// tắt vĩnh viễn, chỉ hoãn lại.
// Hạn mức gói miễn phí tính theo TỪNG model, nên trạng thái "đang nghỉ" cũng
// phải theo từng model — hết lượt model này vẫn còn model khác để dùng.
const nghiTheoModel = new Map() // model -> mốc thời gian được phép gọi lại

// gemini-3.8-flash trả 400 "Thinking level MINIMAL is not supported" — model
// nào từ chối mức "minimal" thì hạ xuống "low". KHÔNG bỏ hẳn thinkingConfig:
// để mặc định, model suy nghĩ rất lâu rồi quá hạn chờ 15 giây.
const thinkingThap = new Set()
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000 // hạn mức tính theo NGÀY nên nghỉ 30 phút mới thử lại

const QUOTA_EXCEEDED_REPLY = "⚠️ API key Gemini đã hết quota free tier.\n\nĐể sửa:\n1. Vào https://aistudio.google.com/apikey\n2. Tạo API key mới\n3. Cập nhật GEMINI_API_KEY trong file backend/.env";

/**
 * @param {string} message - Tin nhắn của user
 * @param {Array}  history - Lịch sử hội thoại [{role, content}]
 * @param {Object} functionHandlers - Map tên function → async handler
 * @returns {{ reply, functionCalls, results, history }}
 */
/**
 * Gọi Gemini kèm HẠN CHỜ. SDK không có tuỳ chọn timeout, và bản thân lời gọi
 * mạng có thể treo rất lâu mà không báo lỗi — đo thực tế endpoint /health mất
 * 29 GIÂY khi dịch vụ chậm. Không có hạn chờ thì người dùng ngồi nhìn khung
 * chat quay vòng suốt ngần ấy thời gian.
 *
 * Quá hạn thì ném lỗi để tầng trên rơi về nhánh luật cứng — nhánh đó trả lời
 * đúng dữ liệu thật, chỉ kém tự nhiên hơn. Thà trả lời kém mượt trong 8 giây
 * còn hơn trả lời hay sau nửa phút.
 */
// 15 giây/lần gọi: lượt đầu (đã tắt "suy nghĩ") mất ~2–5 giây, nhưng vòng gọi
// hàm thứ hai phải gửi kèm kết quả tra cứu nên chậm hơn — đo thực tế vượt 8 giây.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;

function goiKemHanCho(promise, nhan) {
  let dongHo;
  const hanCho = new Promise((_, reject) => {
    dongHo = setTimeout(
      () => reject(new Error(`Gemini quá hạn chờ ${GEMINI_TIMEOUT_MS}ms tại bước "${nhan}"`)),
      GEMINI_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, hanCho]).finally(() => clearTimeout(dongHo));
}

// Bản RÚT GỌN gửi cho model — dữ liệu đầy đủ vẫn giữ nguyên để dựng thẻ hiển thị.
// Payload 15 suất chiếu kèm poster/mô tả làm vòng gọi hàm thứ hai chậm hẳn (đo
// được >15 giây -> quá hạn chờ -> rơi về luật cứng) trong khi model không cần
// những trường đó để viết câu trả lời.
const TRUONG_NANG = ["poster_url", "trailer_url", "description", "banner_url", "cast"];
const MAX_DONG_GUI_MODEL = 8;
function rutGonChoModel(data) {
  if (Array.isArray(data)) return data.slice(0, MAX_DONG_GUI_MODEL).map(rutGonChoModel);
  if (!data || typeof data !== "object") return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (TRUONG_NANG.includes(k)) continue;
    out[k] = rutGonChoModel(v);
  }
  return out;
}

/**
 * Mốc thời gian THẬT của server, nối vào cuối mô tả hệ thống. Model không tự
 * biết hôm nay là ngày nào — thiếu khối này thì câu hỏi "suất chiếu 21h ngày
 * mai" bị bỏ trống tham số date và trả về suất bất kỳ (đã gặp thật).
 * Dùng chung cho cả Gemini lẫn Claude.
 */
function moTaThoiGianHienTai() {
  const bayGio = new Date();
  const hai = (n) => String(n).padStart(2, "0");
  const ngay = (d) => d.getFullYear() + "-" + hai(d.getMonth() + 1) + "-" + hai(d.getDate());
  const mai = new Date(bayGio.getTime() + 24 * 60 * 60 * 1000);
  const THU = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return [
    "",
    "## CURRENT DATE & TIME (giờ Việt Nam, lấy từ server)",
    "- Bây giờ: " + hai(bayGio.getHours()) + ":" + hai(bayGio.getMinutes()) + ", " + THU[bayGio.getDay()] + " " + ngay(bayGio),
    "- Hôm nay = " + ngay(bayGio) + " · Ngày mai = " + ngay(mai),
    "- Khi user nói \"hôm nay\", \"tối nay\", \"ngày mai\", \"cuối tuần này\"... BẮT BUỘC tự quy ra ngày YYYY-MM-DD rồi truyền vào tham số date của function, đừng để function tự đoán.",
    "- Hỏi theo BUỔI (sáng/chiều/tối/khuya) thì gọi getShowtimesByTimeOfDay với timeOfDay tương ứng, không dùng getShowtimes.",
    "- User nêu GIỜ CỤ THỂ (vd \"khoảng 21h\") thì chỉ gọi getShowtimesByTimeOfDay ĐÚNG MỘT LẦN với buổi chứa giờ đó (21h trở đi = night). TUYỆT ĐỐI không tra thêm buổi sớm hơn rồi liệt kê suất 17h-20h — người hỏi 21h không muốn xem suất 20h.",
    "- TUYỆT ĐỐI không giới thiệu suất chiếu đã qua giờ hiện tại.",
    "- Cần nhiều loại dữ liệu thì gọi TẤT CẢ function cần thiết trong CÙNG một lượt (song song), đừng gọi lần lượt từng cái — mỗi lượt gọi đều tốn hạn mức.",
  ].join("\n");
}

// Khoá sai/bị thu hồi thì bỏ qua CẢ KHOÁ trong 10 phút, thay vì thử lại với
// từng model rồi lỗi 9 lần liên tiếp.
const khoaHong = new Map() // id khoá -> mốc thời gian thử lại

function khoaCap(key, model) {
  return `${idKhoa(key)}:${model}`;
}

function dangNghi(key, model) {
  return Date.now() < (nghiTheoModel.get(khoaCap(key, model)) || 0);
}

/**
 * Thứ tự model sẽ thử: model admin chọn đứng đầu, rồi tới các model CÒN LƯỢT
 * hôm nay. Gói miễn phí cho 20 lượt/ngày/model nên 7 model ~ 140 lượt/ngày —
 * khách hỏi liên tiếp vẫn được AI trả lời mà admin không phải bấm đổi tay.
 */
/**
 * Danh sách cặp (khoá, model) sẽ thử. Hạn mức 20 lượt/ngày tính cho TỪNG
 * model của TỪNG dự án Google, nên 2 khoá × 9 model = 18 hạn mức riêng biệt.
 * Ưu tiên: khoá đầu tiên + model admin đang chọn, rồi lần lượt sang các cặp
 * còn hạn mức.
 */
async function danhSachCapUngVien(khoas, modelChon, gioiHanNgay) {
  const luot = await demLuotGoiTheoCap().catch(() => ({}));
  const models = [modelChon, ...MODELS_GOI_Y.map((m) => m.id).filter((id) => id !== modelChon)];
  const cap = [];
  for (const key of khoas) {
    if (Date.now() < (khoaHong.get(idKhoa(key)) || 0)) continue;
    for (const model of models) {
      if (dangNghi(key, model)) continue;
      if ((luot[`${model}|${idKhoa(key)}`] || 0) >= gioiHanNgay) continue;
      cap.push({ key, model });
    }
  }
  // Không còn cặp nào rảnh thì vẫn thử cặp đầu — biết đâu Google đã reset hạn mức.
  return cap.length ? cap.slice(0, 6) : [{ key: khoas[0], model: modelChon }];
}

async function chat(message, history = [], functionHandlers = {}) {
  // Khoá lấy từ cấu hình admin dán trên Bảng quản trị TRƯỚC, rồi mới tới .env
  // — đổi khoá hết hạn mức ngay lúc đang chạy, không phải khởi động lại server.
  const cauHinh = await getChatbotConfig();
  // Admin dán được nhiều khoá (mỗi dòng 1 khoá); không có thì lấy khoá trong .env.
  const khoas = cauHinh.geminiApiKeys?.length
    ? cauHinh.geminiApiKeys
    : String(process.env.GEMINI_API_KEY || "").trim()
      ? [String(process.env.GEMINI_API_KEY).trim()]
      : [];
  const modelChon = cauHinh.model || MODEL_MAC_DINH;
  if (!khoas.length) {
    return { reply: "", functionCalls: [], results: [], error: "Chưa cấu hình khoá Gemini" };
  }

  const ungVien = await danhSachCapUngVien(khoas, modelChon, cauHinh.dailyLimit);
  // Mỗi model hỏng có thể mất tới 15 giây mới biết — thử mãi thì khách chờ cả
  // phút. Quá 25 giây thì dừng, để tầng trên trả lời bằng luật cứng cho nhanh.
  const batDau = Date.now();
  const TRAN_THOI_GIAN_MS = 25000;
  let ketQua = null;
  for (const { key: apiKey, model: modelName } of ungVien) {
    if (Date.now() - batDau > TRAN_THOI_GIAN_MS) {
      console.log("⏱️  Đã thử quá 25 giây, dừng để trả lời bằng luật cứng");
      break;
    }
    ketQua = await chatVoiModel(message, history, functionHandlers, modelName, apiKey);
    if (!ketQua.thuModelKhac) {
      // Model dự phòng trả lời được -> ghi lại làm model chính, để câu hỏi sau
      // (và cả sau khi khởi động lại server) không phải dò lại từ đầu. Admin
      // vẫn thấy model đang dùng trên thẻ và đổi tay được bất cứ lúc nào.
      if (modelName !== modelChon && !ketQua.error) {
        updateChatbotConfig({ model: modelName }).catch(() => {});
        console.log(`✅ Đổi model chính sang ${modelName} (model cũ ${modelChon} không dùng được)`);
      }
      return { ...ketQua, model: modelName };
    }
    console.log(`⚠️  ${modelName} không dùng được lúc này, tự chuyển sang model kế tiếp...`);
  }
  return ketQua || { reply: "", functionCalls: [], results: [], error: "Không còn model Gemini nào còn lượt" };
}

async function chatVoiModel(message, history, functionHandlers, MODEL_NAME, apiKey) {

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const boiCanhThoiGian = moTaThoiGianHienTai();

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION + boiCanhThoiGian,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
        // Model Gemini 3.x mặc định "suy nghĩ" trước khi trả lời. Đo thực tế:
        // gemini-3.6-flash mất 26–35 giây/lượt (≈380 token suy nghĩ cho 1 câu
        // hỏi lịch chiếu) — vượt hạn chờ 8 giây, nên 57/57 lượt trong 30 ngày
        // đều rơi về luật cứng. "minimal" còn ~2 giây, câu trả lời vẫn đúng ý:
        // chatbot tra dữ liệu qua function calling, không cần suy luận nhiều bước.
        thinkingConfig: {
          thinkingLevel: thinkingThap.has(MODEL_NAME) ? "low" : process.env.GEMINI_THINKING_LEVEL || "minimal",
        },
      },
    });

    // KHÔNG dùng model.startChat()/sendMessage() của SDK.
    //
    // SDK @google/generative-ai khi trả kết quả function về cho model sẽ tự
    // đóng gói với `role: "function"` (ghi cứng trong dist/index.js). API Gemini
    // hiện tại KHÔNG còn chấp nhận role đó nữa và trả về:
    //   400 — Role 'function' is not supported. Please use a valid role:
    //         SYSTEM, USER, ASSISTANT, MODEL, ...
    // Hậu quả: mọi câu hỏi khiến AI cần tra dữ liệu đều hỏng, chatbot rơi hết
    // về nhánh luật cứng. Đã thử nghiệm trực tiếp: gửi functionResponse với
    // `role: "user"` thì API chấp nhận và trả lời đúng.
    //
    // Vì vậy tự dựng mảng `contents` và gọi generateContent() — vừa tránh được
    // chỗ ghi cứng của SDK, vừa nắm rõ chính xác cái gì được gửi đi.
    const contents = [
      ...normalizeHistory(history),
      { role: "user", parts: [{ text: message }] },
    ];

    const allFunctionCalls = [];
    const allResults = [];

    // Hạn mức Google tính theo SỐ LƯỢT GỌI (20/ngày/model ở gói miễn phí), nên
    // phải đếm từng request — 1 câu hỏi phức tạp có thể tốn 6+ lượt.
    let response = (await goiKemHanCho(model.generateContent({ contents }), "lượt đầu")).response;
    ghiNhanLuotGoi(MODEL_NAME, { key: apiKey }).catch(() => {});

    // Vòng lặp xử lý function calls (AI có thể gọi nhiều lần liên tiếp).
    //
    // functionCalls() của SDK 0.24.1 trả về `undefined` (KHÔNG phải mảng rỗng)
    // khi model đã trả lời bằng văn bản. Điều kiện cũ gọi thẳng `.length` trên
    // kết quả đó nên đổ lỗi "Cannot read properties of undefined (reading
    // 'length')" đúng lúc AI vừa trả lời xong — AI không bao giờ tới đích,
    // mọi lượt đều rơi về luật cứng.
    const layLoiGoiHam = (res) => (typeof res.functionCalls === "function" && res.functionCalls()) || [];
    let iterations = 0;
    while (layLoiGoiHam(response).length > 0 && iterations < 5) {
      iterations++;
      const calls = layLoiGoiHam(response);

      // Giữ nguyên lượt của model (chứa functionCall) trong lịch sử, nếu không
      // model sẽ không biết nó vừa yêu cầu gọi hàm gì.
      contents.push(response.candidates[0].content);

      const responseParts = [];
      for (const call of calls) {
        console.log(`🤖 AI gọi function: ${call.name}`, call.args);
        allFunctionCalls.push({ name: call.name, args: call.args });

        let funcResult;
        if (functionHandlers[call.name]) {
          try {
            funcResult = await functionHandlers[call.name](call.args);
          } catch (err) {
            console.error(`Lỗi khi chạy ${call.name}:`, err.message);
            funcResult = { error: err.message };
          }
        } else {
          funcResult = { error: `Function "${call.name}" không tồn tại` };
        }

        allResults.push({ function: call.name, data: funcResult });
        responseParts.push({
          functionResponse: { name: call.name, response: rutGonChoModel(funcResult) },
        });
      }

      // role "user" — KHÔNG phải "function" (xem chú thích ở trên)
      contents.push({ role: "user", parts: responseParts });
      response = (await goiKemHanCho(model.generateContent({ contents }), `vòng gọi hàm ${iterations}`)).response;
      ghiNhanLuotGoi(MODEL_NAME, { key: apiKey }).catch(() => {});
    }

    // response.text() ném lỗi khi lượt cuối KHÔNG chứa phần văn bản nào — xảy ra
    // khi model gọi hàm liên tục cho tới khi chạm trần `iterations < 5` (ví dụ
    // mọi handler đều trả về lỗi nên model cứ thử hàm khác). Trước đây lỗi này
    // nổi lên thành "Cannot read properties of undefined (reading 'length')" và
    // bị bắt ở catch ngoài cùng, khiến CẢ lượt hỏi thành "sự cố kỹ thuật" dù
    // các hàm đã lấy được dữ liệu thật.
    let reply = "";
    try {
      reply = response.text() || "";
    } catch {
      reply = "";
    }
    if (!reply.trim()) {
      // Không có câu trả lời dạng văn bản: báo lỗi để tầng trên chuyển sang
      // nhánh luật cứng, thay vì trả về chuỗi rỗng cho người dùng.
      return {
        reply: "",
        functionCalls: allFunctionCalls,
        results: allResults,
        error: "Model không trả về nội dung văn bản sau khi gọi hàm",
      };
    }

    return {
      reply,
      functionCalls: allFunctionCalls,
      results: allResults,
      history: contents,
    };
  } catch (error) {
    console.error("Gemini error:", error.message);

    // Model không nhận mức "minimal" -> nhớ lại và gọi lại ngay ở mức "low".
    if (/thinking level/i.test(error.message || "") && !thinkingThap.has(MODEL_NAME)) {
      thinkingThap.add(MODEL_NAME);
      console.log(`ℹ️  ${MODEL_NAME} không nhận mức "minimal" — gọi lại ở mức "low"`);
      return chatVoiModel(message, history, functionHandlers, MODEL_NAME, apiKey);
    }

    if (error.message?.includes("API_KEY") || error.message?.includes("API key")) {
      // Khoá này hỏng -> nghỉ 10 phút và thử KHOÁ KHÁC (nếu admin dán nhiều khoá).
      khoaHong.set(idKhoa(apiKey), Date.now() + 10 * 60 * 1000);
      console.log(`⚠️  Khoá ...${idKhoa(apiKey)} không dùng được, bỏ qua khoá này`);
      return {
        reply: "",
        functionCalls: [],
        results: [],
        error: "Khoá Gemini không hợp lệ",
        thuModelKhac: true,
      };
    }

    // Lỗi TẠM THỜI (hết hạn mức, model quá tải, quá hạn chờ, lỗi máy chủ) đều
    // đáng thử model khác — trước đây chỉ nhảy model khi hết hạn mức, nên gặp
    // 503 "high demand" là chatbot rơi thẳng về luật cứng dù còn 5 model rảnh.
    const loi = error.message || "";
    const hetHanMuc = /quota|RESOURCE_EXHAUSTED|429/.test(loi);
    const tamThoi = hetHanMuc || /503|502|500|UNAVAILABLE|high demand|quá hạn chờ|overloaded/i.test(loi);
    if (tamThoi) {
      // Hết hạn mức thì nghỉ 5 phút; quá tải/chậm thì chỉ nghỉ 1 phút.
      nghiTheoModel.set(khoaCap(apiKey, MODEL_NAME), Date.now() + (hetHanMuc ? QUOTA_COOLDOWN_MS : 60 * 1000));
      // Lượt bị 429 vẫn là 1 request đã gửi đi — ghi nhận để dashboard thấy đúng.
      if (hetHanMuc) ghiNhanLuotGoi(MODEL_NAME, { quotaError: true, key: apiKey }).catch(() => {});
      return {
        reply: QUOTA_EXCEEDED_REPLY,
        functionCalls: [],
        results: [],
        quotaError: true,
        thuModelKhac: true,
      };
    }

    // Model bị Google KHAI TỬ (404 "no longer available") — vd gemini-2.5-flash.
    // Cho model đó nghỉ 24 giờ và thử model kế tiếp, thay vì trả lỗi kỹ thuật
    // cho khách. Admin nhìn thẻ sẽ thấy model đang dùng đã tự đổi sang cái khác.
    if (error.message?.includes("404") || /no longer available|not found|is not supported/i.test(error.message || "")) {
      nghiTheoModel.set(khoaCap(apiKey, MODEL_NAME), Date.now() + 24 * 60 * 60 * 1000);
      console.log(`⚠️  Model ${MODEL_NAME} không còn khả dụng — bỏ qua, chuyển model khác`);
      return {
        reply: "",
        functionCalls: [],
        results: [],
        error: `Model ${MODEL_NAME} không còn khả dụng`,
        thuModelKhac: true,
      };
    }

    return {
      reply: "😔 Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.",
      functionCalls: [],
      results: [],
      error: error.message,
    };
  }
}

async function testConnection() {
  try {
    const result = await chat("Xin chào, bạn có thể giúp tôi đặt vé xem phim không?", [], {});
    return { success: !result.error, response: result.reply };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Số giây còn lại của khoảng tạm ngưng sau khi Google báo hết hạn mức (0 = đang gọi bình thường). */
/** Số giây nghỉ còn lại của model (lấy cặp khoá nghỉ lâu nhất). */
function getQuotaCooldownSeconds(model) {
  let den = 0;
  for (const [cap, moc] of nghiTheoModel) {
    if (cap.endsWith(`:${model}`) && moc > den) den = moc;
  }
  return Math.max(0, Math.ceil((den - Date.now()) / 1000));
}

/** Admin vừa dán khoá mới → bỏ khoảng tạm ngưng của khoá cũ để thử lại ngay. */
function clearQuotaCooldown() {
  nghiTheoModel.clear();
}

module.exports = { chat, testConnection, getQuotaCooldownSeconds, clearQuotaCooldown, MODEL_MAC_DINH, SYSTEM_INSTRUCTION, FUNCTION_DECLARATIONS, moTaThoiGianHienTai };
