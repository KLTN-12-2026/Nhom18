/**
 * Phụ phí/giảm giá vé theo đối tượng khách — nhân vào showtimes.price (giá vé
 * "người lớn" mặc định). Mức giảm tham khảo theo thông lệ CGV/Lotte/Galaxy:
 * trẻ em (dưới 1m30/dưới 6 tuổi) và người cao tuổi thường được giảm ~30-40%,
 * sinh viên (xuất trình thẻ) giảm ~15-20%.
 */
/**
 * ĐỘ TUỔI TỐI THIỂU của từng loại vé — dùng để đối chiếu với giới hạn tuổi của
 * phim. `minAge` là tuổi NHỎ NHẤT mà một người thuộc nhóm đó có thể có: vé
 * "Trẻ em" có thể là một đứa bé 3 tuổi, vé "Học sinh - Sinh viên" có thể là
 * học sinh 13 tuổi. Nhờ vậy chỉ cần so `minAge >= giới hạn tuổi của phim` là
 * biết loại vé đó có CHẮC CHẮN hợp lệ hay không, không phải đoán tuổi thật.
 */
const TICKET_TYPE_AGE = {
  adult:   { minAge: 18 },
  student: { minAge: 13 }, // học sinh cấp 2 trở lên, cần xuất trình thẻ
  child:   { minAge: 0, maxAge: 12 },
  senior:  { minAge: 60 },
};

/**
 * Giới hạn tuổi theo nhãn phân loại phim (cột movies.rating).
 * Hệ thống đang dùng nhãn kiểu Mỹ (G/PG/PG-13/R/NC-17); ánh xạ sang tuổi tối
 * thiểu theo cách hiểu tương đương ở Việt Nam (P / K / T13 / T16 / T18).
 * Nhãn lạ/để trống -> 0 (không giới hạn) để không chặn oan phim cũ chưa gắn nhãn.
 */
const RATING_MIN_AGE = {
  'G': 0, 'P': 0,
  'PG': 0,      // khuyến cáo có người lớn đi kèm, không cấm theo tuổi
  'K': 0,
  'PG-13': 13, 'T13': 13,
  'T16': 16,
  'R': 18, 'T18': 18, 'NC-17': 18, 'C18': 18,
};

/** Câu chú thích BẮT BUỘC hiển thị khi khách chọn loại vé ưu đãi. */
const TICKET_TYPE_DISCLAIMER =
  'Người dùng tự chịu trách nhiệm lựa chọn đúng loại vé và có thể được yêu cầu ' +
  'xuất trình giấy tờ chứng minh tại rạp khi sử dụng vé ưu đãi.';

module.exports = {
  TICKET_TYPE_PRICE_MODIFIERS: {
    adult: 1.0,
    student: 0.85,
    child: 0.6,
    senior: 0.7,
  },
  TICKET_TYPE_LABELS: {
    adult: 'Người lớn',
    student: 'Học sinh - Sinh viên',
    child: 'Trẻ em',
    senior: 'Người cao tuổi',
  },
  TICKET_TYPE_AGE,
  RATING_MIN_AGE,
  TICKET_TYPE_DISCLAIMER,
};
