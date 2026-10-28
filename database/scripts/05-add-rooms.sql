-- Create rooms table for cinema screening rooms
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  cinema_id INTEGER NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  room_name VARCHAR(100) NOT NULL,
  total_seats INTEGER NOT NULL DEFAULT 100,
  room_type VARCHAR(50) DEFAULT 'standard', -- standard, vip, imax, 4dx
  features TEXT, -- JSON array of features like "Dolby Atmos", "3D", "Recliner Seats"
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cinema_id, room_name)
);

-- Add room_id to showtimes table (skip if already exists)
-- Note: MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- The migration script will catch the error if column exists
ALTER TABLE showtimes ADD COLUMN room_id BIGINT UNSIGNED;
ALTER TABLE showtimes ADD CONSTRAINT fk_showtime_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;

-- Create index for better performance (skip if already exists) CREATE INDEX IF NOT EXISTS idx_rooms_cinema ON rooms(cinema_id);
CREATE INDEX idx_showtimes_room ON showtimes(room_id);

-- Insert sample rooms for each cinema
-- Grand Cinema Downtown (cinema_id = 1) - 4 rooms
INSERT IGNORE INTO rooms (cinema_id, room_name, total_seats, room_type, features) VALUES
(1, 'Phòng 1', 120, 'standard', '["Digital Sound", "2D/3D"]'),
(1, 'Phòng 2', 100, 'standard', '["Digital Sound", "2D/3D"]'),
(1, 'Phòng 3', 150, 'vip', '["Dolby Atmos", "Recliner Seats", "3D"]'),
(1, 'Phòng 4', 80, 'imax', '["IMAX", "Dolby Atmos", "3D"]');

-- Luxury Theater Mall (cinema_id = 2) - 3 rooms
INSERT IGNORE INTO rooms (cinema_id, room_name, total_seats, room_type, features) VALUES
(2, 'Phòng A', 110, 'standard', '["Digital Sound", "2D/3D"]'),
(2, 'Phòng B', 130, 'vip', '["Dolby Atmos", "Recliner Seats"]'),
(2, 'Phòng C', 90, '4dx', '["4DX", "Motion Seats", "3D"]');

-- Classic Cinema Park (cinema_id = 3) - 3 rooms
INSERT IGNORE INTO rooms (cinema_id, room_name, total_seats, room_type, features) VALUES
(3, 'Sala 1', 100, 'standard', '["Digital Sound", "2D"]'),
(3, 'Sala 2', 120, 'standard', '["Digital Sound", "2D/3D"]'),
(3, 'Sala 3', 140, 'vip', '["Dolby Atmos", "Recliner Seats", "3D"]');

-- Update existing showtimes to assign them to rooms
-- Simple approach: Assign first available room for each cinema
UPDATE showtimes s
SET s.room_id = (
  SELECT r.id 
  FROM rooms r 
  WHERE r.cinema_id = s.cinema_id 
  ORDER BY RAND()
  LIMIT 1
)
WHERE s.room_id IS NULL;

-- Update total_seats in showtimes to match room capacity
UPDATE showtimes s
JOIN rooms r ON s.room_id = r.id
SET s.total_seats = r.total_seats,
    s.available_seats = LEAST(s.available_seats, r.total_seats)
WHERE s.room_id IS NOT NULL;
