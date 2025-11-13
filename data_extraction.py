# Import the serial library to communicate with the ESP32 via COM port
import serial 
# Import time library for delays (waiting for ESP32 to initialize)
import time
# Import regular expressions library to extract numbers from text strings
import re
# Import datetime to get current date and time for timestamps
from datetime import datetime
# Import requests library to send HTTP POST requests to Next.js API
import requests

# ============================================================================
# CONFIGURATION
# ============================================================================
# Serial port configuration
SERIAL_PORT = 'COM8'        # COM port where ESP32 is connected
BAUDRATE = 115200           # Baud rate (must match ESP32's Serial.begin())
TIMEOUT = 1                 # Serial timeout in seconds

# Next.js API configuration
# Change this to your Next.js server URL (usually http://localhost:3000)
API_URL = "http://localhost:3000/api/arduino-data"

# Electrical parameters (for power calculation)
# Standard voltage in Portugal/Spain is 230V
STANDARD_VOLTAGE = 230.0    # Voltage in Volts

# ============================================================================
# SERIAL PORT CONFIGURATION
# ============================================================================
# Create a serial connection object to COM8 port
# Parameters:
#   SERIAL_PORT - The COM port where ESP32 is connected (Windows port name)
#   BAUDRATE - Baud rate (bits per second) - must match ESP32's Serial.begin()
#   timeout - Wait maximum TIMEOUT seconds for data before giving up
ser = serial.Serial(SERIAL_PORT, BAUDRATE, timeout=TIMEOUT)

# Wait 2 seconds to allow ESP32 to complete its initialization
# This ensures the ESP32 is ready before we start reading data
time.sleep(2)

# ============================================================================
# PROGRAM HEADER - Display welcome message
# ============================================================================
# Print a line of 60 equal signs for visual separation
print("=" * 60)
# Print the program title
print("ESP32 RMS Current Monitor - Data Logger & API Bridge")
# Print another line of equal signs
print("=" * 60)
# Print configuration information
print(f"Serial Port: {SERIAL_PORT} @ {BAUDRATE} baud")
print(f"API URL: {API_URL}")
print(f"Standard Voltage: {STANDARD_VOLTAGE} V")
print("-" * 60)

# Test API connection before starting
print("Testing API connection...")
try:
    test_response = requests.get(API_URL.replace('/arduino-data', ''), timeout=2)
    print(f"✓ API server is accessible")
except requests.exceptions.RequestException:
    print(f"✗ WARNING: Cannot connect to API at {API_URL}")
    print(f"  Make sure Next.js is running: cd my-app && npm run dev")
    print(f"  The script will continue but data won't be sent to the dashboard.")
    print("-" * 60)

# Print status message
print("Waiting for data from ESP32...")
print("-" * 60)

