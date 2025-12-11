import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Euro, Activity, Zap, History } from 'lucide-react';
import PricesTab from '../Components/PricesTab';
import PowerTab from '../Components/PowerTab';
import MeasurementHistoryTab from '../Components/MeasurementHistoryTab';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('power');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/30"
            >
              <Zap className="w-8 h-8 text-white" />
            </motion.div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-300 via-violet-300 to-purple-400 bg-clip-text text-transparent mb-3">
            OhmAI
          </h1>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-purple-500/20 shadow-xl shadow-purple-500/10">
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={() => setActiveTab('power')}
                className={`
                  px-6 py-3 rounded-xl font-medium transition-all duration-300
                  flex items-center gap-2
                  ${activeTab === 'power'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }
                `}
              >
                <Activity className="w-4 h-4" />
                Power Monitor
              </button>
              <button
                onClick={() => setActiveTab('prices')}
                className={`
                  px-6 py-3 rounded-xl font-medium transition-all duration-300
                  flex items-center gap-2
                  ${activeTab === 'prices'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }
                `}
              >
                <Euro className="w-4 h-4" />
                Energy Prices
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`
                  px-6 py-3 rounded-xl font-medium transition-all duration-300
                  flex items-center gap-2
                  ${activeTab === 'history'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }
                `}
              >
                <History className="w-4 h-4" />
                Measurement History
              </button>
            </div>
          </div>
        </motion.div>

        {/* Tab Content - Keep all components mounted to preserve state */}
        <div className="relative">
          <div style={{ display: activeTab === 'power' ? 'block' : 'none' }}>
            <PowerTab />
          </div>
          <div style={{ display: activeTab === 'prices' ? 'block' : 'none' }}>
            <PricesTab />
          </div>
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
            <MeasurementHistoryTab />
          </div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center text-slate-500 text-sm"
        >
          <p>Real-time data from your ESP32 smart plug</p>
        </motion.footer>
      </div>
    </div>
  );
}

