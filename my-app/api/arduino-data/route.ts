import { NextRequest, NextResponse } from 'next/server'

interface ArduinoData {
  power: number
  current: number
  voltage: number
  vibration?: number
  frequency?: number
  timestamp: string
}

// Store recent readings in memory (in production, use a database)
let recentReadings: ArduinoData[] = []

export async function POST(request: NextRequest) {
  try {
    const data: ArduinoData = await request.json()
    
    // Validate the data
    if (typeof data.power !== 'number' || 
        typeof data.current !== 'number' || 
        typeof data.voltage !== 'number') {
      return NextResponse.json({
        success: false,
        message: 'Invalid data format. Expected power, current, and voltage as numbers.'
      }, { status: 400 })
    }
    
    // Add timestamp if not provided
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString()
    }
    
    // Add to recent readings (keep last 100 readings)
    recentReadings.unshift(data)
    if (recentReadings.length > 100) {
      recentReadings = recentReadings.slice(0, 100)
    }
    
    console.log('Received Arduino data:', data)
    
    return NextResponse.json({
      success: true,
      message: 'Data received successfully',
      timestamp: data.timestamp
    })
    
  } catch (error) {
    console.error('Error processing Arduino data:', error)
    return NextResponse.json({
      success: false,
      message: 'Error processing data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '24')
    
    // Return recent readings
    const readings = recentReadings.slice(0, limit)
    
    return NextResponse.json({
      success: true,
      data: readings,
      count: readings.length,
      message: 'Recent readings retrieved successfully'
    })
    
  } catch (error) {
    console.error('Error retrieving readings:', error)
    return NextResponse.json({
      success: false,
      message: 'Error retrieving data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