# ============================================================================
# MAIN DATA READING LOOP
# ============================================================================
try:
    # Clear any old/unread data that might be in the serial buffer
    # This ensures we start reading fresh data, not leftover data
    ser.reset_input_buffer()
    
    # Initialize a counter to track how many RMS values we've received
    # This will be incremented each time we successfully extract a value
    value_count = 0
    
    # Start an infinite loop that will run until user presses Ctrl+C
    while True:
        # Check if there is data waiting in the serial buffer
        # ser.in_waiting returns the number of bytes available to read
        if ser.in_waiting > 0:
            # Try to read and decode the data (may fail if data is corrupted)
            try:
                # Read one line from serial port (reads until newline character)
                # .decode('utf-8') converts bytes to string using UTF-8 encoding
                # .rstrip() removes trailing whitespace (spaces, newlines, etc.)
                line = ser.readline().decode('utf-8').rstrip()
            except UnicodeDecodeError:
                # If decoding fails (corrupted data), skip this data and continue
                # This prevents the program from crashing on bad data
                continue
            
            # Skip processing if the line is empty (no useful data)
            if not line:
                continue
            
            # ====================================================================
            # RMS CURRENT VALUE EXTRACTION
            # ====================================================================
            # Check if this line contains the RMS current reading
            # The ESP32 sends: "I_RMS_avg_5s (A): 0.0016"
            if "I_RMS_avg_5s" in line:
                # Use regular expression to extract the numeric value
                # Pattern explanation:
                #   I_RMS_avg_5s \(A\):  - Matches the literal text "I_RMS_avg_5s (A): "
                #   \s*                  - Matches zero or more whitespace characters
                #   ([-+]?\d+\.\d+)      - Captures the number:
                #                          [-+]? = optional plus or minus sign
                #                          \d+   = one or more digits
                #                          \.    = literal decimal point
                #                          \d+   = one or more digits after decimal
                match = re.search(r'I_RMS_avg_5s \(A\):\s*([-+]?\d+\.\d+)', line)
                
                # If the regex pattern found a match
                if match:
                    # Extract the matched number and convert to float
                    # match.group(1) gets the first captured group (the number)
                    rms_current = float(match.group(1))
                    
                    # Increment the counter of received values
                    value_count += 1
                    
                    # Get current date and time in ISO format for API
                    # ISO format: "2024-01-15T14:30:25.123456"
                    timestamp_iso = datetime.now().isoformat()
                    # Also get formatted timestamp for display
                    timestamp_display = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    # Calculate power from current and voltage
                    # Power (W) = Voltage (V) × Current (A)
                    # Convert to kilowatts (kW) by dividing by 1000
                    power_kw = (STANDARD_VOLTAGE * rms_current) / 1000.0
                    
                    # Prepare data to send to Next.js API
                    # Format matches what the API expects (see route.ts)
                    api_data = {
                        "power": round(power_kw, 4),           # Power in kW
                        "current": round(rms_current, 4),     # Current in A (RMS)
                        "voltage": STANDARD_VOLTAGE,            # Voltage in V (assumed constant)
                        "timestamp": timestamp_iso             # ISO format timestamp
                    }
                    
                    # Send data to Next.js API via HTTP POST
                    try:
                        # Send POST request with JSON data
                        # headers specify that we're sending JSON
                        response = requests.post(
                            API_URL,
                            json=api_data,                    # Send as JSON
                            headers={"Content-Type": "application/json"},
                            timeout=2                          # 2 second timeout
                        )
                        
                        # Check if request was successful (status code 200)
                        if response.status_code == 200:
                            result = response.json()
                            # Display success message with API response
                            print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✓ API: {result.get('message', 'OK')}")
                        else:
                            # API returned an error status code
                            print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API Error: {response.status_code}")
                    
                    except requests.exceptions.ConnectionError as e:
                        # Handle connection errors (API not running)
                        # Only show error once every 10 readings to avoid spam
                        if value_count % 10 == 1:
                            print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API: Connection failed - Is Next.js running?")
                        else:
                            print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW")
                    except requests.exceptions.RequestException as e:
                        # Handle other network errors
                        print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API Error: {str(e)[:50]}")
                else:
                    # Fallback method: if regex didn't match, try to find any number
                    # This is a backup in case the format changes slightly
                    # re.findall() finds all numbers matching the pattern in the line
                    numbers = re.findall(r'[-+]?\d+\.\d+', line)
                    
                    # If any numbers were found
                    if numbers:
                        # Use the first number found as the RMS current value
                        rms_current = float(numbers[0])
                        # Increment counter
                        value_count += 1
                        # Get timestamps
                        timestamp_iso = datetime.now().isoformat()
                        timestamp_display = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        
                        # Calculate power
                        power_kw = (STANDARD_VOLTAGE * rms_current) / 1000.0
                        
                        # Prepare API data
                        api_data = {
                            "power": round(power_kw, 4),
                            "current": round(rms_current, 4),
                            "voltage": STANDARD_VOLTAGE,
                            "timestamp": timestamp_iso
                        }
                        
                        # Try to send to API
                        try:
                            response = requests.post(
                                API_URL,
                                json=api_data,
                                headers={"Content-Type": "application/json"},
                                timeout=2
                            )
                            if response.status_code == 200:
                                result = response.json()
                                print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✓ API: {result.get('message', 'OK')}")
                            else:
                                print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API Error: {response.status_code}")
                        except requests.exceptions.ConnectionError as e:
                            # Handle connection errors (API not running)
                            if value_count % 10 == 1:
                                print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API: Connection failed - Is Next.js running?")
                            else:
                                print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW")
                        except requests.exceptions.RequestException as e:
                            print(f"[{timestamp_display}] #{value_count:4d} | RMS Current: {rms_current:.4f} A | Power: {power_kw:.4f} kW | ✗ API Error: {str(e)[:50]}")
            else:
                # If the line doesn't contain RMS data, check for other messages
                # Print initialization messages from ESP32 (like "ADS1115 CT RMS Monitor")
                if "ADS1115" in line or "Sampling" in line:
                    # Display ESP32 initialization messages with prefix
                    print(f"ESP32: {line}")
                # All other lines are ignored (not printed)
            
# ============================================================================
# EXCEPTION HANDLING
# ============================================================================
# Catch KeyboardInterrupt exception (when user presses Ctrl+C)
except KeyboardInterrupt:
    # Print a newline and separator line
    print("\n" + "-" * 60)
    # Print termination message
    print(f"Program terminated by user")
    # Print total number of values received during this session
    print(f"Total values received: {value_count}")
    # Print closing separator
    print("=" * 60)
    
# ============================================================================
# CLEANUP - Always executed, even if error occurs
# ============================================================================
finally: 
    # Close the serial port connection to free it for other programs
    # This is important so other programs (like Arduino IDE) can use COM8
    ser.close()
    # Print confirmation message
    print("Serial connection closed.")