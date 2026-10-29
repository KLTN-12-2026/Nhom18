-- Migration: Add Google OAuth support
-- Run this BEFORE enabling Google login:
--   mysql -u root -p movie_booking < 07-add-google-oauth.sql

ALTER TABLE users
  ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER email,
  ADD COLUMN avatar_url TEXT NULL AFTER phone;

-- If the INSERT fails due to password NOT NULL, run this too:
-- ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL;
