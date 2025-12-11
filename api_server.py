"""
Flask API Server for Smart Meter
Provides REST endpoints for ESP32 communication and Next.js dashboard
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
import random
import requests
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Supabase configuration (optional)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
supabase_client = None

# Initialize Supabase client if credentials are provided
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client, Client
        supabase_client: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f'[Supabase] ✓ Connected to Supabase: {SUPABASE_URL}')
    except ImportError:
        print('[Supabase] ⚠ Supabase library not installed. Run: pip install supabase')
        supabase_client = None
    except Exception as e:
        print(f'[Supabase] ✗ Error connecting to Supabase: {e}')
        supabase_client = None
else:
    print('[Supabase] ⚠ Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY in .env file')
    print('[Supabase] Data will be stored in memory only (not persisted)')

# In-memory storage (used as cache and fallback)
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
        
        # Use server timestamp in UTC
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Calculate power
        power_kw = (data['current'] * STANDARD_VOLTAGE) / 1000.0
        
        # Get vibration value (default to 0 if not provided)
        vibration = data.get('vibration', 0.0)
        if not isinstance(vibration, (int, float)):
            vibration = 0.0
        
        # Calculate power in Watts (not kW for storage)
        power_watts = data['current'] * STANDARD_VOLTAGE
        
        # Prepare data for storage
        cache_data = {
            **data,
            'vibration': vibration,
            'power': power_kw,  # Keep kW for API response
            'timestamp': timestamp
        }
        recent_readings.insert(0, cache_data)
        
        # Keep last 100 readings in memory cache
        if len(recent_readings) > 100:
            recent_readings[:] = recent_readings[:100]
        
        # Save to Supabase if configured
        if supabase_client:
            try:
                supabase_data = {
                    'timestamp': timestamp,
                    'current': float(data['current']),
                    'power': float(power_watts),  # Store in Watts
                    'vibration': float(vibration)
                }
                # Get equipment from request if provided (for frontend tracking)
                equipment = data.get('equipment')
                
                # If equipment not provided in request, check for active measurement
                if not equipment:
                    try:
                        active_measurement = supabase_client.table('measurements')\
                            .select('equipment, start_time')\
                            .eq('is_active', True)\
                            .order('start_time', desc=True)\
                            .limit(1)\
                            .execute()
                        
                        print(f'[API] Checking for active measurement: found {len(active_measurement.data) if active_measurement.data else 0} active measurement(s)')
                        
                        if active_measurement.data and len(active_measurement.data) > 0:
                            measurement = active_measurement.data[0]
                            measurement_start_str = measurement['start_time']
                            measurement_equipment = measurement.get('equipment')
                            
                            print(f'[API] Found active measurement: equipment={measurement_equipment}, start_time={measurement_start_str}')
                            
                            # Parse timestamps - keep both in UTC for comparison
                            try:
                                # Parse measurement start time (keep UTC)
                                if isinstance(measurement_start_str, str):
                                    if 'Z' in measurement_start_str:
                                        measurement_start = datetime.fromisoformat(measurement_start_str.replace('Z', '+00:00'))
                                    elif '+' in measurement_start_str:
                                        measurement_start = datetime.fromisoformat(measurement_start_str)
                                    else:
                                        # No timezone, assume UTC
                                        measurement_start = datetime.fromisoformat(measurement_start_str).replace(tzinfo=timezone.utc)
                                else:
                                    # Already a datetime object
                                    measurement_start = measurement_start_str
                                    if measurement_start.tzinfo is None:
                                        measurement_start = measurement_start.replace(tzinfo=timezone.utc)
                                    else:
                                        # Convert to UTC
                                        measurement_start = measurement_start.astimezone(timezone.utc)
                                
                                # Parse current timestamp (now in UTC from datetime.now(timezone.utc))
                                if 'Z' in timestamp:
                                    current_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                                elif '+' in timestamp:
                                    current_time = datetime.fromisoformat(timestamp)
                                else:
                                    # No timezone, assume UTC
                                    current_time = datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc)
                                
                                # Ensure both are in UTC
                                if current_time.tzinfo is None:
                                    current_time = current_time.replace(tzinfo=timezone.utc)
                                else:
                                    current_time = current_time.astimezone(timezone.utc)
                                
                                if measurement_start.tzinfo is None:
                                    measurement_start = measurement_start.replace(tzinfo=timezone.utc)
                                else:
                                    measurement_start = measurement_start.astimezone(timezone.utc)
                                
                                # Use equipment if current timestamp is after or equal to measurement start
                                # Add buffer (5 seconds) to account for timing differences between frontend and backend
                                time_diff = (current_time - measurement_start).total_seconds()
                                print(f'[API] Time comparison (UTC): current={current_time.isoformat()}, measurement_start={measurement_start.isoformat()}, diff={time_diff:.2f}s')
                                
                                # If measurement is active and current time is after start (with buffer), assign equipment
                                # This ensures all new readings get the equipment label
                                if time_diff >= -5:  # Allow 5 second buffer for timing differences
                                    if measurement_equipment:
                                        equipment = measurement_equipment
                                        supabase_data['equipment'] = equipment
                                        print(f'[API] ✓ Auto-assigned equipment: {equipment} (measurement started at {measurement_start_str}, current: {timestamp}, diff: {time_diff:.2f}s)')
                                    else:
                                        print(f'[API] ⚠ Active measurement found but equipment is NULL')
                                else:
                                    print(f'[API] ⚠ Current time ({current_time}) is before measurement start ({measurement_start}), not assigning equipment (diff: {time_diff:.2f}s)')
                            except Exception as parse_error:
                                print(f'[Supabase] ✗ Error parsing timestamps: {parse_error}, measurement_start_str={measurement_start_str}, timestamp={timestamp}')
                                import traceback
                                traceback.print_exc()
                        else:
                            print(f'[API] No active measurement found - new readings will have equipment=NULL')
                    except Exception as e:
                        print(f'[Supabase] ✗ Error checking active measurement: {e}')
                        import traceback
                        traceback.print_exc()
                elif equipment:
                    supabase_data['equipment'] = equipment
                
                result = supabase_client.table('power_readings').insert(supabase_data).execute()
                print(f'[Supabase] ✓ Saved to database: id={result.data[0]["id"] if result.data else "unknown"}')
            except Exception as e:
                print(f'[Supabase] ✗ Error saving to database: {e}')
        
        print(f'[API] ✓ Data stored: current={cache_data["current"]}, vibration={cache_data["vibration"]}, power={cache_data["power"]}, total={len(recent_readings)}')
        
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

@app.route('/api/power-readings', methods=['GET'])
def get_power_readings():
    """Get power readings filtered by equipment and time range"""
    try:
        equipment = request.args.get('equipment')
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        limit = int(request.args.get('limit', 10000))
        
        if not supabase_client:
            return jsonify({
                'success': False,
                'message': 'Supabase not configured'
            }), 500
        
        if not equipment or not start_time or not end_time:
            return jsonify({
                'success': False,
                'message': 'equipment, start_time, and end_time are required'
            }), 400
        
        # Query Supabase for readings in the time range with the equipment
        print(f'[API] Querying power_readings: equipment="{equipment}", start_time="{start_time}", end_time="{end_time}"')
        print(f'[API] Parameter types: equipment={type(equipment)}, start_time={type(start_time)}, end_time={type(end_time)}')
        
        # Normalize timestamps - Supabase accepts ISO format strings
        # BD format: "2025-12-08 14:49:29.286994+00"
        # Frontend may send: "2025-12-08T14:49:33.000Z" or "2025-12-08T14:49:33Z"
        try:
            from datetime import datetime as dt
            
            def normalize_timestamp(ts):
                if isinstance(ts, str):
                    # If already in PostgreSQL format (space between date and time), use as-is
                    if ' ' in ts and ('+' in ts or ts.endswith('Z')):
                        # Already in correct format or close to it
                        return ts.replace('Z', '+00:00')
                    
                    # Try to parse ISO format (with T) and convert to PostgreSQL format
                    try:
                        # Handle both 'Z' and '+00:00' timezone formats
                        ts_clean = ts.replace('Z', '+00:00')
                        # Parse the ISO format
                        if 'T' in ts_clean:
                            parsed = dt.fromisoformat(ts_clean)
                        else:
                            # Already in PostgreSQL format
                            return ts_clean
                        
                        # Format as PostgreSQL TIMESTAMPTZ: "YYYY-MM-DD HH:MM:SS.microseconds+00:00"
                        # Supabase accepts ISO format, so we can use isoformat() but replace T with space
                        iso_str = parsed.isoformat()
                        if '+' not in iso_str:
                            iso_str += '+00:00'
                        # Replace T with space to match PostgreSQL format
                        return iso_str.replace('T', ' ')
                    except Exception as parse_err:
                        print(f'[API] ⚠ Could not parse timestamp "{ts}": {parse_err}')
                        return ts
                elif hasattr(ts, 'isoformat'):
                    # Datetime object - convert to string
                    iso_str = ts.isoformat()
                    if '+' not in iso_str and 'Z' not in iso_str:
                        iso_str += '+00:00'
                    # Replace T with space for PostgreSQL format
                    return iso_str.replace('Z', '+00:00').replace('T', ' ')
                else:
                    return str(ts)
            
            start_time_iso = normalize_timestamp(start_time)
            end_time_iso = normalize_timestamp(end_time)
            
            # Convert to ISO format (with T) for Supabase queries
            # Supabase Python client prefers ISO format
            def to_iso_format(ts_str):
                if isinstance(ts_str, str):
                    # If it has a space, replace with T for ISO format
                    if ' ' in ts_str and 'T' not in ts_str:
                        return ts_str.replace(' ', 'T', 1)
                return ts_str
            
            start_time_iso_query = to_iso_format(start_time_iso)
            end_time_iso_query = to_iso_format(end_time_iso)
            
            print(f'[API] Normalized timestamps: start_time="{start_time_iso}", end_time="{end_time_iso}"')
            print(f'[API] Query format timestamps: start_time="{start_time_iso_query}", end_time="{end_time_iso_query}"')
        except Exception as ts_error:
            print(f'[API] ⚠ Error normalizing timestamps: {ts_error}, using original values')
            import traceback
            traceback.print_exc()
            start_time_iso = start_time
            end_time_iso = end_time
            # Also set query format (try to convert to ISO if possible)
            start_time_iso_query = start_time.replace(' ', 'T', 1) if ' ' in start_time and 'T' not in start_time else start_time
            end_time_iso_query = end_time.replace(' ', 'T', 1) if ' ' in end_time and 'T' not in end_time else end_time
        
        # Query exact time range: start_time to end_time
        print(f'[API] Querying power_readings with exact time range:')
        print(f'[API]   Equipment: "{equipment}"')
        print(f'[API]   Start: {start_time_iso_query}')
        print(f'[API]   End: {end_time_iso_query}')
        
        query = supabase_client.table('power_readings')\
            .select('*')\
            .eq('equipment', equipment)\
            .gte('timestamp', start_time_iso_query)\
            .lte('timestamp', end_time_iso_query)\
            .order('timestamp', desc=False)\
            .limit(limit)
        
        result = query.execute()
        
        readings = []
        if result.data and len(result.data) > 0:
            print(f'[API] ✓ Found {len(result.data)} readings in exact time range')
            if len(result.data) > 0:
                first_ts = result.data[0].get('timestamp')
                last_ts = result.data[-1].get('timestamp')
                print(f'[API]   First reading timestamp: {first_ts}')
                print(f'[API]   Last reading timestamp: {last_ts}')
            for row in result.data:
                # Convert power from Watts to kW for API response
                power_kw = (row.get('power', 0) / 1000.0) if row.get('power') else 0
                readings.append({
                    'id': row.get('id'),
                    'timestamp': row.get('timestamp'),
                    'current': row.get('current', 0),
                    'power': power_kw,
                    'vibration': row.get('vibration', 0),
                    'equipment': row.get('equipment')
                })
        else:
            print(f'[API] ✗ No readings found in exact time range')
            # Debug: check what's in the time range without equipment filter
            debug_query = supabase_client.table('power_readings')\
                .select('id, timestamp, equipment, power')\
                .gte('timestamp', start_time_iso_query)\
                .lte('timestamp', end_time_iso_query)\
                .order('timestamp', desc=False)\
                .limit(10)\
                .execute()
            
            if debug_query.data:
                print(f'[API] ⚠ Found {len(debug_query.data)} readings in time range, but equipment mismatch:')
                for r in debug_query.data[:5]:
                    print(f'[API]   - timestamp: {r.get("timestamp")}, equipment: "{r.get("equipment")}", power: {r.get("power")}')
                
                # Try case-insensitive equipment match
                equipment_clean = equipment.strip().lower()
                matching_rows = [r for r in debug_query.data if r.get('equipment', '').strip().lower() == equipment_clean]
                if matching_rows:
                    print(f'[API] ✓ Found {len(matching_rows)} rows with case-insensitive equipment match')
                    # Re-query with exact equipment value from DB
                    exact_equipment = matching_rows[0].get('equipment')
                    fallback_query = supabase_client.table('power_readings')\
                        .select('*')\
                        .eq('equipment', exact_equipment)\
                        .gte('timestamp', start_time_iso_query)\
                        .lte('timestamp', end_time_iso_query)\
                        .order('timestamp', desc=False)\
                        .limit(limit)\
                        .execute()
                    
                    if fallback_query.data:
                        print(f'[API] ✓ Fallback query found {len(fallback_query.data)} rows with equipment="{exact_equipment}"')
                        for row in fallback_query.data:
                            power_kw = (row.get('power', 0) / 1000.0) if row.get('power') else 0
                            readings.append({
                                'id': row.get('id'),
                                'timestamp': row.get('timestamp'),
                                'current': row.get('current', 0),
                                'power': power_kw,
                                'vibration': row.get('vibration', 0),
                                'equipment': row.get('equipment')
                            })
            else:
                print(f'[API] ✗ No readings found in time range at all')
                # Check if equipment exists with different timestamps
                equipment_check = supabase_client.table('power_readings')\
                    .select('id, timestamp, equipment')\
                    .eq('equipment', equipment)\
                    .order('timestamp', desc=True)\
                    .limit(5)\
                    .execute()
                
                if equipment_check.data:
                    print(f'[API] ⚠ Equipment "{equipment}" exists but with different timestamps:')
                    for r in equipment_check.data:
                        print(f'[API]   - {r.get("timestamp")}')
        
        print(f'[API] Retrieved {len(readings)} power readings for equipment={equipment} from {start_time} to {end_time}')
        
        return jsonify({
            'success': True,
            'data': readings,
            'count': len(readings)
        })
        
    except Exception as e:
        print(f'[API] ✗ Error retrieving power readings: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Error retrieving power readings',
            'error': str(e)
        }), 500

@app.route('/api/arduino-data', methods=['GET'])
def get_arduino_data():
    """Get recent readings"""
    try:
        limit = int(request.args.get('limit', 50))
        user_id = request.args.get('user_id')
        
        # Try to get from Supabase first, fallback to memory cache
        readings = []
        
        if supabase_client:
            try:
                # Query Supabase for recent readings
                query = supabase_client.table('power_readings')\
                    .select('*')\
                    .order('timestamp', desc=True)\
                    .limit(limit)
                
                result = query.execute()
                
                if result.data:
                    # Convert Supabase format to API format
                    readings = []
                    for row in result.data:
                        # Convert power from Watts to kW for API response
                        power_kw = (row.get('power', 0) / 1000.0) if row.get('power') else 0
                        readings.append({
                            'current': row.get('current', 0),
                            'power': power_kw,
                            'vibration': row.get('vibration', 0),
                            'timestamp': row.get('timestamp'),
                            'created_date': row.get('timestamp'),  # Alias for compatibility
                            'equipment': row.get('equipment')  # Include equipment label
                        })
                    print(f'[Supabase] ✓ Retrieved {len(readings)} readings from database')
            except Exception as e:
                print(f'[Supabase] ✗ Error querying database: {e}, falling back to memory cache')
                readings = recent_readings[:limit]
        else:
            # Use memory cache if Supabase not configured
            readings = recent_readings[:limit]
        
        # Filter by user_id if provided (for future multi-user support)
        if user_id:
            readings = [r for r in readings if r.get('user_id') == user_id]
        
        print(f'[API] GET /api/arduino-data: Returning {len(readings)} readings')
        
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

@app.route('/api/update-equipment', methods=['POST'])
def update_equipment():
    """Update equipment label for readings within a time range"""
    try:
        data = request.json
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        equipment = data.get('equipment')  # Can be None to clear equipment
        
        if not start_time:
            return jsonify({
                'success': False,
                'message': 'start_time is required'
            }), 400
        
        # If no Supabase, skip
        if not supabase_client:
            return jsonify({
                'success': True,
                'message': 'Supabase not configured, skipping equipment update'
            })
        
        # Build update query
        # When end_time is None (active measurement), only update records that:
        # 1. Have timestamp >= start_time (after measurement started)
        # 2. Have equipment IS NULL (don't overwrite existing equipment labels)
        # This prevents updating old records that were created before the measurement started
        if end_time is None:
            # Active measurement: only update future records that don't have equipment yet
            query = supabase_client.table('power_readings')\
                .update({'equipment': equipment})\
                .gte('timestamp', start_time)\
                .is_('equipment', 'null')
        else:
            # Completed measurement: update all records in the time range
            query = supabase_client.table('power_readings')\
                .update({'equipment': equipment})\
                .gte('timestamp', start_time)\
                .lte('timestamp', end_time)
        
        result = query.execute()
        updated_count = len(result.data) if result.data else 0
        
        print(f'[API] Updated equipment label: {equipment} for {updated_count} readings from {start_time} to {end_time or "now"}')
        
        return jsonify({
            'success': True,
            'message': f'Updated {updated_count} readings',
            'updated_count': updated_count
        })
        
    except Exception as e:
        print(f'[API] ✗ Error updating equipment: {e}')
        return jsonify({
            'success': False,
            'message': 'Error updating equipment',
            'error': str(e)
        }), 500

@app.route('/api/measurements', methods=['POST'])
def save_measurement():
    """Save a completed measurement session"""
    try:
        data = request.json
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        equipment = data.get('equipment')
        total_cost = data.get('total_cost', 0)
        
        print(f'[API] save_measurement received: start_time="{start_time}", end_time="{end_time}", equipment="{equipment}"')
        
        if not start_time:
            return jsonify({
                'success': False,
                'message': 'start_time is required'
            }), 400
        
        # Normalize timestamps to ensure UTC format
        from datetime import datetime, timezone
        def normalize_to_utc(ts_str):
            """Normalize timestamp string to UTC ISO format"""
            if not ts_str:
                return ts_str
            try:
                # Parse the timestamp
                if isinstance(ts_str, str):
                    # Remove 'Z' and replace with +00:00 if needed
                    ts_clean = ts_str.replace('Z', '+00:00')
                    # Parse to datetime
                    dt_obj = datetime.fromisoformat(ts_clean.replace('Z', '+00:00'))
                    # Ensure UTC timezone
                    if dt_obj.tzinfo is None:
                        dt_obj = dt_obj.replace(tzinfo=timezone.utc)
                    # Convert to UTC if not already
                    dt_utc = dt_obj.astimezone(timezone.utc)
                    # Return in ISO format with Z
                    return dt_utc.isoformat().replace('+00:00', 'Z')
                return ts_str
            except Exception as e:
                print(f'[API] ⚠ Error normalizing timestamp "{ts_str}": {e}')
                return ts_str
        
        start_time_utc = normalize_to_utc(start_time)
        end_time_utc = normalize_to_utc(end_time) if end_time else None
        
        print(f'[API] Normalized timestamps: start_time="{start_time_utc}", end_time="{end_time_utc}"')
        
        # If no Supabase, skip
        if not supabase_client:
            return jsonify({
                'success': True,
                'message': 'Supabase not configured, skipping measurement save'
            })
        
        # If ending a measurement (has end_time), update existing active measurement
        if end_time_utc:
            # Find and update the active measurement with this start_time
            existing = supabase_client.table('measurements')\
                .select('*')\
                .eq('is_active', True)\
                .eq('start_time', start_time_utc)\
                .execute()
            
            if existing.data and len(existing.data) > 0:
                # Update existing active measurement and deactivate it
                print(f'[API] Deactivating active measurement: id={existing.data[0]["id"]}, start_time={start_time_utc}')
                result = supabase_client.table('measurements')\
                    .update({
                        'end_time': end_time_utc,
                        'total_cost': float(total_cost),
                        'is_active': False
                    })\
                    .eq('id', existing.data[0]['id'])\
                    .execute()
                print(f'[API] ✓ Measurement deactivated: {result.data[0] if result.data else "unknown"}')
            else:
                # No active measurement found with exact start_time, try to find any active measurement
                # This handles cases where timestamp format might differ slightly
                any_active = supabase_client.table('measurements')\
                    .select('*')\
                    .eq('is_active', True)\
                    .limit(1)\
                    .execute()
                
                if any_active.data and len(any_active.data) > 0:
                    # Update the active measurement we found
                    print(f'[API] Found active measurement with different start_time, deactivating: id={any_active.data[0]["id"]}')
                    result = supabase_client.table('measurements')\
                        .update({
                            'end_time': end_time_utc,
                            'start_time': start_time_utc,  # Update to match frontend (UTC normalized)
                            'equipment': equipment,
                            'total_cost': float(total_cost),
                            'is_active': False
                        })\
                        .eq('id', any_active.data[0]['id'])\
                        .execute()
                    print(f'[API] ✓ Measurement deactivated: {result.data[0] if result.data else "unknown"}')
                else:
                    # No active measurement found at all, create new completed one
                    print(f'[API] No active measurement found, creating completed measurement')
                    measurement_data = {
                        'start_time': start_time_utc,
                        'end_time': end_time_utc,
                        'equipment': equipment,
                        'total_cost': float(total_cost),
                        'is_active': False
                    }
                    result = supabase_client.table('measurements').insert(measurement_data).execute()
        else:
            # Creating/updating active measurement
            # Deactivate any existing active measurements first
            supabase_client.table('measurements')\
                .update({'is_active': False})\
                .eq('is_active', True)\
                .execute()
            
            measurement_data = {
                'start_time': start_time,
                'end_time': None,
                'equipment': equipment,
                'total_cost': float(total_cost),
                'is_active': True
            }
            result = supabase_client.table('measurements').insert(measurement_data).execute()
        
        if result.data:
            print(f'[API] ✓ Saved measurement: equipment={equipment}, cost={total_cost}€')
            return jsonify({
                'success': True,
                'message': 'Measurement saved successfully',
                'data': result.data[0]
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to save measurement'
            }), 500
        
    except Exception as e:
        print(f'[API] ✗ Error saving measurement: {e}')
        return jsonify({
            'success': False,
            'message': 'Error saving measurement',
            'error': str(e)
        }), 500

@app.route('/api/measurements', methods=['GET'])
def get_measurements():
    """Get measurement history"""
    try:
        limit = int(request.args.get('limit', 50))
        equipment = request.args.get('equipment')  # Optional filter
        
        # If no Supabase, return empty
        if not supabase_client:
            return jsonify({
                'success': True,
                'data': [],
                'count': 0
            })
        
        # Check if we want only active measurement
        active_only = request.args.get('active_only', 'false').lower() == 'true'
        
        if active_only:
            # Get only the active measurement
            query = supabase_client.table('measurements')\
                .select('*')\
                .eq('is_active', True)\
                .limit(1)
        else:
            # Get completed measurements (history)
            query = supabase_client.table('measurements')\
                .select('*')\
                .eq('is_active', False)\
                .order('start_time', desc=True)\
                .limit(limit)
            
            if equipment:
                query = query.eq('equipment', equipment)
        
        result = query.execute()
        
        measurements = result.data if result.data else []
        
        print(f'[API] ✓ Retrieved {len(measurements)} measurements from database')
        
        return jsonify({
            'success': True,
            'data': measurements,
            'count': len(measurements)
        })
        
    except Exception as e:
        print(f'[API] ✗ Error retrieving measurements: {e}')
        return jsonify({
            'success': False,
            'message': 'Error retrieving measurements',
            'error': str(e)
        }), 500

@app.route('/api/measurements/active', methods=['PUT'])
def update_active_measurement():
    """Update the active measurement (for syncing cost across devices)"""
    try:
        data = request.json
        start_time = data.get('start_time')
        total_cost = data.get('total_cost', 0)
        equipment = data.get('equipment')
        
        if not start_time:
            return jsonify({
                'success': False,
                'message': 'start_time is required'
            }), 400
        
        # If no Supabase, skip
        if not supabase_client:
            return jsonify({
                'success': True,
                'message': 'Supabase not configured'
            })
        
        # Find active measurement with this start_time
        result = supabase_client.table('measurements')\
            .update({
                'total_cost': float(total_cost),
                'equipment': equipment
            })\
            .eq('is_active', True)\
            .eq('start_time', start_time)\
            .execute()
        
        if result.data:
            return jsonify({
                'success': True,
                'message': 'Active measurement updated',
                'data': result.data[0]
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Active measurement not found'
            }), 404
        
    except Exception as e:
        print(f'[API] ✗ Error updating active measurement: {e}')
        return jsonify({
            'success': False,
            'message': 'Error updating active measurement',
            'error': str(e)
        }), 500

@app.route('/api/measurements/active', methods=['POST'])
def create_active_measurement():
    """Create or get active measurement"""
    try:
        data = request.json
        start_time = data.get('start_time')
        equipment = data.get('equipment')
        total_cost = data.get('total_cost', 0)
        
        print(f'[API] create_active_measurement received: start_time="{start_time}", equipment="{equipment}"')
        
        if not start_time:
            return jsonify({
                'success': False,
                'message': 'start_time is required'
            }), 400
        
        # Normalize timestamp to UTC
        from datetime import datetime, timezone
        def normalize_to_utc(ts_str):
            """Normalize timestamp string to UTC ISO format"""
            if not ts_str:
                return ts_str
            try:
                if isinstance(ts_str, str):
                    ts_clean = ts_str.replace('Z', '+00:00')
                    dt_obj = datetime.fromisoformat(ts_clean)
                    if dt_obj.tzinfo is None:
                        dt_obj = dt_obj.replace(tzinfo=timezone.utc)
                    dt_utc = dt_obj.astimezone(timezone.utc)
                    return dt_utc.isoformat().replace('+00:00', 'Z')
                return ts_str
            except Exception as e:
                print(f'[API] ⚠ Error normalizing timestamp "{ts_str}": {e}')
                return ts_str
        
        start_time_utc = normalize_to_utc(start_time)
        print(f'[API] Normalized start_time to UTC: "{start_time_utc}"')
        
        # If no Supabase, skip
        if not supabase_client:
            return jsonify({
                'success': True,
                'message': 'Supabase not configured'
            })
        
        # Check if active measurement already exists
        existing = supabase_client.table('measurements')\
            .select('*')\
            .eq('is_active', True)\
            .execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing active measurement
            print(f'[API] Updating existing active measurement: start_time={start_time_utc}, equipment={equipment}')
            result = supabase_client.table('measurements')\
                .update({
                    'start_time': start_time_utc,
                    'equipment': equipment,
                    'total_cost': float(total_cost)
                })\
                .eq('is_active', True)\
                .execute()
        else:
            # Create new active measurement
            # First deactivate any old ones (safety)
            print(f'[API] Creating new active measurement: start_time={start_time_utc}, equipment={equipment}')
            supabase_client.table('measurements')\
                .update({'is_active': False})\
                .eq('is_active', True)\
                .execute()
            
            result = supabase_client.table('measurements').insert({
                'start_time': start_time_utc,
                'end_time': None,
                'equipment': equipment,
                'total_cost': float(total_cost),
                'is_active': True
            }).execute()
        
        if result.data:
            print(f'[API] ✓ Active measurement created/updated: {result.data[0] if isinstance(result.data, list) else result.data}')
            return jsonify({
                'success': True,
                'message': 'Active measurement synced',
                'data': result.data[0] if isinstance(result.data, list) else result.data
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to sync active measurement'
            }), 500
        
    except Exception as e:
        print(f'[API] ✗ Error syncing active measurement: {e}')
        return jsonify({
            'success': False,
            'message': 'Error syncing active measurement',
            'error': str(e)
        }), 500

@app.route('/api/measurements/<int:measurement_id>', methods=['DELETE'])
def delete_measurement(measurement_id):
    """Delete a measurement session"""
    try:
        # If no Supabase, skip
        if not supabase_client:
            return jsonify({
                'success': True,
                'message': 'Supabase not configured, skipping deletion'
            })
        
        result = supabase_client.table('measurements')\
            .delete()\
            .eq('id', measurement_id)\
            .execute()
        
        deleted_count = len(result.data) if result.data else 0
        
        if deleted_count > 0:
            print(f'[API] ✓ Deleted measurement: id={measurement_id}')
            return jsonify({
                'success': True,
                'message': 'Measurement deleted successfully',
                'deleted_id': measurement_id
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Measurement not found'
            }), 404
        
    except Exception as e:
        print(f'[API] ✗ Error deleting measurement: {e}')
        return jsonify({
            'success': False,
            'message': 'Error deleting measurement',
            'error': str(e)
        }), 500

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
                    'lastUpdate': data.get('data', {}).get('attributes', {}).get('last-update', datetime.now(timezone.utc).isoformat()),
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

