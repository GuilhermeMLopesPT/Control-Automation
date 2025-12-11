import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Activity, Zap, RefreshCw, Power, Euro, Play, Square } from 'lucide-react';
import GlowCard from './GlowCard';
import CurrentGauge from './CurrentGauge';
import VibrationGauge from './VibrationGauge';
import LiveChart from './LiveChart';
import { fetchReadings, fetchRelayState, controlRelay, STANDARD_VOLTAGE, fetchElectricityPrices, updateEquipment, saveMeasurement, getActiveMeasurement, syncActiveMeasurement, updateActiveMeasurement } from '../lib/api';

// Funções para persistência no localStorage
const MEASUREMENT_STORAGE_KEY = 'activeMeasurement';

const saveMeasurementState = (state) => {
  try {
    localStorage.setItem(MEASUREMENT_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving measurement state:', error);
  }
};

const loadMeasurementState = () => {
  try {
    const saved = localStorage.getItem(MEASUREMENT_STORAGE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      // Verificar se a medição ainda está válida (não mais de 24 horas)
      const startTime = new Date(state.startTime);
      const now = new Date();
      const hoursDiff = (now - startTime) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        return state;
      } else {
        // Medição muito antiga, limpar
        localStorage.removeItem(MEASUREMENT_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error('Error loading measurement state:', error);
  }
  return null;
};

const clearMeasurementState = () => {
  try {
    localStorage.removeItem(MEASUREMENT_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing measurement state:', error);
  }
};

export default function PowerTab() {
  const [chartData, setChartData] = useState([]);
  const [relayState, setRelayState] = useState('off');
  const [isControlling, setIsControlling] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedCycle, setSelectedCycle] = useState('');
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [lastPowerValue, setLastPowerValue] = useState(0);
  const [lastMeasurement, setLastMeasurement] = useState(null); // Guarda última medição completa

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

  // Buscar preços de eletricidade da REE
  const today = new Date().toISOString().split('T')[0];
  const { data: pricesResult } = useQuery({
    queryKey: ['electricityPrices', today],
    queryFn: () => fetchElectricityPrices(today),
    refetchInterval: 3600000, // Atualiza a cada hora
  });

  // Refs para manter valores atualizados dentro do intervalo (inicializar com 0)
  const powerValueRef = useRef(0);
  const lastPowerValueRef = useRef(0);
  const lowPowerCountRef = useRef(0); // Contador de medições consecutivas com potência <= 0.01W

  // Restaurar estado da medição (localStorage + BD para sincronização entre dispositivos)
  useEffect(() => {
    const restoreMeasurement = async () => {
      // Primeiro verificar BD (tem prioridade para sincronização entre dispositivos)
      const activeMeasurement = await getActiveMeasurement();
      
      if (activeMeasurement && activeMeasurement.equipment) {
        const savedStartTime = new Date(activeMeasurement.start_time);
        const now = new Date();
        const hoursDiff = (now - savedStartTime) / (1000 * 60 * 60);
        const minutesDiff = hoursDiff * 60;
        
        // Restaurar se tiver menos de 24 horas (para evitar medições muito antigas "fantasma")
        // Mas priorizar medições mais recentes
        if (minutesDiff < 24 * 60) {
          console.log(`[PowerTab] Restoring active measurement from DB (${minutesDiff.toFixed(1)} minutes old)`);
          setIsMeasuring(true);
          setStartTime(savedStartTime);
          setTotalCost(activeMeasurement.total_cost || 0);
          setLastPowerValue(0);
          powerValueRef.current = 0;
          lastPowerValueRef.current = 0;
          lowPowerCountRef.current = 0; // Resetar contador
          
          // Tentar extrair equipamento do formato "WM/cycle" ou "Heater"
          const eq = activeMeasurement.equipment || '';
          if (eq.startsWith('WM/')) {
            const cycle = eq.replace('WM/', '');
            setSelectedEquipment('washing-machine');
            setSelectedCycle(cycle);
          } else if (eq === 'Heater') {
            setSelectedEquipment('heater');
            setSelectedCycle('');
          } else if (eq === 'Kettle') {
            setSelectedEquipment('kettle');
            setSelectedCycle('');
          }
          
          // Determinar equipment e cycle corretos
          const restoredEquipment = eq.startsWith('WM/') ? 'washing-machine' : (eq === 'Heater' ? 'heater' : 'kettle');
          const restoredCycle = eq.startsWith('WM/') ? eq.replace('WM/', '') : '';
          
          // Sincronizar com localStorage também
          saveMeasurementState({
            isMeasuring: true,
            startTime: savedStartTime.toISOString(),
            totalCost: activeMeasurement.total_cost || 0,
            selectedEquipment: restoredEquipment,
            selectedCycle: restoredCycle,
            lastPowerValue: 0
          });
          
          console.log(`[PowerTab] ✓ Measurement restored from DB: equipment=${restoredEquipment}, cycle=${restoredCycle}, cost=${activeMeasurement.total_cost || 0}, age=${minutesDiff.toFixed(1)} minutes`);
          return;
        } else {
          console.log(`[PowerTab] Ignoring very old active measurement (${minutesDiff.toFixed(1)} minutes old, likely orphaned)`);
        }
      }
      
      // Fallback para localStorage se não houver medição ativa na BD
      const savedState = loadMeasurementState();
      if (savedState && savedState.isMeasuring) {
        const savedStartTime = new Date(savedState.startTime);
        const now = new Date();
        const hoursDiff = (now - savedStartTime) / (1000 * 60 * 60);
        const minutesDiff = hoursDiff * 60;
        
        // Restaurar se tiver menos de 24 horas E tiver equipamento escolhido
        if (minutesDiff < 24 * 60 && savedState.selectedEquipment) {
          console.log(`[PowerTab] Restoring measurement from localStorage (${minutesDiff.toFixed(1)} minutes old)`);
          setIsMeasuring(true);
          setStartTime(savedStartTime);
          setSelectedEquipment(savedState.selectedEquipment || '');
          setSelectedCycle(savedState.selectedCycle || '');
          setTotalCost(savedState.totalCost || 0);
          setLastPowerValue(savedState.lastPowerValue || 0);
          powerValueRef.current = savedState.lastPowerValue || 0;
          lastPowerValueRef.current = 0;
          lowPowerCountRef.current = 0; // Resetar contador
          
          // Sincronizar com BD
          const equipmentLabel = savedState.selectedEquipment === 'washing-machine' 
            ? (savedState.selectedCycle ? `WM/${savedState.selectedCycle}` : 'WM')
            : (savedState.selectedEquipment === 'heater' ? 'Heater' : 'Kettle');
          
          syncActiveMeasurement(
            savedStartTime.toISOString(),
            equipmentLabel,
            savedState.totalCost || 0
          );
        }
      }
    };
    
    restoreMeasurement();
  }, []); // Executar apenas uma vez ao montar

  // Atualizar localStorage quando equipamento/ciclo muda durante medição ativa
  useEffect(() => {
    if (isMeasuring && startTime) {
      saveMeasurementState({
        isMeasuring: true,
        startTime: startTime.toISOString(),
        totalCost: totalCost,
        selectedEquipment: selectedEquipment,
        selectedCycle: selectedCycle,
        lastPowerValue: lastPowerValue
      });
    }
  }, [selectedEquipment, selectedCycle, isMeasuring, startTime, totalCost, lastPowerValue]);

  // Sincronizar com BD periodicamente para manter dispositivos sincronizados
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      const activeMeasurement = await getActiveMeasurement();
      
      if (activeMeasurement) {
        const activeStartTime = new Date(activeMeasurement.start_time);
        const now = new Date();
        const hoursDiff = (now - activeStartTime) / (1000 * 60 * 60);
        
        // Só considerar medições muito recentes (menos de 3 minutos) para evitar restaurar medições antigas
        // A sincronização periódica NÃO deve restaurar medições - só sincronizar se já estiver a medir
        const minutesDiff = hoursDiff * 60;
        
        if (minutesDiff < 3 && activeMeasurement.equipment) {
          if (isMeasuring && startTime) {
            // Se já está a medir localmente, sincronizar custo
            const activeStartTimeISO = activeStartTime.toISOString();
            const currentStartTimeISO = startTime.toISOString();
            
            if (activeStartTimeISO === currentStartTimeISO) {
              const bdCost = activeMeasurement.total_cost || 0;
              const localCost = totalCost;
              
              // Se o custo na BD for maior (outro dispositivo atualizou), usar o da BD
              if (bdCost > localCost) {
                setTotalCost(bdCost);
              } else if (localCost > bdCost) {
                // Se o custo local for maior, atualizar BD
                updateActiveMeasurement(startTime.toISOString(), localCost, getEquipmentLabel());
              }
            }
          } else if (!isMeasuring) {
            // NÃO restaurar automaticamente na sincronização periódica
            // A medição só deve começar quando o usuário clicar explicitamente no botão Start
            // Se houver uma medição ativa na BD mas o usuário não está a medir localmente,
            // isso significa que ou:
            // 1. É uma medição antiga/"fantasma" que deve ser ignorada
            // 2. O usuário parou a medição manualmente e não quer continuar
            // Em ambos os casos, não devemos restaurar automaticamente
          }
        }
      } else if (isMeasuring && startTime) {
        // Se está a medir localmente mas não há medição ativa na BD, criar
        syncActiveMeasurement(startTime.toISOString(), getEquipmentLabel(), totalCost);
      }
    }, 5000); // Verificar a cada 5 segundos

    return () => clearInterval(syncInterval);
  }, [isMeasuring, startTime, totalCost, selectedEquipment, selectedCycle]);

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
          // Ajustar para hora local: subtrair 1 hora (3600000 ms) para corrigir timezone
          const localDate = new Date(date.getTime() - 3600000);
          return {
            time: localDate.toLocaleTimeString('pt-PT', {
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

  // Atualizar refs quando powerValue muda
  useEffect(() => {
    powerValueRef.current = powerValue;
    lastPowerValueRef.current = lastPowerValue;
  }, [powerValue, lastPowerValue]);

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

  // Dynamic maxValue for vibration gauge (max historical + 20% buffer, min 1.0V, max 3.3V)
  const vibrationMaxValue = Math.max(1.0, Math.min(3.3, maxVibration * 1.2 || 1.0));

  // Obter preço atual da eletricidade
  const getCurrentPrice = () => {
    if (!pricesResult?.prices) return 0;
    const currentHour = new Date().getHours();
    const currentPriceData = pricesResult.prices.find(p => p.hour === currentHour);
    return currentPriceData?.price || 0;
  };

  // Formatar nome do equipamento para guardar na base de dados
  const getEquipmentLabel = () => {
    if (!selectedEquipment) return null;
    
    if (selectedEquipment === 'washing-machine') {
      if (selectedCycle) {
        return `WM/${selectedCycle}`;
      }
      return 'WM';
    }
    
    // Para outros equipamentos, usar o nome diretamente
    return selectedEquipment === 'heater' ? 'Heater' : 
           selectedEquipment === 'kettle' ? 'Kettle' : 
           selectedEquipment;
  };

  // Calcular custo acumulado durante medição (a cada 7 segundos)
  useEffect(() => {
    if (!isMeasuring || !startTime) return;

    // Intervalo de 7 segundos para calcular custo
    const interval = setInterval(() => {
      const currentPower = powerValueRef.current;
      const prevPower = lastPowerValueRef.current;
      
      if (!latestReading) return;

      const currentPricePerKWh = getCurrentPrice();

      // Delta t = 7 segundos (conforme especificado)
      const deltaTSec = 7;
      const deltaTHours = deltaTSec / 3600; // Converter para horas (7/3600 = 0.001944...)

      // Usar potência atual
      const avgPower = currentPower;

      // Calcular energia consumida: E = P * t (em kWh)
      // Potência em W, tempo em horas: E (kWh) = P (W) * t (h) / 1000
      // Exemplo: 2000W * 0.001944h / 1000 = 0.003888 kWh
      const energyConsumedKWh = (avgPower * deltaTHours) / 1000;

      // Obter preço da hora atual (pode mudar durante medições longas)
      const now = new Date();
      const currentHour = now.getHours();
      const priceForHour = pricesResult?.prices?.find(p => p.hour === currentHour)?.price || currentPricePerKWh;

      // Calcular custo: Custo = Energia (kWh) * Preço (€/kWh)
      const costIncrement = energyConsumedKWh * priceForHour;

      // Debug: Log cálculo a cada 10 iterações (aprox. 1 minuto) para não poluir console
      if (Math.random() < 0.1) { // 10% das vezes
        console.log(`[PowerTab] Cost calculation: Power=${avgPower.toFixed(2)}W, Time=${deltaTHours.toFixed(6)}h, Energy=${energyConsumedKWh.toFixed(6)}kWh, Price=${priceForHour.toFixed(4)}€/kWh, Cost=${costIncrement.toFixed(8)}€`);
      }

      // Atualizar custo total apenas se potência > 0
      if (costIncrement > 0 && currentPower > 0.01) {
        setTotalCost(prev => {
          const newCost = prev + costIncrement;
          const equipmentLabel = getEquipmentLabel();
          
          // Guardar estado no localStorage
          saveMeasurementState({
            isMeasuring: true,
            startTime: startTime.toISOString(),
            totalCost: newCost,
            selectedEquipment: selectedEquipment,
            selectedCycle: selectedCycle,
            lastPowerValue: currentPower
          });
          
          // Sincronizar com BD (a cada atualização de custo)
          updateActiveMeasurement(startTime.toISOString(), newCost, equipmentLabel).catch(err => {
            console.error('Error syncing active measurement:', err);
          });
          
          return newCost;
        });
        setLastPowerValue(currentPower);
      }

      // Detetar quando potência chega a 0 (fim do ciclo)
      // Requer 3 medições consecutivas com potência <= 0.01W para confirmar
      // Só parar se a medição já teve pelo menos 10 segundos (para evitar falsos positivos)
      const timeSinceStart = (new Date() - new Date(startTime)) / 1000; // em segundos
      
      if (timeSinceStart >= 10) {
        // Verificar se potência está baixa (<= 0.01W)
        if (currentPower <= 0.01) {
          if (prevPower > 0.01) {
            // Primeira vez que a potência desce para <= 0.01W (transição de >0.01 para <=0.01)
            lowPowerCountRef.current = 1;
            console.log(`[PowerTab] 🔽 Potência desceu de ${prevPower.toFixed(3)}W para ${currentPower.toFixed(3)}W (1/3 confirmações)`);
          } else if (prevPower <= 0.01) {
            // Potência continua <= 0.01W (já estava baixa na leitura anterior)
            // Incrementar contador APENAS se já tiver começado (>= 1) ou se for a primeira vez após 10s
            // Isto garante que só conta após a transição inicial ou continua a contar se já começou
            if (lowPowerCountRef.current === 0) {
              // Se o contador ainda está em 0 mas prevPower já era <= 0.01, significa que
              // a potência já estava baixa desde o início. Só começamos a contar após 10s.
              lowPowerCountRef.current = 1;
              console.log(`[PowerTab] ⏱️ Potência <= 0.01W detectada (1/3 confirmações) - current: ${currentPower.toFixed(3)}W, prev: ${prevPower.toFixed(3)}W`);
            } else {
              // Contador já começou, incrementar
              lowPowerCountRef.current += 1;
              console.log(`[PowerTab] ⏱️ Potência <= 0.01W confirmada (${lowPowerCountRef.current}/3 confirmações) - current: ${currentPower.toFixed(3)}W, prev: ${prevPower.toFixed(3)}W`);
            }
          }
        } else {
          // Potência subiu acima de 0.01W, resetar contador completamente
          if (lowPowerCountRef.current > 0) {
            console.log(`[PowerTab] 🔼 Potência subiu de ${prevPower.toFixed(3)}W para ${currentPower.toFixed(3)}W, resetando contador`);
            lowPowerCountRef.current = 0;
          }
        }
        
        // Atualizar prevPower para a próxima iteração (sempre, independentemente do valor)
        lastPowerValueRef.current = currentPower;
        
        // Só parar após 3 confirmações consecutivas
        if (lowPowerCountRef.current >= 3) {
          console.log(`[PowerTab] ✅ 3 confirmações consecutivas de potência <= 0.01W - parando medição automaticamente`);
          // Potência confirmada em 0, parar medição
          const endTime = new Date();
          const equipmentLabel = getEquipmentLabel();
          
          // Guardar medição final antes de parar
          const finalCost = totalCost;
          const measurementData = {
            startTime: startTime,
            endTime: endTime,
            equipment: equipmentLabel,
            totalCost: finalCost
          };
          
          // Atualizar registos e guardar medição
          Promise.all([
            equipmentLabel ? updateEquipment(startTime.toISOString(), endTime.toISOString(), equipmentLabel) : Promise.resolve(),
            saveMeasurement(startTime.toISOString(), endTime.toISOString(), equipmentLabel, finalCost)
          ]).then(() => {
            setLastMeasurement(measurementData);
          }).catch(err => {
            console.error('Error saving measurement:', err);
            // Ainda assim guarda os dados localmente
            setLastMeasurement(measurementData);
          });
          
          setIsMeasuring(false);
          clearMeasurementState(); // Limpar estado do localStorage
          lowPowerCountRef.current = 0; // Resetar contador
          clearInterval(interval);
        }
      }
    }, 7000); // Executar a cada 7 segundos

    // Cleanup
    return () => clearInterval(interval);
  }, [isMeasuring, startTime, latestReading, selectedEquipment, selectedCycle]);

  // Nota: A detecção de fim de ciclo é feita apenas no intervalo de 7 segundos acima
  // para evitar conflitos e garantir que o contador funciona corretamente

  // Handler para iniciar/parar medição
  const handleStartStop = async () => {
    if (!isMeasuring) {
      // Iniciar medição
      const now = new Date();
      setIsMeasuring(true);
      setTotalCost(0);
      setStartTime(now);
      // Inicializar lastPowerValue com 0 para evitar detecção prematura de fim de ciclo
      setLastPowerValue(0);
      powerValueRef.current = powerValue;
      lastPowerValueRef.current = 0;
      lowPowerCountRef.current = 0; // Resetar contador de confirmações
      setLastMeasurement(null); // Limpar medição anterior
      
      // Guardar estado no localStorage
      saveMeasurementState({
        isMeasuring: true,
        startTime: now.toISOString(),
        totalCost: 0,
        selectedEquipment: selectedEquipment,
        selectedCycle: selectedCycle,
        lastPowerValue: powerValue
      });
      
      // Criar medição ativa na BD para sincronização entre dispositivos
      // NÃO chamar updateEquipment aqui - os novos registros serão preenchidos automaticamente
      // pelo servidor quando verificar a medição ativa
      const equipmentLabel = getEquipmentLabel();
      if (equipmentLabel) {
        await syncActiveMeasurement(now.toISOString(), equipmentLabel, 0);
      }
    } else {
      // Parar medição manualmente
      const endTime = new Date();
      const equipmentLabel = getEquipmentLabel();
      const finalCost = totalCost;
      
      if (startTime) {
        // Guardar medição final
        const measurementData = {
          startTime: startTime,
          endTime: endTime,
          equipment: equipmentLabel,
          totalCost: finalCost
        };
        
        Promise.all([
          equipmentLabel ? updateEquipment(startTime.toISOString(), endTime.toISOString(), equipmentLabel) : Promise.resolve(),
          saveMeasurement(startTime.toISOString(), endTime.toISOString(), equipmentLabel, finalCost)
        ]).then(() => {
          setLastMeasurement(measurementData);
        }).catch(err => {
          console.error('Error saving measurement:', err);
          setLastMeasurement(measurementData);
        });
      }
      
      setIsMeasuring(false);
      clearMeasurementState(); // Limpar estado do localStorage
      lowPowerCountRef.current = 0; // Resetar contador quando parar manualmente
    }
  };

  // Reset quando muda equipamento
  useEffect(() => {
    if (selectedEquipment && !isMeasuring) {
      setTotalCost(0);
      setStartTime(null);
      setLastPowerValue(0);
    }
  }, [selectedEquipment]);

  // Washing cycles for washing machine
  const washingCycles = [
    'Algodón',
    'Eco 40-60',
    'Mixtos',
    'Rápido 30',
    'Sintético',
    'Ropa de deporte',
    'Lavado a mano/lana',
    'Delicado',
    'Limpieza de la cuba',
    'Descarga de programa'
  ];

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
      {/* Equipment Selection */}
      <GlowCard className="p-6" glowIntensity="high">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-purple-400" />
            <label className="text-white font-medium">Equipment:</label>
          </div>
          <select
            value={selectedEquipment}
            onChange={(e) => {
              setSelectedEquipment(e.target.value);
              setSelectedCycle(''); // Reset cycle when equipment changes
              if (isMeasuring) {
                setIsMeasuring(false); // Stop measurement when changing equipment
                clearMeasurementState(); // Limpar estado do localStorage
              }
            }}
            className="
              px-4 py-2 rounded-xl bg-slate-800/50 border border-purple-500/30 
              text-white font-medium
              focus:outline-none focus:ring-2 focus:ring-purple-500/50
              hover:bg-slate-700/50 transition-colors
              flex-1 md:flex-none md:w-64
            "
          >
            <option value="">Select Equipment</option>
            <option value="washing-machine">Washing Machine</option>
            <option value="heater">Heater</option>
            <option value="kettle">Kettle</option>
          </select>

          {selectedEquipment === 'washing-machine' && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 w-full md:w-auto"
            >
              <label className="text-white font-medium">Washing Cycle:</label>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                className="
                  px-4 py-2 rounded-xl bg-slate-800/50 border border-violet-500/30 
                  text-white font-medium
                  focus:outline-none focus:ring-2 focus:ring-violet-500/50
                  hover:bg-slate-700/50 transition-colors
                  flex-1 md:flex-none md:w-48
                "
              >
                <option value="">Select Cycle</option>
                {washingCycles.map((cycle) => (
                  <option key={cycle} value={cycle.toLowerCase().replace(' ', '-')}>
                    {cycle}
                  </option>
                ))}
              </select>
            </motion.div>
          )}

          {selectedEquipment && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={handleStartStop}
                disabled={isMeasuring && powerValue <= 0.01}
                className={`
                  px-6 py-2 rounded-xl font-medium transition-all duration-300
                  flex items-center gap-2
                  ${isMeasuring
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:shadow-lg shadow-red-500/30'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:shadow-lg shadow-emerald-500/30'
                  }
                  ${isMeasuring && powerValue <= 0.01 ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
                `}
              >
                {isMeasuring ? (
                  <>
                    <Square className="w-4 h-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
            </motion.div>
          )}
        </div>
      </GlowCard>

      {/* Cost Display - Mostrar quando está a medir OU quando há última medição */}
      {(isMeasuring || lastMeasurement) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <GlowCard className="p-6" glowIntensity="high">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
                  <Euro className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-slate-400 text-sm">
                    {isMeasuring ? 'Cost since start' : 'Last measurement cost'}
                  </p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {(isMeasuring ? totalCost : lastMeasurement?.totalCost || 0).toFixed(4)} 
                    <span className="text-lg text-slate-400"> €</span>
                  </p>
                  {isMeasuring && startTime ? (
                    <p className="text-xs text-slate-500 mt-1">
                      Started: {new Date(startTime).toLocaleTimeString('pt-PT')}
                    </p>
                  ) : lastMeasurement ? (
                    <p className="text-xs text-slate-500 mt-1">
                      {lastMeasurement.equipment && (
                        <span className="text-purple-400">{lastMeasurement.equipment} • </span>
                      )}
                      {new Date(lastMeasurement.startTime).toLocaleString('pt-PT')} - {new Date(lastMeasurement.endTime).toLocaleTimeString('pt-PT')}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm">Current Price</p>
                <p className="text-xl font-bold text-purple-400">
                  {getCurrentPrice().toFixed(4)} <span className="text-sm text-slate-400">€/kWh</span>
                </p>
                <p className="text-slate-400 text-sm mt-1">Power: {powerValue.toFixed(1)} W</p>
              </div>
            </div>
            {isMeasuring && powerValue <= 0.01 && lastPowerValue > 0.01 && lowPowerCountRef.current > 0 && lowPowerCountRef.current < 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 p-3 rounded-lg bg-amber-500/20 border border-amber-500/30"
              >
                <p className="text-amber-400 text-sm text-center">
                  ⚠ Low power detected ({lowPowerCountRef.current}/3 confirmations). Waiting for confirmation...
                </p>
              </motion.div>
            )}
            {isMeasuring && lowPowerCountRef.current >= 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 p-3 rounded-lg bg-amber-500/20 border border-amber-500/30"
              >
                <p className="text-amber-400 text-sm text-center">
                  ⚠ Equipment stopped. Measurement complete.
                </p>
              </motion.div>
            )}
          </GlowCard>
        </motion.div>
      )}

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

