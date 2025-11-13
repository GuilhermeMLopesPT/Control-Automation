import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for Smart Meter database tables
export interface User {
  id: string
  email: string
  name: string
  created_at: string
  last_active: string
  status: 'online' | 'offline'
}

export interface PowerReading {
  id: string
  user_id: string
  power_kw: number
  voltage: number
  current: number
  timestamp: string
  cost_per_hour: number
  period: 'valle' | 'llano' | 'punta'
}

export interface ElectricityPrice {
  id: string
  date: string
  hour: number
  price_eur_kwh: number
  period: 'valle' | 'llano' | 'punta'
  source: 'ree' | 'fallback'
  created_at: string
}

export interface ConsumptionSummary {
  id: string
  user_id: string
  date: string
  total_kwh: number
  total_cost_eur: number
  peak_hours_kwh: number
  valley_hours_kwh: number
  flat_hours_kwh: number
  avg_power_kw: number
  created_at: string
}

export interface SystemLog {
  id: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  context?: string
  user_id?: string
  created_at: string
}
