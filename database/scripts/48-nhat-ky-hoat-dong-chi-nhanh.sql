-- ============================================================================
-- 48 — NHẬT KÝ HOẠT ĐỘNG CỦA CHI NHÁNH
-- ============================================================================
-- Quản lý chi nhánh tự làm được nhiều việc mà KHÔNG cần admin duyệt (sửa tồn
-- kho thật tại quầy, tạm ngưng món, thêm món riêng của rạp, báo sự cố). Nhanh
-- là đúng, nhưng admin vẫn phải NẮM ĐƯỢC chuyện gì đã xảy ra ở từng rạp:
--
--   - Thông báo trong web: admin biết NGAY khi có thay đổi.
--   - Bảng này: tra lại được về sau "ai, rạp nào, đổi cái gì, lúc nào" —
--     thông báo thì đọc xong là trôi, còn nhật ký thì nằm lại.
--
-- Không có bảng này thì mỗi lần cần đối chiếu (kho lệch, khách khiếu nại)
-- không ai biết hôm đó chi nhánh đã đổi những gì.
-- ============================================================================

CREATE TABLE IF NOT EXISTS branch_activity (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  cinema_id   INT NOT NULL,
  user_id     INT NULL,
  -- sua_ton_kho · tam_ngung_mon · mo_ban_mon · them_mon · sua_mon · xoa_mon
  -- · bao_su_co · bao_su_co_hang_loat · gui_yeu_cau
  hanh_dong   VARCHAR(40) NOT NULL,
  doi_tuong   VARCHAR(200) NULL,          -- tên món / tên suất chiếu bị tác động
  chi_tiet    JSON NULL,                  -- giá trị trước và sau, số lượng...
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hoat_dong_rap (cinema_id, created_at),
  INDEX idx_hoat_dong_loai (hanh_dong),
  CONSTRAINT fk_hoat_dong_rap FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
  CONSTRAINT fk_hoat_dong_nguoi FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hoàn tác:
--   DROP TABLE branch_activity;
