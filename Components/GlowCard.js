import React from 'react';
import { motion } from 'framer-motion';

export default function GlowCard({ children, className = "", glowIntensity = "medium" }) {
  const glowStyles = {
    low: "shadow-[0_0_30px_rgba(139,92,246,0.15)]",
    medium: "shadow-[0_0_40px_rgba(139,92,246,0.25)]",
    high: "shadow-[0_0_60px_rgba(139,92,246,0.35)]"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`
        relative overflow-hidden rounded-2xl
        bg-gradient-to-br from-slate-800/80 to-slate-900/90
        backdrop-blur-xl border border-purple-500/20
        ${glowStyles[glowIntensity]}
        hover:shadow-[0_0_80px_rgba(139,92,246,0.3)]
        transition-all duration-500
        ${className}
      `}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}

