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
  vibration FLOAT NOT NULL
);

-- Create index for fast timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_power_readings_timestamp 
  ON power_readings(timestamp DESC);

-- Optional: Enable Row Level Security (RLS) if needed
-- ALTER TABLE power_readings ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations" ON power_readings
--   FOR ALL USING (true) WITH CHECK (true);

-- Example query to verify table structure:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'power_readings'
-- ORDER BY ordinal_position;

