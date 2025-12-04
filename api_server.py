"""
Flask API Server for Smart Meter
Provides REST endpoints for ESP32 communication and Next.js dashboard
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import random
import requests
from typing import List, Dict, Optional

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# In-memory storage
recent_readings: List[Dict] = []
relay_state: str = 'off'
pending_command: Optional[str] = None
command_timestamp: Optional[datetime] = None
COMMAND_TIMEOUT_SECONDS = 30  # Command expires after 30 seconds if not confirmed

# Standard voltage for power calculation
STANDARD_VOLTAGE = 230.0

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'API server is running',
        'readings_count': len(recent_readings),
        'relay_state': relay_state
    })

@app.route('/api/arduino-data', methods=['POST'])
def post_arduino_data():
    """Receive data from ESP32"""
    try:
        data = request.json
        print(f'[API] POST /api/arduino-data - Received: {data}')
        
        # Validate data
        if 'current' not in data or not isinstance(data['current'], (int, float)):
            return jsonify({
                'success': False,
                'message': 'Invalid data format. Expected current as a number.'
            }), 400
        
        # Use server timestamp
        timestamp = datetime.now().isoformat()
        
        # Calculate power
        power_kw = (data['current'] * STANDARD_VOLTAGE) / 1000.0
        
        # Add to cache
        cache_data = {
            **data,
            'power': power_kw,
            'timestamp': timestamp
        }
        recent_readings.insert(0, cache_data)
        
        # Keep last 100 readings
        if len(recent_readings) > 100:
            recent_readings[:] = recent_readings[:100]
        
        print(f'[API] ✓ Data stored: current={cache_data["current"]}, power={cache_data["power"]}, total={len(recent_readings)}')
        
        return jsonify({
            'success': True,
            'message': 'Data received successfully',
            'timestamp': timestamp
        })
        
    except Exception as e:
        print(f'[API] ✗ Error: {e}')
        return jsonify({
            'success': False,
            'message': 'Error processing data',
            'error': str(e)
        }), 500

@app.route('/api/arduino-data', methods=['GET'])
def get_arduino_data():
    """Get recent readings"""
    try:
        limit = int(request.args.get('limit', 50))
        user_id = request.args.get('user_id')
        
        # Get readings from cache
        readings = recent_readings[:limit]
        
        # Filter by user_id if provided
        if user_id:
            readings = [r for r in readings if r.get('user_id') == user_id]
        
        print(f'[API] GET /api/arduino-data: Returning {len(readings)} readings (total: {len(recent_readings)})')
        
        return jsonify({
            'success': True,
            'data': readings,
            'count': len(readings),
            'message': 'Recent readings retrieved successfully'
        })
        
    except Exception as e:
        print(f'[API] ✗ Error: {e}')
        return jsonify({
            'success': False,
            'message': 'Error retrieving data',
            'error': str(e)
        }), 500

@app.route('/api/relay-control', methods=['GET'])
def get_relay_control():
    """Check for pending relay commands (ESP32 polls this)"""
    global pending_command, command_timestamp
    
    # Check if command has expired
    if pending_command and command_timestamp:
        if datetime.now() - command_timestamp > timedelta(seconds=COMMAND_TIMEOUT_SECONDS):
            print(f'[Relay API] Command {pending_command} expired (timeout {COMMAND_TIMEOUT_SECONDS}s)')
            pending_command = None
            command_timestamp = None
    
    print(f'[Relay API] GET - Current state: {relay_state}, Pending command: {pending_command}')
    
    response = {
        'command': pending_command,
        'status': relay_state
    }
    
    return jsonify(response)

@app.route('/api/relay-control', methods=['POST'])
def post_relay_control():
    """Set relay command or update status"""
    global relay_state, pending_command, command_timestamp
    
    try:
        body = request.json
        print(f'[Relay API] POST - Received: {body}')
        
        # If ESP32 is sending status update
        if 'status' in body:
            new_status = 'on' if body['status'] == 'on' else 'off'
            old_state = relay_state
            relay_state = new_status
            print(f'[Relay API] Status updated: {old_state} -> {relay_state}')
            
            # Clear pending command if it matches the new status (ESP32 confirmed execution)
            if pending_command == new_status:
                print(f'[Relay API] Command {pending_command} confirmed by ESP32, clearing pending command')
                pending_command = None
                command_timestamp = None
            
            return jsonify({
                'success': True,
                'status': relay_state,
                'message': f'Relay status updated to {relay_state}'
            })
        
        # If dashboard is sending command
        if 'command' in body:
            command = 'on' if body['command'] == 'on' else 'off'
            pending_command = command
            command_timestamp = datetime.now()
            relay_state = command  # Update immediately for dashboard
            print(f'[Relay API] Command queued: {command} (will expire in {COMMAND_TIMEOUT_SECONDS}s if not confirmed)')
            return jsonify({
                'success': True,
                'command': command,
                'status': relay_state,
                'message': f'Relay command queued: {command}'
            })
        
        return jsonify({
            'success': False,
            'error': 'Invalid request body'
        }), 400
        
    except Exception as e:
        print(f'[Relay API] POST error: {e}')
        return jsonify({
            'success': False,
            'error': 'Invalid JSON'
        }), 400

@app.route('/api/electricity-prices', methods=['GET'])
def get_electricity_prices():
    """Get Spanish electricity prices (REE API or simulated)"""
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        # Try to fetch real data from REE API
        start_date = f"{date}T00:00"
        end_date = f"{date}T23:59"
        
        ree_api_url = f"https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date={start_date}&end_date={end_date}&time_trunc=hour&geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741"
        
        print(f'[API] Fetching REE data for date: {date}')
        
        response = requests.get(ree_api_url, headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Host': 'apidatos.ree.es'
        }, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f'[API] REE API response received')
            
            # Process REE data
            processed_prices = []
            
            if data.get('included') and len(data['included']) > 0:
                # Find the price indicator in the response
                price_indicator = None
                for indicator in data['included']:
                    attrs = indicator.get('attributes', {})
                    title = attrs.get('title', '').lower()
                    magnitude = attrs.get('magnitude', '').lower()
                    
                    # Look for PVPC or price-related indicators
                    if ('pvpc' in title or 
                        'precio' in title or 
                        'price' in title or
                        '€/mwh' in magnitude or
                        'euro' in magnitude or
                        'mwh' in magnitude):
                        price_indicator = indicator
                        break
                
                if price_indicator and price_indicator.get('attributes', {}).get('values'):
                    values = price_indicator['attributes']['values']
                    
                    for value_data in values:
                        datetime_str = value_data.get('datetime')
                        price_value = value_data.get('value', 0)
                        
                        if datetime_str and price_value:
                            dt = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
                            hour = dt.hour
                            
                            # Convert from €/MWh to €/kWh
                            price_per_kwh = price_value / 1000.0
                            
                            # Determine period
                            period = "llano"
                            if hour >= 0 and hour < 8:
                                period = "valle"
                            elif (hour >= 10 and hour < 14) or (hour >= 18 and hour < 22):
                                period = "punta"
                            
                            processed_prices.append({
                                'hour': hour,
                                'price': round(price_per_kwh * 1000) / 1000,
                                'date': date,
                                'period': period,
                                'datetime': datetime_str
                            })
            
            if processed_prices:
                # Sort by hour
                processed_prices.sort(key=lambda x: x['hour'])
                print(f'[API] ✓ Processed {len(processed_prices)} price points from REE')
                
                return jsonify({
                    'success': True,
                    'source': 'ree',
                    'data': processed_prices,
                    'lastUpdate': data.get('data', {}).get('attributes', {}).get('last-update', datetime.now().isoformat()),
                    'message': 'Data retrieved from REE API'
                })
            else:
                raise Exception('No price data found in REE response')
        else:
            raise Exception(f"REE API error: {response.status_code}")
        
    except Exception as e:
        print(f'[API] ✗ Error fetching REE prices: {e}')
        print(f'[API] Falling back to simulated data')
        
        # Fallback to simulated data
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        return jsonify({
            'success': True,
            'source': 'fallback',
            'data': generate_fallback_prices(date),
            'message': 'Using simulated data due to API error',
            'error': str(e)
        })

def generate_fallback_prices(date: str) -> List[Dict]:
    """Generate simulated electricity prices"""
    mock_prices = []
    
    for hour in range(24):
        base_price = 0.12  # Base price in €/kWh
        
        # Simulate variations by time of day
        if hour >= 0 and hour < 8:
            # Valle (low) period
            variation = random.uniform(-0.03, 0.01)
            period = "valle"
        elif (hour >= 10 and hour < 14) or (hour >= 18 and hour < 22):
            # Punta (peak) period
            variation = random.uniform(0.02, 0.06)
            period = "punta"
        else:
            # Llano (flat) period
            variation = random.uniform(-0.01, 0.02)
            period = "llano"
        
        price = round((base_price + variation) * 1000) / 1000
        
        mock_prices.append({
            'hour': hour,
            'price': price,
            'date': date,
            'period': period,
            'datetime': f"{date}T{hour:02d}:00:00"
        })
    
    return mock_prices

if __name__ == '__main__':
    print("=" * 50)
    print("Smart Meter Flask API Server")
    print("=" * 50)
    print("Starting server on http://localhost:5000")
    print("Endpoints:")
    print("  - POST /api/arduino-data (ESP32 sends data)")
    print("  - GET  /api/arduino-data (Dashboard gets data)")
    print("  - GET  /api/relay-control (ESP32 checks commands)")
    print("  - POST /api/relay-control (Dashboard/ESP32 controls relay)")
    print("  - GET  /api/electricity-prices (Dashboard gets REE prices)")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)

