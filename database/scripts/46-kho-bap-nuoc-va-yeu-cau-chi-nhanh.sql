-- ============================================================================
-- 46 — KHO BẮP NƯỚC THEO TỪNG RẠP + YÊU CẦU GỬI VỀ ADMIN
-- ============================================================================
-- Trước đây bảng `combos` là danh mục dùng chung cả chuỗi, KHÔNG có tồn kho:
-- khách đặt bao nhiêu cũng được, rạp hết bắp cũng không ai biết.
--
-- 1. combo_inventory — tồn kho tính RIÊNG từng rạp. Danh mục món (tên, giá,
--    hình) vẫn dùng chung cả chuỗi vì đó là quyết định cấp chuỗi; còn "còn
--    bao nhiêu hàng" là chuyện của từng chi nhánh.
--
-- 2. branch_requests — yêu cầu quản lý chi nhánh gửi lên admin: xin bổ sung
--    hàng, báo hết hàng, báo sự cố tại rạp. Quản lý xử lý việc gấp trước
--    (huỷ suất, hoàn tiền cho khách), rồi gửi yêu cầu này để admin nắm sau.
-- ============================================================================

CREATE TABLE IF NOT EXISTS combo_inventory (
  cinema_id       INT NOT NULL,
  combo_id        INT NOT NULL,
  ton_kho         INT NOT NULL DEFAULT 0,      -- số suất còn bán được tại rạp này
  nguong_canh_bao INT NOT NULL DEFAULT 20,     -- dưới mức này thì cảnh báo "sắp hết"
  tam_ngung       TINYINT(1) NOT NULL DEFAULT 0, -- quản lý tự tắt món (máy hỏng, ngừng bán)
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cinema_id, combo_id),
  CONSTRAINT fk_ton_kho_rap FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ton_kho_mon FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_requests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  cinema_id     INT NOT NULL,
  nguoi_gui     INT NULL,
  -- bo_sung_hang: xin thêm hàng · bao_het_hang: báo đã hết · su_co: sự cố tại rạp
  -- (đã tự xử lý, báo để admin nắm) · khac: việc khác
  loai          ENUM('bo_sung_hang','bao_het_hang','su_co','khac') NOT NULL,
  combo_id      INT NULL,                       -- chỉ dùng cho yêu cầu về bắp nước
  so_luong      INT NULL,                       -- số suất xin bổ sung
  tieu_de       VARCHAR(200) NOT NULL,
  noi_dung      TEXT NULL,
  muc_do        ENUM('thap','binh_thuong','khan') NOT NULL DEFAULT 'binh_thuong',
  trang_thai    ENUM('moi','da_duyet','tu_choi','da_xem') NOT NULL DEFAULT 'moi',
  phan_hoi      TEXT NULL,                      -- admin trả lời
  nguoi_xu_ly   INT NULL,
  xu_ly_luc     TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_yeu_cau_rap (cinema_id, trang_thai),
  INDEX idx_yeu_cau_ngay (created_at),
  CONSTRAINT fk_yeu_cau_rap FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
  CONSTRAINT fk_yeu_cau_mon FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE SET NULL,
  CONSTRAINT fk_yeu_cau_nguoi_gui FOREIGN KEY (nguoi_gui) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_yeu_cau_nguoi_xu_ly FOREIGN KEY (nguoi_xu_ly) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khởi tạo tồn kho cho MỌI món × MỌI rạp. Mức khởi điểm khác nhau theo nhóm
-- hàng, theo đúng thực tế: nước ngọt bán chạy và trữ được nhiều nhất, combo
-- phải gói theo đơn nên trữ ít hơn.
-- INSERT IGNORE: chạy lại script cũng không ghi đè tồn kho thật đang có.
INSERT IGNORE INTO combo_inventory (cinema_id, combo_id, ton_kho, nguong_canh_bao)
SELECT c.id, m.id,
       CASE m.category WHEN 'drink' THEN 300 WHEN 'popcorn' THEN 200 WHEN 'snack' THEN 150 ELSE 120 END,
       CASE m.category WHEN 'drink' THEN 40  WHEN 'popcorn' THEN 30  WHEN 'snack' THEN 20  ELSE 15 END
FROM cinemas c CROSS JOIN combos m;

-- Hoàn tác:
--   DROP TABLE branch_requests;
--   DROP TABLE combo_inventory;
