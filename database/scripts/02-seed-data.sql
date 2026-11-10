-- Insert sample cinemas
INSERT INTO cinemas (name, location) VALUES
('Grand Cinema Downtown', '123 Main Street, Downtown'),
('Luxury Theater Mall', '456 Shopping Center, Westside'),
('Classic Cinema Park', '789 Park Avenue, Eastside')
ON CONFLICT DO NOTHING;

-- Insert sample movies
INSERT INTO movies (title, genre, rating, duration, poster_url, description, release_date) VALUES
('The Dark Knight Returns', 'Action', 'PG-13', 152, '/placeholder.svg?height=400&width=300', 'An epic conclusion to the legendary superhero saga with stunning visuals and intense action sequences.', '2024-12-15'),
('Midnight in Paris', 'Romance', 'PG', 94, '/placeholder.svg?height=400&width=300', 'A charming romantic comedy set in the beautiful streets of Paris during the golden hour.', '2024-11-20'),
('Quantum Horizon', 'Sci-Fi', 'PG-13', 138, '/placeholder.svg?height=400&width=300', 'A mind-bending journey through time and space that challenges everything we know about reality.', '2024-12-01'),
('The Last Symphony', 'Drama', 'R', 127, '/placeholder.svg?height=400&width=300', 'A powerful drama about a composer''s final masterpiece and the lives it touches.', '2024-11-25'),
('Ocean''s Edge', 'Thriller', 'PG-13', 115, '/placeholder.svg?height=400&width=300', 'A gripping thriller set on the high seas where nothing is as it seems.', '2024-12-10'),
('Golden Hour', 'Comedy', 'PG', 102, '/placeholder.svg?height=400&width=300', 'A heartwarming comedy about finding joy in life''s unexpected moments.', '2024-11-30')
ON CONFLICT DO NOTHING;

-- Insert sample showtimes for the next 7 days
INSERT INTO showtimes (movie_id, cinema_id, show_date, show_time, price) VALUES
-- The Dark Knight Returns
(1, 1, CURRENT_DATE, '14:00', 12.50),
(1, 1, CURRENT_DATE, '17:30', 15.00),
(1, 1, CURRENT_DATE, '21:00', 15.00),
(1, 2, CURRENT_DATE, '15:00', 13.00),
(1, 2, CURRENT_DATE, '19:00', 16.00),
(1, 3, CURRENT_DATE, '16:00', 11.50),
(1, 3, CURRENT_DATE, '20:30', 14.50),

-- Midnight in Paris
(2, 1, CURRENT_DATE, '13:30', 11.00),
(2, 1, CURRENT_DATE, '16:00', 12.50),
(2, 2, CURRENT_DATE, '14:30', 12.00),
(2, 3, CURRENT_DATE, '18:00', 11.50),

-- Quantum Horizon
(3, 1, CURRENT_DATE, '18:00', 14.00),
(3, 1, CURRENT_DATE, '21:30', 16.50),
(3, 2, CURRENT_DATE, '17:00', 14.50),
(3, 3, CURRENT_DATE, '19:30', 13.50),

-- The Last Symphony
(4, 1, CURRENT_DATE, '15:30', 13.00),
(4, 2, CURRENT_DATE, '20:00', 15.50),
(4, 3, CURRENT_DATE, '17:30', 12.50),

-- Ocean's Edge
(5, 1, CURRENT_DATE, '19:30', 13.50),
(5, 2, CURRENT_DATE, '16:30', 13.00),
(5, 3, CURRENT_DATE, '21:00', 14.00),

-- Golden Hour
(6, 1, CURRENT_DATE, '12:00', 10.50),
(6, 2, CURRENT_DATE, '13:00', 11.00),
(6, 3, CURRENT_DATE, '15:00', 10.50)
ON CONFLICT DO NOTHING;

-- Create admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, is_admin) VALUES
('admin@cinema.com', '$2b$10$rQZ8kHWiZ8.WZ8kHWiZ8.OZ8kHWiZ8.WZ8kHWiZ8.WZ8kHWiZ8.W', 'Admin', 'User', true)
ON CONFLICT DO NOTHING;
