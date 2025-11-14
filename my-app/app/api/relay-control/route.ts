import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for relay state and pending commands
// In production, use a database or Redis
let relayState: 'on' | 'off' = 'off';
let pendingCommand: 'on' | 'off' | null = null;

// GET: Check for pending relay commands (ESP32 polls this)
export async function GET() {
  console.log('[Relay API] GET - Current state:', relayState, 'Pending command:', pendingCommand);
  
  // Return pending command if exists, otherwise return null
  const response = {
    command: pendingCommand,
    status: relayState
  };
  
  // Clear pending command after it's been read
  if (pendingCommand !== null) {
    pendingCommand = null;
  }
  
  return NextResponse.json(response);
}

// POST: Set relay command or update status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Relay API] POST - Received:', body);
    
    // If ESP32 is sending status update
    if (body.status) {
      relayState = body.status === 'on' ? 'on' : 'off';
      console.log('[Relay API] Status updated to:', relayState);
      return NextResponse.json({ 
        success: true, 
        status: relayState,
        message: `Relay status updated to ${relayState}` 
      });
    }
    
    // If dashboard is sending command
    if (body.command) {
      const command = body.command === 'on' ? 'on' : 'off';
      pendingCommand = command;
      console.log('[Relay API] Command queued:', command);
      return NextResponse.json({ 
        success: true, 
        command: command,
        message: `Relay command queued: ${command}` 
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Relay API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }
}

