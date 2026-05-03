-- PostgreSQL schema for Render (or any Postgres). Run in Render Postgres "Shell" or psql.

-- Users (Admin/Staff for Login)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100)
);

-- Members
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    profile_image TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memberships
CREATE TABLE IF NOT EXISTS memberships (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES members(id) ON DELETE CASCADE,
    type VARCHAR(50),
    start_date DATE,
    end_date DATE
);

-- Trainers
CREATE TABLE IF NOT EXISTS trainers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    specialization VARCHAR(100),
    phone VARCHAR(20)
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES members(id),
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES members(id),
    amount NUMERIC(10, 2),
    payment_date DATE,
    method VARCHAR(50)
);
