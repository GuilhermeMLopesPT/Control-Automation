import React from 'react';
import { motion } from 'framer-motion';

export default function CurrentGauge({ value, maxValue = 16, label, unit, color = "purple" }) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const strokeDasharray = 251.2; // 2 * PI * 40
  const strokeDashoffset = strokeDasharray - (percentage / 100) * strokeDasharray;

  const colors = {
    purple: { stroke: "#8B5CF6", glow: "rgba(139, 92, 246, 0.5)" },
    blue: { stroke: "#3B82F6", glow: "rgba(59, 130, 246, 0.5)" },
    green: { stroke: "#10B981", glow: "rgba(16, 185, 129, 0.5)" },
    amber: { stroke: "#F59E0B", glow: "rgba(245, 158, 11, 0.5)" }
  };

  const colorStyle = colors[color];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#1E293B"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={colorStyle.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            initial={{ strokeDashoffset: strokeDasharray }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 8px ${colorStyle.glow})`
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={value}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-bold text-white"
          >
            {value.toFixed(2)}
          </motion.span>
          <span className="text-slate-400 text-sm">{unit}</span>
        </div>
      </div>
      <p className="mt-3 text-slate-300 font-medium">{label}</p>
    </div>
  );
}

