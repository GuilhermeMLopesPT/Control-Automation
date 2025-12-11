-- Supabase Database Setup for Smart Meter Project
-- Execute this SQL in your Supabase project's SQL Editor

-- Drop existing table if it exists (optional - only if you want to recreate)
-- DROP TABLE IF EXISTS power_readings;

-- Create table for storing power readings from ESP32
CREATE TABLE IF NOT EXISTS power_readings (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  current FLOAT NOT NULL,
  power FLOAT NOT NULL,
  vibration FLOAT NOT NULL,
  equipment TEXT NULL
);

-- Create index for fast timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_power_readings_timestamp 
  ON power_readings(timestamp DESC);

-- Optional: Enable Row Level Security (RLS) if needed
-- ALTER TABLE power_readings ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations" ON power_readings
--   FOR ALL USING (true) WITH CHECK (true);

-- Create table for storing measurement sessions (history)
CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  equipment TEXT NULL,
  total_cost FLOAT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast queries by date
CREATE INDEX IF NOT EXISTS idx_measurements_start_time 
  ON measurements(start_time DESC);

-- Create index for equipment filtering
CREATE INDEX IF NOT EXISTS idx_measurements_equipment 
  ON measurements(equipment);

-- Create index for active measurements (only one should be active at a time)
CREATE INDEX IF NOT EXISTS idx_measurements_is_active 
  ON measurements(is_active) WHERE is_active = TRUE;

-- Add equipment column if table already exists (run this if table was created before)
-- ALTER TABLE power_readings ADD COLUMN IF NOT EXISTS equipment TEXT NULL;

-- Add is_active column and make end_time nullable if table already exists
-- Run these commands in Supabase SQL Editor if you already have the measurements table:
-- ALTER TABLE measurements ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
-- ALTER TABLE measurements ALTER COLUMN end_time DROP NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_measurements_is_active ON measurements(is_active) WHERE is_active = TRUE;

-- Example query to verify table structure:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'power_readings'
-- ORDER BY ordinal_position;

