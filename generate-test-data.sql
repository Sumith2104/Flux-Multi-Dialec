-- =========================================================================
-- COMPLEX SAAS TEST SCHEMA FOR FLUXBASE ANALYTICS
-- Compatible with both PostgreSQL and MySQL
-- =========================================================================

-- Clean up any existing tables to start fresh
DROP TABLE IF EXISTS billing_events;
DROP TABLE IF EXISTS api_metrics;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS users;

-- 1. Users Table
CREATE TABLE users (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    plan_type VARCHAR(50) DEFAULT 'free',
    signup_date DATE NOT NULL
);

-- 2. Subscriptions Table
CREATE TABLE subscriptions (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    status VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP NULL
);

-- 3. API Metrics Table
CREATE TABLE api_metrics (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    status_code INT NOT NULL,
    latency_ms INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Billing Events Table
CREATE TABLE billing_events (
    id VARCHAR(128) PRIMARY KEY,
    subscription_id VARCHAR(128) NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    billing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================================
-- INSERTING MOCK DATA
-- =========================================================================

-- Users Data
INSERT INTO users (id, email, full_name, plan_type, signup_date) VALUES 
('usr_1', 'john.doe@example.com', 'John Doe', 'pro', '2026-05-10'),
('usr_2', 'jane.smith@example.com', 'Jane Smith', 'enterprise', '2026-05-11'),
('usr_3', 'alice.jones@example.com', 'Alice Jones', 'free', '2026-05-12'),
('usr_4', 'bob.miller@example.com', 'Bob Miller', 'pro', '2026-05-12'),
('usr_5', 'charlie.brown@example.com', 'Charlie Brown', 'free', '2026-05-14'),
('usr_6', 'david.wilson@example.com', 'David Wilson', 'pro', '2026-05-15'),
('usr_7', 'emma.davis@example.com', 'Emma Davis', 'free', '2026-05-18'),
('usr_8', 'fiona.gallagher@example.com', 'Fiona Gallagher', 'pro', '2026-05-18'),
('usr_9', 'george.cloney@example.com', 'George Clooney', 'free', '2026-05-20'),
('usr_10', 'hannah.abbott@example.com', 'Hannah Abbott', 'enterprise', '2026-05-22'),
('usr_11', 'ian.malcolm@example.com', 'Ian Malcolm', 'free', '2026-05-23'),
('usr_12', 'julia.roberts@example.com', 'Julia Roberts', 'pro', '2026-05-24'),
('usr_13', 'kevin.bacon@example.com', 'Kevin Bacon', 'free', '2026-05-25'),
('usr_14', 'laura.croft@example.com', 'Laura Croft', 'pro', '2026-05-26'),
('usr_15', 'mike.tyson@example.com', 'Mike Tyson', 'enterprise', '2026-05-26');

-- Subscriptions Data
INSERT INTO subscriptions (id, user_id, status, amount, started_at, ends_at) VALUES 
('sub_1', 'usr_1', 'active', 29.00, '2026-05-10 10:00:00', NULL),
('sub_2', 'usr_2', 'active', 299.00, '2026-05-11 11:30:00', NULL),
('sub_3', 'usr_4', 'canceled', 29.00, '2026-05-12 14:00:00', '2026-05-20 18:00:00'),
('sub_4', 'usr_6', 'active', 29.00, '2026-05-15 09:15:00', NULL),
('sub_5', 'usr_8', 'past_due', 29.00, '2026-05-18 16:45:00', NULL),
('sub_6', 'usr_10', 'active', 299.00, '2026-05-22 13:00:00', NULL),
('sub_7', 'usr_12', 'active', 29.00, '2026-05-24 10:20:00', NULL),
('sub_8', 'usr_14', 'active', 29.00, '2026-05-26 08:00:00', NULL),
('sub_9', 'usr_15', 'active', 299.00, '2026-05-26 09:30:00', NULL);

-- API Metrics Data (varying latency and status codes)
INSERT INTO api_metrics (id, user_id, endpoint, status_code, latency_ms, created_at) VALUES 
('api_1', 'usr_1', '/v1/data', 200, 45, '2026-05-20 10:00:00'),
('api_2', 'usr_1', '/v1/data', 200, 52, '2026-05-20 10:05:00'),
('api_3', 'usr_3', '/v1/auth', 401, 12, '2026-05-21 08:30:00'),
('api_4', 'usr_2', '/v1/search', 200, 180, '2026-05-21 09:45:00'),
('api_5', 'usr_4', '/v1/data', 500, 1020, '2026-05-22 14:15:00'),
('api_6', 'usr_5', '/v1/data', 200, 68, '2026-05-22 15:30:00'),
('api_7', 'usr_6', '/v1/data', 200, 39, '2026-05-23 11:00:00'),
('api_8', 'usr_2', '/v1/data', 200, 240, '2026-05-23 12:15:00'),
('api_9', 'usr_8', '/v1/search', 200, 195, '2026-05-24 14:30:00'),
('api_10', 'usr_1', '/v1/data', 200, 41, '2026-05-24 15:00:00'),
('api_11', 'usr_10', '/v1/analytics', 200, 350, '2026-05-25 10:00:00'),
('api_12', 'usr_11', '/v1/auth', 200, 18, '2026-05-25 11:30:00'),
('api_13', 'usr_12', '/v1/data', 200, 85, '2026-05-25 16:00:00'),
('api_14', 'usr_13', '/v1/data', 404, 30, '2026-05-26 09:00:00'),
('api_15', 'usr_14', '/v1/search', 200, 160, '2026-05-26 09:30:00'),
('api_16', 'usr_15', '/v1/data', 200, 120, '2026-05-26 10:15:00'),
('api_17', 'usr_15', '/v1/analytics', 500, 1250, '2026-05-26 10:30:00'),
('api_18', 'usr_2', '/v1/search', 200, 210, '2026-05-26 11:00:00');

-- Billing Events Data
INSERT INTO billing_events (id, subscription_id, amount_paid, payment_status, billing_date) VALUES 
('bil_1', 'sub_1', 29.00, 'succeeded', '2026-05-10 10:01:00'),
('bil_2', 'sub_2', 299.00, 'succeeded', '2026-05-11 11:31:00'),
('bil_3', 'sub_3', 29.00, 'succeeded', '2026-05-12 14:01:00'),
('bil_4', 'sub_4', 29.00, 'succeeded', '2026-05-15 09:16:00'),
('bil_5', 'sub_5', 29.00, 'failed', '2026-05-18 16:46:00'),
('bil_6', 'sub_6', 299.00, 'succeeded', '2026-05-22 13:01:00'),
('bil_7', 'sub_7', 29.00, 'succeeded', '2026-05-24 10:21:00'),
('bil_8', 'sub_8', 29.00, 'succeeded', '2026-05-26 08:01:00'),
('bil_9', 'sub_9', 299.00, 'succeeded', '2026-05-26 09:31:00');
