import React from 'react';
import { motion } from 'framer-motion';

export default function ValueDisplay({ label, value, unit, icon: Icon, trend, color = "purple" }) {
  const colorStyles = {
    purple: "from-purple-400 to-violet-500",
    blue: "from-blue-400 to-indigo-500",
    green: "from-emerald-400 to-teal-500",
    amber: "from-amber-400 to-orange-500"
  };

  return (
    <div className="flex items-center gap-4">
      {Icon && (
        <div className={`
          p-3 rounded-xl bg-gradient-to-br ${colorStyles[color]}
          shadow-lg shadow-purple-500/20
        `}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      )}
      <div className="flex-1">
        <p className="text-sm text-slate-400 font-medium">{label}</p>
        <div className="flex items-baseline gap-2">
          <motion.span
            key={value}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-2xl font-bold bg-gradient-to-r ${colorStyles[color]} bg-clip-text text-transparent`}
          >
            {value}
          </motion.span>
          <span className="text-slate-500 text-sm">{unit}</span>
        </div>
        {trend && (
          <span className={`text-xs ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

