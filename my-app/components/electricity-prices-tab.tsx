"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Zap, Euro, Calendar, Clock } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"

interface ElectricityPrice {
  hour: number
  price: number
  date: string
  period: "valle" | "llano" | "punta"
}

export function ElectricityPricesTab() {
  const [prices, setPrices] = useState<ElectricityPrice[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(true)
  const [dataSource, setDataSource] = useState<'ree' | 'fallback'>('fallback')
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [error, setError] = useState<string>('')

  // Fetch real data from API
  const fetchElectricityPrices = async (date: string) => {
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/electricity-prices?date=${date}`)
      const result = await response.json()
      
      if (result.success) {
        setPrices(result.data)
        setDataSource(result.source)
        setLastUpdate(result.lastUpdate || '')
        if (result.message) {
          console.log('API Response:', result.message)
        }
      } else {
        throw new Error(result.message || 'Failed to fetch data')
      }
    } catch (err) {
      console.error('Error fetching electricity prices:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Fallback to simulated data
      setPrices(generateFallbackPrices(date))
      setDataSource('fallback')
    } finally {
      setIsLoading(false)
    }
  }

  // Generate fallback data
  const generateFallbackPrices = (date: string): ElectricityPrice[] => {
    const mockPrices: ElectricityPrice[] = []
    
    for (let hour = 0; hour < 24; hour++) {
      let basePrice = 0.12 // Base price in €/kWh
      
      // Simulate variations by time of day
      if (hour >= 0 && hour < 8) {
        // Valley period (early morning)
        basePrice = 0.08 + Math.random() * 0.02
      } else if (hour >= 8 && hour < 10) {
        // Flat period (morning)
        basePrice = 0.15 + Math.random() * 0.03
      } else if (hour >= 10 && hour < 14) {
        // Peak period (midday)
        basePrice = 0.25 + Math.random() * 0.05
      } else if (hour >= 14 && hour < 18) {
        // Flat period (afternoon)
        basePrice = 0.18 + Math.random() * 0.04
      } else if (hour >= 18 && hour < 22) {
        // Peak period (evening)
        basePrice = 0.28 + Math.random() * 0.06
      } else {
        // Flat period (late night)
        basePrice = 0.16 + Math.random() * 0.03
      }
      
      // Add random variation
      basePrice += (Math.random() - 0.5) * 0.02
      basePrice = Math.max(0.05, Math.min(0.35, basePrice)) // Limit between 0.05 and 0.35
      
      let period: "valle" | "llano" | "punta" = "llano"
      if (hour >= 0 && hour < 8) period = "valle"
      else if (hour >= 10 && hour < 14 || hour >= 18 && hour < 22) period = "punta"
      
      mockPrices.push({
        hour,
        price: Math.round(basePrice * 1000) / 1000,
        date,
        period,
      })
    }
    
    return mockPrices
  }

  useEffect(() => {
    fetchElectricityPrices(selectedDate)
  }, [selectedDate])

  // Helper functions
  const formatPrice = (price: number) => `€${price.toFixed(3)}/kWh`
  const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`
  const getPeriodName = (period: string) => {
    switch (period) {
      case 'valle': return 'Valley'
      case 'punta': return 'Peak'
      case 'llano': return 'Flat'
      default: return 'Unknown'
    }
  }

  // Functions for Spain
  const getCurrentPrice = () => {
    const currentHour = new Date().getHours()
    return prices.find(p => p.hour === currentHour)?.price || 0
  }

  const getAveragePrice = () => {
    return prices.length > 0 ? prices.reduce((sum, p) => sum + p.price, 0) / prices.length : 0
  }

  const getMinMaxPrices = () => {
    if (prices.length === 0) return { min: 0, max: 0 }
    const sortedPrices = [...prices].sort((a, b) => a.price - b.price)
    return { min: sortedPrices[0].price, max: sortedPrices[sortedPrices.length - 1].price }
  }

  const currentPrice = getCurrentPrice()
  const averagePrice = getAveragePrice()
  const { min, max } = getMinMaxPrices()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Spanish Electricity Prices (REE)</h2>
          <div className="flex items-center gap-2 mt-2">
            <Badge 
              variant={dataSource === 'ree' ? 'default' : 'secondary'}
              className={dataSource === 'ree' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
            >
              {dataSource === 'ree' ? 'Real REE Data' : 'Simulated Data'}
            </Badge>
            {lastUpdate && (
              <span className="text-sm text-muted-foreground">
                Updated: {new Date(lastUpdate).toLocaleTimeString('en-US')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="smart-input"
          />
          <Button 
            onClick={() => fetchElectricityPrices(selectedDate)}
            disabled={isLoading}
            className="smart-button"
          >
            {isLoading ? 'Loading...' : 'Update'}
          </Button>
        </div>
      </div>

      <Card className="smart-card">
        <CardContent className="p-6">
          <CardDescription className="mb-4">
            {dataSource === 'ree' 
              ? 'Real-time prices from the Spanish electricity market (REE)' 
              : 'Simulated prices for demonstration purposes'
            }
          </CardDescription>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">Error: {error}</p>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="smart-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5 text-primary mr-2" />
                  <span className="text-sm font-medium text-muted-foreground">Current Price</span>
                </div>
                <div className="text-2xl font-bold">{formatPrice(currentPrice)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatHour(new Date().getHours())} - {getPeriodName(prices.find(p => p.hour === new Date().getHours())?.period || "llano")}
                </div>
              </CardContent>
            </Card>

            <Card className="smart-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5 text-primary mr-2" />
                  <span className="text-sm font-medium text-muted-foreground">Average Price</span>
                </div>
                <div className="text-2xl font-bold">{formatPrice(averagePrice)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Daily average
                </div>
              </CardContent>
            </Card>

            <Card className="smart-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingDown className="h-5 w-5 text-green-600 mr-2" />
                  <span className="text-sm font-medium text-muted-foreground">Lowest Price</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{formatPrice(min)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatHour(prices.find(p => p.price === min)?.hour || 0)}
                </div>
              </CardContent>
            </Card>

            <Card className="smart-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5 text-red-600 mr-2" />
                  <span className="text-sm font-medium text-muted-foreground">Highest Price</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{formatPrice(max)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatHour(prices.find(p => p.price === max)?.hour || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Price Chart */}
          <Card className="smart-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Euro className="h-5 w-5 text-primary mr-2" />
                Spanish Price Evolution - {new Date(selectedDate).toLocaleDateString('en-US')}
              </CardTitle>
              <CardDescription>
                Hourly prices from the Spanish electricity market (REE)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading Spanish prices...</p>
                  </div>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={prices}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="hour" 
                        tickFormatter={formatHour}
                        domain={[0, 23]}
                      />
                      <YAxis 
                        tickFormatter={(value) => `€${value.toFixed(2)}`}
                      />
                      <Tooltip 
                        labelFormatter={(hour) => `${formatHour(hour)}`}
                        formatter={(value: number) => [formatPrice(value), 'Price']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#3b82f6" 
                        fill="#3b82f6" 
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}