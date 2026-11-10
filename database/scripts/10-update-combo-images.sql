-- Cập nhật ảnh combo sang Unsplash (miễn phí, không cần API key)
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&q=80' WHERE name LIKE '%Combo Solo%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400&q=80' WHERE name LIKE '%Combo Couple%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=400&q=80' WHERE name LIKE '%Combo Family%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&q=80' WHERE name LIKE '%Bắp Rang Bơ (M)%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=400&q=80' WHERE name LIKE '%Bắp Rang Bơ (L)%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&q=80' WHERE name LIKE '%Coca Cola (M)%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&q=80' WHERE name LIKE '%Coca Cola (L)%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&q=80' WHERE name LIKE '%Pepsi%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&q=80' WHERE name LIKE '%7Up%';
UPDATE combos SET image_url = 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80' WHERE name LIKE '%Snack%';

-- Thêm vài combo mới hấp dẫn nếu chưa có
INSERT IGNORE INTO combos (name, description, price, category, image_url) VALUES
('Combo VIP', '2 Bắp Rang Bơ (L) + 2 Nước lớn + 1 Snack', 159000, 'combo',
 'https://images.unsplash.com/photo-1489533119213-66a5cd877091?w=400&q=80'),
('Trà sữa (M)', 'Trà sữa trân châu size M thơm ngon', 45000, 'drink',
 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=400&q=80'),
('Khoai tây chiên', 'Khoai tây chiên giòn rụm', 39000, 'snack',
 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=400&q=80');

SELECT id, name, LEFT(image_url, 60) AS img FROM combos ORDER BY id;
