import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap, TrendingUp, TrendingDown, Clock, Euro } from 'lucide-react';
import GlowCard from './GlowCard';
import ValueDisplay from './ValueDisplay';
import { fetchElectricityPrices } from '../lib/api';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800/95 backdrop-blur-xl border border-purple-500/30 rounded-xl p-4 shadow-xl shadow-purple-500/10">
        <p className="text-purple-300 font-medium mb-1">{label}</p>
        <p className="text-white text-lg font-bold">
          {payload[0].value.toFixed(4)} <span className="text-slate-400 text-sm">€/kWh</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function PricesTab() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [priceData, setPriceData] = useState([]);

  // Buscar preços da API Flask
  const { data: pricesResult, isLoading } = useQuery({
    queryKey: ['electricityPrices', selectedDate],
    queryFn: () => fetchElectricityPrices(selectedDate),
    refetchInterval: 3600000, // Atualiza a cada hora
  });

  useEffect(() => {
    if (pricesResult?.prices) {
      // Formatar dados para o gráfico
      const formatted = pricesResult.prices.map(price => ({
        hour: `${price.hour.toString().padStart(2, '0')}:00`,
        price: price.price,
        period: price.period,
      }));
      setPriceData(formatted);
    }
  }, [pricesResult]);

  const currentHour = new Date().getHours();
  const currentPrice = priceData.find(p => parseInt(p.hour.split(':')[0]) === currentHour)?.price || 0;
  const prices = priceData.map(d => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const minHour = prices.length ? priceData.find(p => p.price === minPrice)?.hour : '00:00';
  const maxHour = prices.length ? priceData.find(p => p.price === maxPrice)?.hour : '00:00';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full"
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Date Selector */}
      <GlowCard className="p-4">
        <div className="flex items-center gap-4">
          <label className="text-slate-300 font-medium">Select Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 rounded-lg bg-slate-800/50 border border-purple-500/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {pricesResult?.source === 'ree' ? (
            <span className="text-emerald-400 text-sm">✓ Using real REE API data</span>
          ) : (
            <span className="text-amber-400 text-sm">⚠ Using simulated data</span>
          )}
        </div>
      </GlowCard>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlowCard className="p-5" glowIntensity="high">
          <ValueDisplay
            label="Current Price"
            value={currentPrice.toFixed(4)}
            unit="€/kWh"
            icon={Zap}
            color="purple"
          />
        </GlowCard>
        
        <GlowCard className="p-5">
          <ValueDisplay
            label="Minimum Price"
            value={minPrice.toFixed(4)}
            unit="€/kWh"
            icon={TrendingDown}
            color="green"
          />
        </GlowCard>
        
        <GlowCard className="p-5">
          <ValueDisplay
            label="Maximum Price"
            value={maxPrice.toFixed(4)}
            unit="€/kWh"
            icon={TrendingUp}
            color="amber"
          />
        </GlowCard>
        
        <GlowCard className="p-5">
          <ValueDisplay
            label="Average Price"
            value={avgPrice.toFixed(4)}
            unit="€/kWh"
            icon={Euro}
            color="blue"
          />
        </GlowCard>
      </div>

      {/* Main Chart */}
      <GlowCard className="p-6" glowIntensity="medium">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">Today's PVPC Prices</h3>
            <p className="text-slate-400 text-sm mt-1">Red Eléctrica de España</p>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Clock className="w-4 h-4" />
            Updated hourly
          </div>
        </div>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.6} />
                  <stop offset="50%" stopColor="#A78BFA" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis 
                dataKey="hour" 
                stroke="#64748B"
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis 
                stroke="#64748B"
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value.toFixed(2)}€`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#8B5CF6"
                strokeWidth={3}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlowCard>

      {/* Price Timeline */}
      <GlowCard className="p-6">
        <h3 className="text-lg font-bold text-white mb-4">Hourly Breakdown</h3>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {priceData.map((item, index) => {
            const intensity = (item.price - minPrice) / (maxPrice - minPrice || 1);
            const hour = parseInt(item.hour.split(':')[0]);
            const isCurrentHour = hour === currentHour;
            
            return (
              <motion.div
                key={item.hour}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.02 }}
                className={`
                  relative p-2 rounded-lg text-center cursor-pointer
                  transition-all duration-300 hover:scale-105
                  ${isCurrentHour 
                    ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-500/30' 
                    : 'hover:bg-slate-700/50'
                  }
                `}
                style={{
                  background: `rgba(139, 92, 246, ${0.1 + intensity * 0.4})`
                }}
              >
                <p className="text-xs text-slate-400">{hour}h</p>
                <p className={`text-sm font-bold ${
                  item.price === minPrice ? 'text-emerald-400' :
                  item.price === maxPrice ? 'text-rose-400' :
                  'text-white'
                }`}>
                  {item.price.toFixed(2)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </GlowCard>
    </motion.div>
  );
}

