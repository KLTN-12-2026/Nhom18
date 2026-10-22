/**
 * MovieLifecycleService — tự động chuyển UPCOMING → COMING_SOON → NOW_SHOWING
 * theo release_date, chạy định kỳ trong app.js.
 *
 * Trước đây việc này CHỈ được xử lý bằng 1 script chạy tay 1 lần
 * (scripts/add-movie-status-and-scheduling.js) — không có gì chạy lại theo
 * thời gian, nên phim "Sắp chiếu" có release_date đã trôi qua nhiều tháng vẫn
 * đứng yên ở COMING_SOON mãi mãi cho tới khi ai đó tự nhớ chạy lại script.
 *
 * QUAN TRỌNG — KHÔNG có rule "NOW_SHOWING → ENDED" tự động (đã từng thêm rồi
 * phải gỡ): `movies.release_date` trong dữ liệu thật của dự án là ngày phát
 * hành THẬT ngoài đời (vd Titanic 1997, Inception 2010) — không phải ngày
 * phim bắt đầu chiếu tại hệ thống này. Một rule "quá 3 tháng kể từ release_date
 * thì ENDED" từng khiến TOÀN BỘ phim (bất kể đang NOW_SHOWING thật) bị chuyển
 * ENDED ngay lần chạy đầu tiên, vì gần như mọi phim đều có release_date thật
 * hơn 3 tháng trước — xoá sạch lịch chiếu vì generator chỉ nhận
 * NOW_SHOWING/COMING_SOON. Việc phim nào nên ngừng chiếu là quyết định
 * NGHIỆP VỤ (admin), không có tín hiệu nào trong dữ liệu hiện tại đủ tin cậy
 * để tự động hoá an toàn — chỉ giữ 2 rule chuyển TIẾN, không bao giờ tự
 * chuyển phim sang ENDED.
 */

const { pool } = require("../config/database")

async function runMovieLifecycleUpdate() {
  const [upcomingToComingSoon] = await pool.query(
    `UPDATE movies SET status = 'COMING_SOON'
     WHERE status = 'UPCOMING' AND release_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
  )
  const [comingSoonToNowShowing] = await pool.query(
    `UPDATE movies SET status = 'NOW_SHOWING'
     WHERE status = 'COMING_SOON' AND release_date <= CURDATE()`
  )

  const changed = upcomingToComingSoon.affectedRows + comingSoonToNowShowing.affectedRows
  if (changed > 0) {
    console.log(
      `🎬 Cập nhật trạng thái phim: ${upcomingToComingSoon.affectedRows} UPCOMING→COMING_SOON, ` +
      `${comingSoonToNowShowing.affectedRows} COMING_SOON→NOW_SHOWING`
    )
  }
  return { upcomingToComingSoon: upcomingToComingSoon.affectedRows, comingSoonToNowShowing: comingSoonToNowShowing.affectedRows }
}

module.exports = { runMovieLifecycleUpdate }
