-- Smart Meter Database Schema
-- This file contains the SQL schema for the Smart Meter application

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline'))
);

-- Power readings table - stores individual power measurements
CREATE TABLE IF NOT EXISTS public.power_readings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  power_kw DECIMAL(10,3) NOT NULL,
  voltage DECIMAL(10,2),
  current DECIMAL(10,3),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cost_per_hour DECIMAL(10,4),
  period TEXT CHECK (period IN ('valle', 'llano', 'punta')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Electricity prices table - stores Spanish electricity market prices
CREATE TABLE IF NOT EXISTS public.electricity_prices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  price_eur_kwh DECIMAL(10,6) NOT NULL,
  period TEXT CHECK (period IN ('valle', 'llano', 'punta')),
  source TEXT DEFAULT 'ree' CHECK (source IN ('ree', 'fallback')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, hour)
);

-- Daily consumption summaries
CREATE TABLE IF NOT EXISTS public.consumption_summaries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_kwh DECIMAL(10,3) NOT NULL DEFAULT 0,
  total_cost_eur DECIMAL(10,4) NOT NULL DEFAULT 0,
  peak_hours_kwh DECIMAL(10,3) NOT NULL DEFAULT 0,
  valley_hours_kwh DECIMAL(10,3) NOT NULL DEFAULT 0,
  flat_hours_kwh DECIMAL(10,3) NOT NULL DEFAULT 0,
  avg_power_kw DECIMAL(10,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- System logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  context TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_power_readings_user_timestamp ON public.power_readings(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_power_readings_timestamp ON public.power_readings(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_electricity_prices_date_hour ON public.electricity_prices(date, hour);
CREATE INDEX IF NOT EXISTS idx_consumption_summaries_user_date ON public.consumption_summaries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created ON public.system_logs(level, created_at DESC);

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own data
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own power readings" ON public.power_readings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own power readings" ON public.power_readings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own consumption summaries" ON public.consumption_summaries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consumption summaries" ON public.consumption_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own system logs" ON public.system_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Electricity prices are public (no RLS needed)
-- Anyone can read electricity prices

-- Functions for automatic data processing

-- Function to calculate consumption summary for a given date
CREATE OR REPLACE FUNCTION calculate_daily_summary(target_user_id UUID, target_date DATE)
RETURNS VOID AS $$
DECLARE
  total_kwh DECIMAL(10,3);
  total_cost DECIMAL(10,4);
  peak_kwh DECIMAL(10,3);
  valley_kwh DECIMAL(10,3);
  flat_kwh DECIMAL(10,3);
  avg_power DECIMAL(10,3);
BEGIN
  -- Calculate totals from power readings
  SELECT 
    COALESCE(SUM(power_kw), 0),
    COALESCE(SUM(cost_per_hour), 0),
    COALESCE(AVG(power_kw), 0)
  INTO total_kwh, total_cost, avg_power
  FROM public.power_readings
  WHERE user_id = target_user_id 
    AND DATE(timestamp) = target_date;

  -- Calculate consumption by period
  SELECT 
    COALESCE(SUM(CASE WHEN period = 'punta' THEN power_kw ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN period = 'valle' THEN power_kw ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN period = 'llano' THEN power_kw ELSE 0 END), 0)
  INTO peak_kwh, valley_kwh, flat_kwh
  FROM public.power_readings
  WHERE user_id = target_user_id 
    AND DATE(timestamp) = target_date;

  -- Insert or update summary
  INSERT INTO public.consumption_summaries (
    user_id, date, total_kwh, total_cost_eur, 
    peak_hours_kwh, valley_hours_kwh, flat_hours_kwh, avg_power_kw
  ) VALUES (
    target_user_id, target_date, total_kwh, total_cost,
    peak_kwh, valley_kwh, flat_kwh, avg_power
  )
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    total_kwh = EXCLUDED.total_kwh,
    total_cost_eur = EXCLUDED.total_cost_eur,
    peak_hours_kwh = EXCLUDED.peak_hours_kwh,
    valley_hours_kwh = EXCLUDED.valley_hours_kwh,
    flat_hours_kwh = EXCLUDED.flat_hours_kwh,
    avg_power_kw = EXCLUDED.avg_power_kw,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to determine electricity period based on hour
CREATE OR REPLACE FUNCTION get_electricity_period(hour_of_day INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF hour_of_day >= 0 AND hour_of_day < 8 THEN
    RETURN 'valle';
  ELSIF (hour_of_day >= 10 AND hour_of_day < 14) OR (hour_of_day >= 18 AND hour_of_day < 22) THEN
    RETURN 'punta';
  ELSE
    RETURN 'llano';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update user's last_active timestamp
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users 
  SET last_active = NOW(), status = 'online'
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_active
  AFTER INSERT ON public.power_readings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_last_active();

-- Sample data for testing (optional)
-- You can uncomment these lines to add sample data

/*
-- Insert sample electricity prices for today
INSERT INTO public.electricity_prices (date, hour, price_eur_kwh, period, source)
SELECT 
  CURRENT_DATE,
  generate_series(0, 23) as hour,
  CASE 
    WHEN generate_series(0, 23) BETWEEN 0 AND 7 THEN 0.08 + random() * 0.02
    WHEN generate_series(0, 23) BETWEEN 10 AND 13 OR generate_series(0, 23) BETWEEN 18 AND 21 THEN 0.25 + random() * 0.05
    ELSE 0.15 + random() * 0.03
  END as price_eur_kwh,
  get_electricity_period(generate_series(0, 23)) as period,
  'fallback' as source
ON CONFLICT (date, hour) DO NOTHING;
*/
