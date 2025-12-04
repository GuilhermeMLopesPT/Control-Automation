import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Activity, Zap, RefreshCw, Power } from 'lucide-react';
import GlowCard from './GlowCard';
import CurrentGauge from './CurrentGauge';
import VibrationGauge from './VibrationGauge';
import LiveChart from './LiveChart';
import { fetchReadings, fetchRelayState, controlRelay, STANDARD_VOLTAGE } from '../lib/api';

export default function PowerTab() {
  const [chartData, setChartData] = useState([]);
  const [relayState, setRelayState] = useState('off');
  const [isControlling, setIsControlling] = useState(false);

  // Buscar leituras do Flask API
  const { data: readings, isLoading, refetch } = useQuery({
    queryKey: ['powerReadings'],
    queryFn: () => fetchReadings(100),
    refetchInterval: 2000, // Atualiza a cada 2 segundos
  });

  // Buscar estado do relay
  const { data: relayStatus } = useQuery({
    queryKey: ['relayState'],
    queryFn: fetchRelayState,
    refetchInterval: 1000, // Atualiza a cada 1 segundo
  });

  // Atualizar estado do relay quando receber do servidor
  useEffect(() => {
    if (relayStatus) {
      setRelayState(relayStatus);
    }
  }, [relayStatus]);

  // Processar dados para o gráfico
  useEffect(() => {
    if (readings && readings.length > 0) {
      const formattedData = readings
        .slice()
        .reverse()
        .map((reading) => {
          const timestamp = reading.timestamp || reading.created_date;
          const date = new Date(timestamp);
          return {
            time: date.toLocaleTimeString('pt-PT', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            current: reading.current || 0,
            power: (reading.current || 0) * STANDARD_VOLTAGE,
            vibration: reading.vibration || 0,
          };
        });
      setChartData(formattedData);
    }
  }, [readings]);

  // Valores atuais (última leitura)
  const latestReading = readings?.[0];
  const currentValue = latestReading?.current || 0;
  const powerValue = currentValue * STANDARD_VOLTAGE;
  const vibrationValue = latestReading?.vibration || 0;

  // Estatísticas
  const allCurrents = readings?.map(r => r.current || 0) || [];
  const allPowers = readings?.map(r => (r.current || 0) * STANDARD_VOLTAGE) || [];
  const allVibrations = readings?.map(r => r.vibration || 0) || [];
  
  const avgCurrent = allCurrents.length ? allCurrents.reduce((a, b) => a + b, 0) / allCurrents.length : 0;
  const maxCurrent = allCurrents.length ? Math.max(...allCurrents) : 0;
  const avgPower = allPowers.length ? allPowers.reduce((a, b) => a + b, 0) / allPowers.length : 0;
  const maxPower = allPowers.length ? Math.max(...allPowers) : 0;
  const avgVibration = allVibrations.length ? allVibrations.reduce((a, b) => a + b, 0) / allVibrations.length : 0;
  const maxVibration = allVibrations.length ? Math.max(...allVibrations) : 0;
  
  // Dynamic maxValue for vibration gauge (max historical + 20% buffer, min 1.0V, max 3.3V)
  const vibrationMaxValue = Math.max(1.0, Math.min(3.3, maxVibration * 1.2 || 1.0));

  // Controlar relay
  const handleRelayControl = async (command) => {
    setIsControlling(true);
    const success = await controlRelay(command);
    if (success) {
      setRelayState(command);
      // Refetch relay state after a short delay
      setTimeout(() => {
        refetch();
      }, 500);
    }
    setIsControlling(false);
  };

  // Inverter display do relay (mesma lógica do Streamlit)
  const displayIsOn = (relayState === 'off');

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
      {/* Live Indicator */}
      <GlowCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"
            />
            <span className="text-slate-300 font-medium">
              Smart Plug - Live Data
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </GlowCard>

      {/* Relay Control */}
      <GlowCard className="p-6" glowIntensity="high">
        <div className="flex flex-col items-center">
          <h3 className="text-white font-semibold mb-4">Relay Control</h3>
          <div className={`text-4xl font-bold mb-4 ${displayIsOn ? 'text-emerald-400' : 'text-slate-400'}`}>
            {displayIsOn ? 'ON' : 'OFF'}
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => handleRelayControl('off')}
              disabled={displayIsOn || isControlling}
              className={`
                px-6 py-3 rounded-xl font-medium transition-all
                ${displayIsOn || isControlling
                  ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:shadow-lg shadow-purple-500/30'
                }
              `}
            >
              <Power className="w-5 h-5 inline mr-2" />
              Turn ON
            </button>
            <button
              onClick={() => handleRelayControl('on')}
              disabled={!displayIsOn || isControlling}
              className={`
                px-6 py-3 rounded-xl font-medium transition-all
                ${!displayIsOn || isControlling
                  ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
                }
              `}
            >
              Turn OFF
            </button>
          </div>
        </div>
      </GlowCard>

      {/* Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlowCard className="p-6" glowIntensity="high">
          <div className="flex flex-col items-center">
            <CurrentGauge 
              value={currentValue} 
              maxValue={16} 
              label="Current" 
              unit="A"
              color="purple"
            />
            <div className="mt-4 grid grid-cols-2 gap-4 w-full">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Average</p>
                <p className="text-white font-bold">{avgCurrent.toFixed(3)} A</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Maximum</p>
                <p className="text-purple-400 font-bold">{maxCurrent.toFixed(3)} A</p>
              </div>
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-6" glowIntensity="high">
          <div className="flex flex-col items-center">
            <CurrentGauge 
              value={powerValue} 
              maxValue={3680} 
              label="Power" 
              unit="W"
              color="blue"
            />
            <div className="mt-4 grid grid-cols-2 gap-4 w-full">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Average</p>
                <p className="text-white font-bold">{avgPower.toFixed(1)} W</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Maximum</p>
                <p className="text-blue-400 font-bold">{maxPower.toFixed(1)} W</p>
              </div>
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-6" glowIntensity="high">
          <div className="flex flex-col items-center">
            <VibrationGauge 
              value={vibrationValue} 
              maxValue={vibrationMaxValue} 
              label="Vibration" 
              unit="V"
              color="amber"
            />
            <div className="mt-4 grid grid-cols-2 gap-4 w-full">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Average</p>
                <p className="text-white font-bold">{avgVibration.toFixed(3)} V</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-slate-400 text-xs">Maximum</p>
                <p className="text-amber-400 font-bold">{maxVibration.toFixed(3)} V</p>
              </div>
            </div>
          </div>
        </GlowCard>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <LiveChart
          data={chartData}
          dataKey="current"
          title="Current (A)"
          unit="A"
          color="#8B5CF6"
          gradientId="currentGrad"
        />
        <LiveChart
          data={chartData}
          dataKey="power"
          title="Power (W)"
          unit="W"
          color="#3B82F6"
          gradientId="powerGrad"
        />
        <LiveChart
          data={chartData}
          dataKey="vibration"
          title="Vibration (V)"
          unit="V"
          color="#F59E0B"
          gradientId="vibrationGrad"
        />
      </div>

      {/* Info */}
      <GlowCard className="p-4">
        <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <span>Voltage: {STANDARD_VOLTAGE}V</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span>Readings: {readings?.length || 0}</span>
          </div>
        </div>
      </GlowCard>
    </motion.div>
  );
}

