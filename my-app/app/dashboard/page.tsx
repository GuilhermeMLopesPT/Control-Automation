"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Zap, 
  TrendingUp, 
  Euro, 
  Monitor,
  Activity,
  Power
} from "lucide-react"
import { ElectricityPricesTab } from "@/components/electricity-prices-tab"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface MeasurementData {
  timestamp: string
  timestampMs: number  // Milliseconds for X-axis
  current: number
  power: number
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("measurements")
  const [currentCurrent, setCurrentCurrent] = useState(0)
  const [currentPower, setCurrentPower] = useState(0)
  const [currentHistory, setCurrentHistory] = useState<MeasurementData[]>([])
  const [powerHistory, setPowerHistory] = useState<MeasurementData[]>([])
  const [relayState, setRelayState] = useState<'on' | 'off'>('off')
  const [relayLoading, setRelayLoading] = useState(false)

  // Fetch real-time data from API
  useEffect(() => {
    const fetchArduinoData = async () => {
      try {
        const response = await fetch('/api/arduino-data?limit=50')
        const result = await response.json()
        
        if (result.success && result.data.length > 0) {
          const latestData = result.data[0]
          
          // Current comes directly from ESP32
          const current = latestData.current || 0
          // Calculate power: Current × 230V (in Watts)
          // We calculate it here to ensure accuracy, even if ESP32 sends power in kW
          const power = current * 230
          
          setCurrentCurrent(current)
          setCurrentPower(power)
          
          // Update history for charts
          // Sort by timestamp to ensure chronological order (newest first from API)
          const sortedData = [...result.data].sort((a: any, b: any) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          })
          
          const historyData: MeasurementData[] = sortedData.map((data: any) => ({
            timestamp: data.timestamp,
            timestampMs: new Date(data.timestamp).getTime(), // Convert to milliseconds for X-axis
            current: data.current || 0,
            power: (data.current || 0) * 230 // Calculate power from current: I × 230V (in Watts)
          }))
          
          setCurrentHistory(historyData)
          setPowerHistory(historyData)
        }
      } catch (error) {
        console.error('Error fetching Arduino data:', error)
      }
    }

    // Fetch data immediately
    fetchArduinoData()
    
    // Then fetch every 5 seconds (matching ESP32 update rate)
    const interval = setInterval(fetchArduinoData, 5000)

    return () => clearInterval(interval)
  }, [])

  // Fetch relay state periodically
  useEffect(() => {
    const fetchRelayState = async () => {
      try {
        const response = await fetch('/api/relay-control')
        const result = await response.json()
        console.log('Relay state from API:', result)
        if (result.status) {
          setRelayState(result.status)
        }
      } catch (error) {
        console.error('Error fetching relay state:', error)
      }
    }

    // Fetch immediately on mount
    fetchRelayState()
    const interval = setInterval(fetchRelayState, 2000) // Check every 2 seconds
    return () => clearInterval(interval)
  }, [])

  // Control relay function
  const controlRelay = async (command: 'on' | 'off') => {
    console.log('Control relay called with command:', command)
    console.log('Current relay state:', relayState)
    console.log('Current relay loading:', relayLoading)
    
    setRelayLoading(true)
    try {
      console.log('Sending POST request to /api/relay-control with command:', command)
      const response = await fetch('/api/relay-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      })
      const result = await response.json()
      console.log('Response from API:', result)
      
      if (result.success) {
        console.log('Relay command sent successfully:', command)
        // Immediately update local state optimistically
        setRelayState(command)
        // State will be confirmed by the periodic fetch
      } else {
        console.error('Failed to send relay command:', result.error)
      }
    } catch (error) {
      console.error('Error controlling relay:', error)
    } finally {
      console.log('Setting relayLoading to false')
      setRelayLoading(false)
    }
  }

  // Format timestamp for chart - show seconds
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // Format time for X-axis display
  const formatTimeForAxis = (timestamp: string) => {
    const date = new Date(timestamp)
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
  }

  // Get formatted ticks for X-axis from data (every 5 seconds)
  const getFormattedTicks = (data: MeasurementData[]) => {
    if (data.length === 0) return []
    
    const tickValues: number[] = []
    
    // Show first, last, and every 5th point to avoid overcrowding
    for (let i = 0; i < data.length; i++) {
      if (i === 0 || i === data.length - 1 || i % 5 === 0) {
        tickValues.push(data[i].timestampMs)
      }
    }
    
    return tickValues
  }

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
              variant={activeTab === "measurements" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("measurements")}
            >
              <Monitor className="mr-3 h-5 w-5" />
              Measurements
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

      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {activeTab === "measurements" && "Measurements"}
              {activeTab === "prices" && "REE Electricity Prices"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeTab === "measurements" && "Real-time current and power monitoring"}
              {activeTab === "prices" && "Spanish electricity market prices from REE"}
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "measurements" && (
            <div className="space-y-6">
              {/* Current and Power Cards at the top */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="smart-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Current</span>
                      <Badge variant="secondary" className="text-xs">
                        Live
                      </Badge>
                    </div>
                    <div className="text-4xl font-bold text-primary mb-1">{currentCurrent.toFixed(4)} A</div>
                    <div className="text-sm text-muted-foreground">
                    </div>
                  </CardContent>
                </Card>

                <Card className="smart-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Power</span>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-4xl font-bold text-foreground mb-1">{currentPower.toFixed(2)} W</div>
                    <div className="text-sm text-muted-foreground">
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Relay Control Card */}
              <Card className="smart-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Power className="h-6 w-6 text-primary mr-3" />
                    Smart Plug Control
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Status</div>
                          <Badge 
                            variant={relayState === 'on' ? 'default' : 'secondary'}
                            className="text-base px-3 py-1"
                          >
                            {relayState === 'on' ? 'ON' : 'OFF'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={() => controlRelay('on')}
                          disabled={relayLoading || relayState === 'on'}
                          variant={relayState === 'on' ? 'default' : 'outline'}
                          className="min-w-[100px]"
                        >
                          {relayLoading && relayState === 'off' ? 'Loading...' : 'Turn ON'}
                        </Button>
                        <Button
                          onClick={() => {
                            console.log('Turn OFF button clicked')
                            console.log('relayLoading:', relayLoading)
                            console.log('relayState:', relayState)
                            controlRelay('off')
                          }}
                          disabled={relayLoading}
                          variant={relayState === 'off' ? 'secondary' : 'destructive'}
                          className="min-w-[100px]"
                        >
                          {relayLoading ? 'Loading...' : 'Turn OFF'}
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                      <p>💡 Se o relay estiver ligado mas o status mostrar OFF, clica em "Turn OFF" para sincronizar.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts side by side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Current Chart */}
                <Card className="smart-card">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="h-6 w-6 text-primary mr-3" />
                      Current (A) 
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentHistory.length > 0 ? (
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={currentHistory}
                            key={currentHistory.length} // Force re-render when data changes
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="timestampMs" 
                              type="number"
                              scale="time"
                              domain={['dataMin', 'dataMax']}
                              tickFormatter={(value: number) => {
                                // Value is milliseconds, convert to date
                                try {
                                  const date = new Date(value)
                                  if (isNaN(date.getTime())) return ''
                                  return formatTimeForAxis(date.toISOString())
                                } catch {
                                  return ''
                                }
                              }}
                              ticks={getFormattedTicks(currentHistory)}
                              tick={{ fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis 
                              label={{ value: 'Current (A)', angle: -90, position: 'insideLeft' }}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip 
                              labelFormatter={(value) => `Time: ${formatTime(value)}`}
                              formatter={(value: number) => [`${value.toFixed(4)} A`, 'Current']}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="current" 
                              stroke="#8b5cf6" 
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-80 flex items-center justify-center text-muted-foreground">
                        No data available. Waiting for ESP32 data...
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Power Chart */}
                <Card className="smart-card">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="h-6 w-6 text-primary mr-3" />
                      Power (W)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {powerHistory.length > 0 ? (
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={powerHistory}
                            key={powerHistory.length} // Force re-render when data changes
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="timestampMs" 
                              type="number"
                              scale="time"
                              domain={['dataMin', 'dataMax']}
                              tickFormatter={(value: number) => {
                                // Value is milliseconds, convert to date
                                try {
                                  const date = new Date(value)
                                  if (isNaN(date.getTime())) return ''
                                  return formatTimeForAxis(date.toISOString())
                                } catch {
                                  return ''
                                }
                              }}
                              ticks={getFormattedTicks(powerHistory)}
                              tick={{ fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis 
                              label={{ value: 'Power (W)', angle: -90, position: 'insideLeft' }}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip 
                              labelFormatter={(value) => `Time: ${formatTime(value)}`}
                              formatter={(value: number) => [`${value.toFixed(2)} W`, 'Power']}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="power" 
                              stroke="#a78bfa" 
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-80 flex items-center justify-center text-muted-foreground">
                        No data available. Waiting for ESP32 data...
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "prices" && <ElectricityPricesTab />}
        </div>
      </main>
    </div>
  )
}
