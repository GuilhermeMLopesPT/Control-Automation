import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Clock, Euro, Calendar, Filter, TrendingUp, Trash2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import GlowCard from './GlowCard';
import { fetchMeasurements, deleteMeasurement, fetchMeasurementReadings, STANDARD_VOLTAGE } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MeasurementHistoryTab() {
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [expandedMeasurement, setExpandedMeasurement] = useState(null);
  const queryClient = useQueryClient();

  // Buscar histórico de medições
  const { data: measurements = [], isLoading, refetch } = useQuery({
    queryKey: ['measurements', selectedEquipment],
    queryFn: () => fetchMeasurements(100, selectedEquipment || null),
    refetchInterval: 10000, // Atualiza a cada 10 segundos
  });

  // Calcular estatísticas
  const totalMeasurements = measurements.length;
  const totalCost = measurements.reduce((sum, m) => sum + (m.total_cost || 0), 0);
  const avgCost = totalMeasurements > 0 ? totalCost / totalMeasurements : 0;
  
  // Agrupar por equipamento
  const equipmentStats = measurements.reduce((acc, m) => {
    const eq = m.equipment || 'Unknown';
    if (!acc[eq]) {
      acc[eq] = { count: 0, totalCost: 0 };
    }
    acc[eq].count++;
    acc[eq].totalCost += m.total_cost || 0;
    return acc;
  }, {});

  // Formatar duração
  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  };

  // Handler para eliminar medição
  const handleDelete = async (measurementId) => {
    if (!window.confirm('Are you sure you want to delete this measurement? This action cannot be undone.')) {
      return;
    }

    setDeletingId(measurementId);
    try {
      const success = await deleteMeasurement(measurementId);
      if (success) {
        // Invalidate and refetch measurements
        await queryClient.invalidateQueries(['measurements']);
        await refetch();
      } else {
        alert('Failed to delete measurement. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting measurement:', error);
      alert('Error deleting measurement. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Handler para expandir/colapsar medição e mostrar gráfico
  const toggleMeasurement = (measurementId) => {
    if (expandedMeasurement === measurementId) {
      setExpandedMeasurement(null);
    } else {
      setExpandedMeasurement(measurementId);
    }
  };

  // Handler para exportar CSV
  const handleExportCSV = async (measurement) => {
    try {
      console.log('[MeasurementHistoryTab] Exporting CSV for measurement:', measurement.id);
      
      // Buscar todos os readings da medição
      const readings = await fetchMeasurementReadings(
        measurement.equipment,
        measurement.start_time,
        measurement.end_time
      );

      if (!readings || readings.length === 0) {
        alert('No data available to export for this measurement.');
        return;
      }

      // Criar cabeçalho CSV
      const headers = ['Timestamp', 'Current (A)', 'Power (W)', 'Vibration', 'Equipment'];
      const csvRows = [headers.join(',')];

      // Adicionar dados
      readings.forEach((reading) => {
        const timestamp = reading.timestamp || reading.created_date;
        const date = new Date(timestamp);
        const timestampStr = date.toISOString();
        const current = (reading.current || 0).toFixed(6);
        // O power vem em kW do servidor, converter para W
        const powerWatts = ((reading.power || 0) * 1000).toFixed(3);
        const vibration = (reading.vibration || 0).toFixed(6);
        const equipment = reading.equipment || measurement.equipment || '';

        csvRows.push([
          timestampStr,
          current,
          powerWatts,
          vibration,
          equipment
        ].join(','));
      });

      // Criar conteúdo CSV
      const csvContent = csvRows.join('\n');

      // Criar blob e fazer download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      // Nome do ficheiro baseado na medição
      const startDate = new Date(measurement.start_time);
      const dateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = startDate.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      const equipmentStr = (measurement.equipment || 'measurement').replace(/\//g, '-');
      const filename = `${equipmentStr}_${dateStr}_${timeStr}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`[MeasurementHistoryTab] ✓ CSV exported: ${filename} (${readings.length} data points)`);
    } catch (error) {
      console.error('[MeasurementHistoryTab] Error exporting CSV:', error);
      alert('Error exporting CSV. Please try again.');
    }
  };

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

  // Lista única de equipamentos para filtro
  const equipmentList = [...new Set(measurements.map(m => m.equipment).filter(Boolean))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlowCard className="p-5" glowIntensity="high">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/30">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Measurements</p>
              <p className="text-2xl font-bold text-white">{totalMeasurements}</p>
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-5" glowIntensity="high">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <Euro className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Cost</p>
              <p className="text-2xl font-bold text-emerald-400">{totalCost.toFixed(4)} €</p>
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-5" glowIntensity="high">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Average Cost</p>
              <p className="text-2xl font-bold text-blue-400">{avgCost.toFixed(4)} €</p>
            </div>
          </div>
        </GlowCard>
      </div>

      {/* Filter */}
      <GlowCard className="p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-purple-400" />
          <label className="text-white font-medium">Filter by Equipment:</label>
          <select
            value={selectedEquipment}
            onChange={(e) => setSelectedEquipment(e.target.value)}
            className="
              px-4 py-2 rounded-xl bg-slate-800/50 border border-purple-500/30 
              text-white font-medium
              focus:outline-none focus:ring-2 focus:ring-purple-500/50
              hover:bg-slate-700/50 transition-colors
              flex-1 md:flex-none md:w-64
            "
          >
            <option value="">All Equipment</option>
            {equipmentList.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
        </div>
      </GlowCard>

      {/* Equipment Stats */}
      {Object.keys(equipmentStats).length > 0 && (
        <GlowCard className="p-6">
          <h3 className="text-lg font-bold text-white mb-4">Statistics by Equipment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(equipmentStats).map(([equipment, stats]) => (
              <div
                key={equipment}
                className="p-4 rounded-lg bg-slate-800/50 border border-purple-500/20"
              >
                <p className="text-purple-400 font-semibold mb-2">{equipment}</p>
                <div className="space-y-1">
                  <p className="text-slate-400 text-sm">
                    Count: <span className="text-white">{stats.count}</span>
                  </p>
                  <p className="text-slate-400 text-sm">
                    Total: <span className="text-emerald-400">{stats.totalCost.toFixed(4)} €</span>
                  </p>
                  <p className="text-slate-400 text-sm">
                    Avg: <span className="text-blue-400">{(stats.totalCost / stats.count).toFixed(4)} €</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>
      )}

      {/* Measurements List */}
      <GlowCard className="p-6" glowIntensity="high">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Measurement History</h3>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
          >
            <Clock className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {measurements.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No measurements found</p>
            <p className="text-slate-500 text-sm mt-2">
              Start a measurement in the Power Monitor tab to see history here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {measurements.map((measurement, index) => (
              <motion.div
                key={measurement.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="
                  rounded-xl bg-slate-800/50 border border-purple-500/20
                  hover:bg-slate-700/50 hover:border-purple-500/40 transition-all
                "
              >
                <div className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {measurement.equipment && (
                          <span className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-sm font-medium border border-purple-500/30">
                            {measurement.equipment}
                          </span>
                        )}
                        <span className="text-slate-400 text-sm">
                          {formatDuration(measurement.start_time, measurement.end_time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>
                          {new Date(measurement.start_time).toLocaleString('pt-PT')}
                        </span>
                        <span>→</span>
                        <span>
                          {new Date(measurement.end_time).toLocaleTimeString('pt-PT')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-emerald-400">
                          {measurement.total_cost?.toFixed(4) || '0.0000'} <span className="text-lg text-slate-400">€</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleExportCSV(measurement)}
                        className="p-2 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 hover:text-green-300 border border-green-600/30 transition-all"
                        title="Export data to CSV"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleMeasurement(measurement.id)}
                        className="p-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 border border-blue-600/30 transition-all"
                        title={expandedMeasurement === measurement.id ? "Hide chart" : "Show consumption chart"}
                      >
                        {expandedMeasurement === measurement.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(measurement.id)}
                        disabled={deletingId === measurement.id}
                        className={`
                          p-2 rounded-lg transition-all duration-200
                          ${deletingId === measurement.id
                            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                            : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 border border-red-600/30'
                          }
                        `}
                        title="Delete measurement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Expanded Chart Section */}
                <AnimatePresence>
                  {expandedMeasurement === measurement.id && (
                    <MeasurementChart measurement={measurement} />
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </GlowCard>
    </motion.div>
  );
}

// Componente para mostrar gráfico de uma medição específica
function MeasurementChart({ measurement }) {
  const isEnabled = !!measurement.equipment && !!measurement.start_time && !!measurement.end_time;
  
  console.log('[MeasurementChart] Component rendered:', {
    measurementId: measurement.id,
    equipment: measurement.equipment,
    start_time: measurement.start_time,
    end_time: measurement.end_time,
    isEnabled: isEnabled
  });
  
  const { data: readings = [], isLoading, error } = useQuery({
    queryKey: ['measurementReadings', measurement.id, measurement.equipment, measurement.start_time, measurement.end_time],
    queryFn: async () => {
      console.log('[MeasurementChart] Query function called, fetching readings:', {
        equipment: measurement.equipment,
        start_time: measurement.start_time,
        end_time: measurement.end_time
      });
      const data = await fetchMeasurementReadings(
        measurement.equipment,
        measurement.start_time,
        measurement.end_time
      );
      console.log('[MeasurementChart] Received readings:', data.length, 'items');
      if (data.length > 0) {
        console.log('[MeasurementChart] First reading sample:', data[0]);
      }
      return data;
    },
    enabled: isEnabled,
    retry: 1,
  });
  
  console.log('[MeasurementChart] Query state:', {
    isLoading,
    hasError: !!error,
    readingsCount: readings.length,
    error: error?.message
  });

  // Processar dados para o gráfico
  const chartData = readings.map((reading) => {
    const timestamp = reading.timestamp || reading.created_date;
    const date = new Date(timestamp);
    // O power já vem em kW do servidor, converter para W para o gráfico
    const powerWatts = (reading.power || 0) * 1000;
    return {
      time: date.toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      timestamp: timestamp,
      current: reading.current || 0,
      power: powerWatts, // Já em Watts
      vibration: reading.vibration || 0,
    };
  });

  console.log('[MeasurementChart] Processed chartData:', chartData.length, 'items');

  if (isLoading) {
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="p-4 border-t border-purple-500/20">
          <div className="flex items-center justify-center h-64">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full"
            />
          </div>
        </div>
      </motion.div>
    );
  }

  if (error) {
    console.error('[MeasurementChart] Error:', error);
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="p-4 border-t border-purple-500/20">
          <div className="text-center py-8 space-y-2">
            <p className="text-red-400">Error loading data</p>
            <p className="text-slate-500 text-sm">{error.message || 'Unknown error'}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (chartData.length === 0 && !isLoading) {
    // Debug: show what was sent and received
    console.log('[MeasurementChart] No data - Debug info:', {
      equipment: measurement.equipment,
      start_time: measurement.start_time,
      end_time: measurement.end_time,
      readingsReceived: readings.length,
      error: error?.message,
      isEnabled: isEnabled
    });
    
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="p-4 border-t border-purple-500/20">
          <div className="text-center py-8 space-y-2">
            <p className="text-slate-400">No consumption data available for this measurement</p>
            <p className="text-slate-500 text-sm">
              Equipment: {measurement.equipment}<br/>
              Start: {new Date(measurement.start_time).toLocaleString('pt-PT')}<br/>
              End: {new Date(measurement.end_time).toLocaleString('pt-PT')}<br/>
              Raw readings count: {readings.length}
              {error && (
                <>
                  <br/>
                  <span className="text-red-400">Error: {error.message}</span>
                </>
              )}
            </p>
            <p className="text-slate-600 text-xs mt-2">
              Check browser console (F12) for detailed logs
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="p-4 border-t border-purple-500/20 space-y-4">
        <h4 className="text-white font-semibold">Consumption Over Time</h4>
        <div className="h-64 min-h-[256px] w-full" style={{ minWidth: '100%', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={256}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(value) => `${value.toFixed(0)}W`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #475569',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#cbd5e1' }}
                formatter={(value) => [`${value.toFixed(1)} W`, 'Power']}
              />
              <Area
                type="monotone"
                dataKey="power"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#powerGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className="text-slate-400">Data Points</p>
            <p className="text-white font-bold">{chartData.length}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className="text-slate-400">Max Power</p>
            <p className="text-blue-400 font-bold">{Math.max(...chartData.map(d => d.power)).toFixed(1)} W</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className="text-slate-400">Avg Power</p>
            <p className="text-purple-400 font-bold">
              {(chartData.reduce((sum, d) => sum + d.power, 0) / chartData.length).toFixed(1)} W
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

