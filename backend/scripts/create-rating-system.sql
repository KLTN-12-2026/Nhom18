-- Create movie_ratings table
CREATE TABLE IF NOT EXISTS movie_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  movie_id INT NOT NULL,
  user_id INT NOT NULL,
  rating DECIMAL(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_movie (user_id, movie_id),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_movie_id (movie_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add average_rating and rating_count columns to movies table
ALTER TABLE movies 
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(2,1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_movies_rating ON movies(average_rating);

-- Create trigger to update movie average rating
DELIMITER //

DROP TRIGGER IF EXISTS update_movie_rating_after_insert//
CREATE TRIGGER update_movie_rating_after_insert
AFTER INSERT ON movie_ratings
FOR EACH ROW
BEGIN
  UPDATE movies 
  SET 
    average_rating = (SELECT AVG(rating) FROM movie_ratings WHERE movie_id = NEW.movie_id),
    rating_count = (SELECT COUNT(*) FROM movie_ratings WHERE movie_id = NEW.movie_id)
  WHERE id = NEW.movie_id;
END//

DROP TRIGGER IF EXISTS update_movie_rating_after_update//
CREATE TRIGGER update_movie_rating_after_update
AFTER UPDATE ON movie_ratings
FOR EACH ROW
BEGIN
  UPDATE movies 
  SET 
    average_rating = (SELECT AVG(rating) FROM movie_ratings WHERE movie_id = NEW.movie_id),
    rating_count = (SELECT COUNT(*) FROM movie_ratings WHERE movie_id = NEW.movie_id)
  WHERE id = NEW.movie_id;
END//

DROP TRIGGER IF EXISTS update_movie_rating_after_delete//
CREATE TRIGGER update_movie_rating_after_delete
AFTER DELETE ON movie_ratings
FOR EACH ROW
BEGIN
  UPDATE movies 
  SET 
    average_rating = IFNULL((SELECT AVG(rating) FROM movie_ratings WHERE movie_id = OLD.movie_id), 0),
    rating_count = (SELECT COUNT(*) FROM movie_ratings WHERE movie_id = OLD.movie_id)
  WHERE id = OLD.movie_id;
END//

DELIMITER ;
