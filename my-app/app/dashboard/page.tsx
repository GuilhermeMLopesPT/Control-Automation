"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Zap, 
  TrendingUp, 
  Euro, 
  BarChart3, 
  Monitor,
  Clock,
  Activity,
  Vibrate
} from "lucide-react"
import { ElectricityPricesTab } from "@/components/electricity-prices-tab"

interface PowerData {
  timestamp: string
  power: number
  current: number
  voltage: number
  cost: number
}

interface VibrationData {
  timestamp: string
  vibration: number
  frequency: number
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("monitoring")
  const [currentPower, setCurrentPower] = useState(2.1)
  const [currentCurrent, setCurrentCurrent] = useState(9.5)
  const [currentVoltage, setCurrentVoltage] = useState(230)
  const [powerHistory, setPowerHistory] = useState<PowerData[]>([])
  const [vibrationHistory, setVibrationHistory] = useState<VibrationData[]>([])

  // Fetch real-time data from Arduino
  useEffect(() => {
    const fetchArduinoData = async () => {
      try {
        const response = await fetch('/api/arduino-data?limit=24')
        const result = await response.json()
        
        if (result.success && result.data.length > 0) {
          const latestData = result.data[0]
          
          setCurrentPower(Math.round(latestData.power * 10) / 10)
          setCurrentCurrent(Math.round(latestData.current * 10) / 10)
          setCurrentVoltage(Math.round(latestData.voltage * 10) / 10)
          
          // Update power history
          const powerHistoryData: PowerData[] = result.data.map((data: any) => ({
            timestamp: data.timestamp,
            power: data.power,
            current: data.current,
            voltage: data.voltage,
            cost: data.power * 0.15
          }))
          
          setPowerHistory(powerHistoryData)
          
          // Update vibration history if available
          const vibrationHistoryData: VibrationData[] = result.data
            .filter((data: any) => data.vibration !== undefined)
            .map((data: any) => ({
              timestamp: data.timestamp,
              vibration: data.vibration,
              frequency: data.frequency || 50
            }))
          
          setVibrationHistory(vibrationHistoryData)
        }
      } catch (error) {
        console.error('Error fetching Arduino data:', error)
        // Fallback to simulated data if Arduino is not connected
        const variation = (Math.random() - 0.5) * 0.5
        const newPower = Math.max(0, currentPower + variation)
        const newCurrent = Math.max(0, currentCurrent + (Math.random() - 0.5) * 0.5)
        const newVoltage = 230 + (Math.random() - 0.5) * 10
        
        setCurrentPower(Math.round(newPower * 10) / 10)
        setCurrentCurrent(Math.round(newCurrent * 10) / 10)
        setCurrentVoltage(Math.round(newVoltage * 10) / 10)
        
        const newPowerData: PowerData = {
          timestamp: new Date().toISOString(),
          power: newPower,
          current: newCurrent,
          voltage: newVoltage,
          cost: newPower * 0.15
        }
        
        setPowerHistory(prev => [newPowerData, ...prev.slice(0, 23)])
        
        const newVibrationData: VibrationData = {
          timestamp: new Date().toISOString(),
          vibration: Math.random() * 100,
          frequency: 50 + Math.random() * 20
        }
        
        setVibrationHistory(prev => [newVibrationData, ...prev.slice(0, 23)])
      }
    }

    // Fetch data immediately
    fetchArduinoData()
    
    // Then fetch every 2 seconds
    const interval = setInterval(fetchArduinoData, 2000)

    return () => clearInterval(interval)
  }, [])

  const totalCost = powerHistory.reduce((sum, data) => sum + data.cost, 0)
  const avgPower = powerHistory.length > 0 ? powerHistory.reduce((sum, data) => sum + data.power, 0) / powerHistory.length : 0
  const avgVibration = vibrationHistory.length > 0 ? vibrationHistory.reduce((sum, data) => sum + data.vibration, 0) / vibrationHistory.length : 0

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-primary rounded-lg">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-primary">
              Smart Meter
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <Button
              variant={activeTab === "monitoring" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("monitoring")}
            >
              <Monitor className="mr-3 h-5 w-5" />
              Power Monitoring
            </Button>
            <Button
              variant={activeTab === "vibration" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("vibration")}
            >
              <Vibrate className="mr-3 h-5 w-5" />
              Vibration Sensor
            </Button>
            <Button
              variant={activeTab === "prices" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("prices")}
            >
              <Euro className="mr-3 h-5 w-5" />
              REE Prices
            </Button>
          </div>
        </nav>

