-- Add combo items (food & drinks) and payment gateway integration
-- Created: 2026-01-03

-- Create combos table (food & drinks for sale)
CREATE TABLE IF NOT EXISTS combos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(500),
  category ENUM('popcorn', 'drink', 'combo', 'snack') DEFAULT 'combo',
  is_available TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_available (is_available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample combos (realistic Vietnamese cinema combos)
INSERT INTO combos (name, description, price, category, image_url) VALUES
('Combo Solo', '1 Bắp Rang Bơ (M) + 1 Coca Cola (M)', 69000, 'combo', '/images/combo-solo.jpg'),
('Combo Couple', '2 Bắp Rang Bơ (L) + 2 Coca Cola (L)', 129000, 'combo', '/images/combo-couple.jpg'),
('Combo Family', '3 Bắp Rang Bơ (L) + 3 Nước ngọt (L)', 189000, 'combo', '/images/combo-family.jpg'),
('Bắp Rang Bơ (M)', 'Bắp rang bơ size M', 45000, 'popcorn', '/images/popcorn-m.jpg'),
('Bắp Rang Bơ (L)', 'Bắp rang bơ size L', 55000, 'popcorn', '/images/popcorn-l.jpg'),
('Coca Cola (M)', 'Coca Cola size M', 30000, 'drink', '/images/coke-m.jpg'),
('Coca Cola (L)', 'Coca Cola size L', 40000, 'drink', '/images/coke-l.jpg'),
('Pepsi (M)', 'Pepsi size M', 30000, 'drink', '/images/pepsi-m.jpg'),
('7Up (M)', '7Up size M', 30000, 'drink', '/images/7up-m.jpg'),
('Snack Mix', 'Snack tổng hợp', 35000, 'snack', '/images/snack.jpg');

-- Add combo items column to tickets table (JSON format)
ALTER TABLE tickets 
ADD COLUMN combo_items JSON DEFAULT NULL COMMENT 'Array of {combo_id, quantity, price}' AFTER seats,
ADD COLUMN combo_total DECIMAL(10, 2) DEFAULT 0 COMMENT 'Total price of combos',
ADD COLUMN payment_method ENUM('online', 'vnpay', 'momo', 'cash', 'card') DEFAULT 'online' AFTER payment_status,
ADD COLUMN payment_gateway_ref VARCHAR(255) DEFAULT NULL COMMENT 'Transaction ID from payment gateway',
ADD COLUMN qr_code_url VARCHAR(500) DEFAULT NULL COMMENT 'Payment QR code URL',
ADD COLUMN payment_url VARCHAR(500) DEFAULT NULL COMMENT 'Payment gateway URL',
ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When payment was completed',
ADD INDEX idx_payment_method (payment_method),
ADD INDEX idx_payment_gateway_ref (payment_gateway_ref);

-- Create payment_transactions table for tracking all payment attempts
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  payment_method ENUM('vnpay', 'momo', 'zalopay', 'cash') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'VND',
  status ENUM('pending', 'success', 'failed', 'cancelled', 'refunded') DEFAULT 'pending',
  gateway_transaction_id VARCHAR(255) DEFAULT NULL,
  gateway_order_id VARCHAR(255) DEFAULT NULL,
  qr_code_url VARCHAR(500) DEFAULT NULL,
  payment_url VARCHAR(500) DEFAULT NULL,
  request_data JSON DEFAULT NULL COMMENT 'Request sent to gateway',
  response_data JSON DEFAULT NULL COMMENT 'Response from gateway',
  callback_data JSON DEFAULT NULL COMMENT 'Callback/webhook data',
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pt_status (status),
  INDEX idx_pt_gateway_transaction_id (gateway_transaction_id),
  INDEX idx_pt_user_id (user_id),
  INDEX idx_pt_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create payment_settings table for storing API keys (encrypted in production!)
CREATE TABLE IF NOT EXISTS payment_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gateway_name VARCHAR(50) NOT NULL UNIQUE,
  merchant_id VARCHAR(255) DEFAULT NULL,
  api_key VARCHAR(500) DEFAULT NULL,
  secret_key VARCHAR(500) DEFAULT NULL,
  webhook_secret VARCHAR(500) DEFAULT NULL,
  is_sandbox TINYINT(1) DEFAULT 1,
  is_enabled TINYINT(1) DEFAULT 1,
  settings JSON DEFAULT NULL COMMENT 'Additional gateway-specific settings',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default payment gateway settings (sandbox mode)
INSERT INTO payment_settings (gateway_name, merchant_id, is_sandbox, is_enabled, settings) VALUES
('vnpay', 'VNPAY_MERCHANT_ID', 1, 1, '{"version": "2.1.0", "currency": "VND"}'),
('momo', 'MOMO_PARTNER_CODE', 1, 1, '{"version": "2.0", "currency": "VND"}');

-- Add statistics view for revenue tracking
CREATE OR REPLACE VIEW revenue_summary AS
SELECT 
  DATE(created_at) as date,
  payment_method,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_bookings,
  SUM(CASE WHEN booking_status = 'confirmed' THEN total_amount ELSE 0 END) as total_revenue,
  SUM(CASE WHEN booking_status = 'confirmed' THEN combo_total ELSE 0 END) as combo_revenue,
  SUM(CASE WHEN booking_status = 'confirmed' THEN (total_amount - combo_total) ELSE 0 END) as ticket_revenue
FROM tickets
GROUP BY DATE(created_at), payment_method
ORDER BY date DESC, total_revenue DESC;

-- Add indexes for better performance
ALTER TABLE tickets ADD INDEX idx_booking_status_payment (booking_status, payment_status);
ALTER TABLE tickets ADD INDEX idx_created_at (created_at);
