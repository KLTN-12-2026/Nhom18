// Tiện ích chuyển đổi giữa chuỗi "YYYY-MM-DD" và Date object theo GIỜ ĐỊA
// PHƯƠNG (local time), tránh lớp lỗi lệch ngày kinh điển trong JS:
//   - `new Date("YYYY-MM-DD")` (chuỗi ISO date-only) được hiểu là NỬA ĐÊM
//     GIỜ UTC, không phải giờ địa phương.
//   - `date.toISOString().split('T')[0]` quy đổi Date object sang UTC TRƯỚC
//     khi cắt chuỗi ngày.
// Ở múi giờ UTC+7 (Việt Nam — Asia/Saigon), nửa đêm giờ địa phương = 17h hôm
// TRƯỚC theo UTC, nên dùng lẫn giữa 2 cách trên với các hàm thao tác ngày
// theo giờ ĐỊA PHƯƠNG (getDate()/setDate()) sẽ khiến kết quả lệch 1 ngày.
// Dùng 2 hàm dưới đây bất cứ khi nào cần đổi qua lại giữa Date <-> "YYYY-MM-DD".

function parseLocalDateString(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatLocalDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

module.exports = { parseLocalDateString, formatLocalDateString }
