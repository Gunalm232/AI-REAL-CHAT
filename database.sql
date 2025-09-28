-- Chat App Database Schema
-- Run this SQL script to set up the database

-- Create database (if it doesn't exist)
CREATE DATABASE IF NOT EXISTS chat_app 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Use the database
USE chat_app;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    text VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_timestamp (timestamp),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert some sample messages (optional)
INSERT INTO messages (username, text) VALUES 
('System', 'Welcome to the chat! 🎉'),
('Admin', 'This is a sample message to test the chat functionality.'),
('User', 'Hello everyone! 👋');

-- Show table structure
DESCRIBE messages;

-- Show sample data
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 5;