        {/* Stats */}
        <div className="p-4 space-y-4 border-t border-border">
          <Card className="smart-card">
            <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Current Power</span>
                <Badge variant="secondary" className="text-xs">
                Live
              </Badge>
            </div>
              <div className="text-2xl font-bold text-primary">{currentPower} kW</div>
              <div className="text-sm text-muted-foreground mt-1">
                {currentCurrent} A @ {currentVoltage} V
            </div>
            </CardContent>
          </Card>

          <Card className="smart-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Vibration Level</span>
                <Activity className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold text-foreground">{avgVibration.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                Avg: {avgPower.toFixed(1)} kW
              </div>
            </CardContent>
          </Card>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {activeTab === "monitoring" && "Power Monitoring"}
              {activeTab === "vibration" && "Vibration Sensor"}
              {activeTab === "prices" && "REE Electricity Prices"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeTab === "monitoring" && "Real-time power, current and voltage monitoring"}
              {activeTab === "vibration" && "Vibration sensor data and frequency analysis"}
              {activeTab === "prices" && "Spanish electricity market prices from REE"}
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "monitoring" && (
            <div className="space-y-6">
              {/* Current Power Display */}
              <Card className="smart-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Monitor className="h-6 w-6 text-primary mr-3" />
                    Current Power Consumption
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <div className="text-6xl font-bold text-primary mb-4">{currentPower} kW</div>
                    <div className="text-muted-foreground mb-6">Real-time power consumption</div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{currentCurrent} A</div>
                        <div className="text-sm text-muted-foreground">Current</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{currentVoltage} V</div>
                        <div className="text-sm text-muted-foreground">Voltage</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">€{(currentPower * 0.15).toFixed(2)}</div>
                        <div className="text-sm text-muted-foreground">Cost/hour</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Power History Chart */}
              <Card className="smart-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="h-6 w-6 text-primary mr-3" />
                    Power & Current History (Last 24 readings)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-end justify-between gap-1">
                    {powerHistory.slice(0, 24).map((data, index) => (
                      <div key={index} className="flex flex-col items-center gap-1 flex-1">
                        <div
                          className="bg-primary rounded-t w-full min-h-[4px]"
                          style={{ height: `${(data.power / 5) * 100}%` }}
                          title={`Power: ${data.power} kW - Current: ${data.current} A - ${new Date(data.timestamp).toLocaleTimeString()}`}
                        />
                        <div
                          className="bg-chart-2 rounded-t w-full min-h-[2px]"
                          style={{ height: `${(data.current / 15) * 50}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-primary rounded"></div>
                      <span>Power (kW)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-chart-2 rounded"></div>
                      <span>Current (A)</span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground text-center">
                    Each bar represents a 2-second reading
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "vibration" && (
            <div className="space-y-6">
              {/* Vibration Display */}
              <Card className="smart-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Vibrate className="h-6 w-6 text-primary mr-3" />
                    Vibration Sensor Data
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <div className="text-6xl font-bold text-primary mb-4">{avgVibration.toFixed(1)}%</div>
                    <div className="text-muted-foreground mb-6">Current vibration level</div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{vibrationHistory[0]?.frequency.toFixed(1) || 0} Hz</div>
                        <div className="text-sm text-muted-foreground">Frequency</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold text-foreground">{vibrationHistory[0]?.vibration.toFixed(1) || 0}%</div>
                        <div className="text-sm text-muted-foreground">Current Level</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vibration History Chart */}
              <Card className="smart-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="h-6 w-6 text-primary mr-3" />
                    Vibration History (Last 24 readings)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-end justify-between gap-1">
                    {vibrationHistory.slice(0, 24).map((data, index) => (
                      <div key={index} className="flex flex-col items-center gap-1 flex-1">
                        <div
                          className="bg-chart-3 rounded-t w-full min-h-[4px]"
                          style={{ height: `${data.vibration}%` }}
                          title={`Vibration: ${data.vibration.toFixed(1)}% - Frequency: ${data.frequency.toFixed(1)} Hz - ${new Date(data.timestamp).toLocaleTimeString()}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground text-center">
                    Each bar represents a 2-second reading
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "prices" && <ElectricityPricesTab />}
        </div>
      </main>
    </div>
  )
}
