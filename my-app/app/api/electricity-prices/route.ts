import { NextRequest, NextResponse } from 'next/server'

interface REEResponse {
  data: {
    type: string
    id: string
    attributes: {
      title: string
      'last-update': string
      description: string
    }
  }
  included: Array<{
    type: string
    id: string
    attributes: {
      title: string
      description: string
      color: string
      type: string
      magnitude: string
      values: Array<{
        value: number
        percentage: number
        datetime: string
      }>
    }
  }>
}

interface ElectricityPrice {
  hour: number
  price: number
  date: string
  period: "valle" | "llano" | "punta"
  datetime: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    
    // For now, always return simulated data to avoid API issues
    // You can uncomment the REE API code below if you want to try real data
    
    console.log('Using simulated data for date:', date)
    
    return NextResponse.json({
      success: true,
      source: 'simulated',
      data: generateFallbackPrices(date),
      lastUpdate: new Date().toISOString(),
      message: 'Using simulated Spanish electricity prices'
    })
    
    /* 
    // Uncomment this section to try real REE API data
    const startDate = `${date}T00:00`
    const endDate = `${date}T23:59`
    
    const reeApiUrl = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${startDate}&end_date=${endDate}&time_trunc=hour&geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741`
    
    console.log('Fetching data from REE API:', reeApiUrl)
    
    const response = await fetch(reeApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Host': 'apidatos.ree.es'
      },
      next: { revalidate: 300 }
    })

    if (!response.ok) {
      throw new Error(`REE API error: ${response.status}`)
    }

    const data: REEResponse = await response.json()
    
    const processedPrices: ElectricityPrice[] = []
    
    if (data.included && data.included.length > 0) {
      const priceIndicator = data.included.find(indicator => 
        indicator.attributes.title === 'PVPC' ||
        indicator.attributes.magnitude === 'price' ||
        indicator.attributes.title.toLowerCase().includes('precio') ||
        indicator.attributes.title.toLowerCase().includes('price') ||
        indicator.attributes.magnitude.toLowerCase().includes('€/mwh') ||
        indicator.attributes.magnitude.toLowerCase().includes('euro') ||
        indicator.attributes.magnitude.toLowerCase().includes('mwh')
      )
      
      if (priceIndicator && priceIndicator.attributes.values) {
        priceIndicator.attributes.values.forEach((value, index) => {
          const datetime = new Date(value.datetime)
          const hour = datetime.getHours()
          
          const pricePerKwh = value.value / 1000
          
          let period: "valle" | "llano" | "punta" = "llano"
          if (hour >= 0 && hour < 8) {
            period = "valle"
          } else if (hour >= 10 && hour < 14 || hour >= 18 && hour < 22) {
            period = "punta"
          }
          
          processedPrices.push({
            hour,
            price: Math.round(pricePerKwh * 1000) / 1000,
            date,
            period,
            datetime: value.datetime
          })
        })
      }
    }
    
    if (processedPrices.length === 0) {
      throw new Error('No price data found in REE response')
    }
    
    processedPrices.sort((a, b) => a.hour - b.hour)
    
    return NextResponse.json({
      success: true,
      source: 'ree',
      data: processedPrices,
      lastUpdate: data.data.attributes['last-update'],
      message: 'Data retrieved from REE API'
    })
    */
    
  } catch (error) {
    console.error('Error fetching electricity prices:', error)
    
    const fallbackDate = new URL(request.url).searchParams.get('date') || new Date().toISOString().split('T')[0]
    
    return NextResponse.json({
      success: true,
      source: 'fallback',
      data: generateFallbackPrices(fallbackDate),
      message: 'Using simulated data due to API error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Function to generate simulated data as fallback
function generateFallbackPrices(date: string): ElectricityPrice[] {
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
      datetime: `${date}T${hour.toString().padStart(2, '0')}:00:00.000+01:00`
    })
  }
  
  return mockPrices
}
