/*
 * Current Transformer RMS Current Monitor - WIRELESS VERSION
 * 
 * This code measures AC current using a current transformer (CT) and calculates
 * the RMS (Root Mean Square) value. The CT reduces the current by its turns ratio,
 * and we measure the voltage across a burden resistor to calculate the actual current.
 * 
 * The system samples at 1ms intervals, calculates RMS over each power cycle (~20ms),
 * and then averages over 5 seconds for stable readings.
 * 
 * Data is sent wirelessly to Next.js API via WiFi HTTP POST.
 */

#include <Wire.h>
#include <WiFi.h>          // For ESP32 WiFi
#include <HTTPClient.h>    // For ESP32 HTTP requests
#include <ArduinoJson.h>   // For JSON formatting (optional, can use String instead)

//=================================================================================================================================
// WIFI CONFIGURATION - CHANGE THESE TO YOUR NETWORK
//=================================================================================================================================
const char* ssid = "iPhone de Guilherme";           // ← Change to your WiFi network name
const char* password = "12345678";    // ← Change to your WiFi password

// Next.js API URL - CHANGE THIS TO YOUR COMPUTER'S IP ADDRESS
// Find your computer's IP: Windows (ipconfig) or Mac/Linux (ifconfig)
// Example: "http://192.168.1.100:3000/api/arduino-data"
const char* apiUrl = "http://172.20.10.2:3000/api/arduino-data";  // ← Change to your computer's IP
const char* relayControlUrl = "http://172.20.10.2:3000/api/relay-control";  // ← Relay control API

// Standard voltage (for power calculation)
const double STANDARD_VOLTAGE = 230.0;  // 230V for Portugal/Spain

//=================================================================================================================================
// RELAY CONFIGURATION
//=================================================================================================================================
#define RELAY_PIN 2  // GPIO pin connected to relay module IN pin (change if needed)
// Note: Relay module V2.0 typically uses LOW to activate and HIGH to deactivate
// If your relay works opposite, swap the logic in setRelayState()
bool relayState = false;  // Current relay state (false = OFF, true = ON)

//=================================================================================================================================
// ADS1115 CONFIGURATION
//=================================================================================================================================
#define ADS1115_ADDRESS 0x48

// Current transformer parameters
const double Rshunt = 33.3;      // Burden resistor value in ohms (for 30A CT)
double n_trafo = 1000.0;         // CT turns ratio (primary:secondary = 1000:1)

// Timing control for 1ms sampling
unsigned long time_ant = 0;      // Previous time for timing control

// Variables for RMS calculation over one power cycle
double quadratic_sum_v = 0.0;    // Sum of squared current values
int quadratic_sum_counter = 0;   // Number of samples collected
const int sampleDuration = 20;    // Samples per cycle (20ms at 50Hz)

// Variables for averaging RMS over multiple cycles
double accumulated_current = 0.0; // Sum of RMS values for averaging
int accumulated_counter = 0;      // Number of cycles averaged
const int sampleAverage = 250;    // Cycles to average (250 cycles ≈ 5 seconds)

// Auto-zero calibration variables
bool first_run = true;           // Flag for first run calibration
double v_calib_acum = 0.0;       // Accumulated values for baseline calculation
double v_calib = 0.0;            // Calculated baseline offset
int calib_cycles = 0;            // Cycles used for calibration
const int CALIB_NCYCLES = 100;   // Number of cycles for baseline calibration

byte writeBuf[3];                // Buffer for I2C communication with ADS1115

// WiFi connection status
bool wifiConnected = false;

//=================================================================================================================================
// FUNCTIONS
//=================================================================================================================================

// Configure the ADS1115 ADC for current measurement
void config_i2c() {
  Wire.begin(); // Initialize I2C communication

  // Configure ADS1115: measure AIN1 vs GND, ±4.096V range, continuous mode, 860 samples/sec
  writeBuf[0] = 1;                // Point to configuration register
  writeBuf[1] = 0b11010010;       // Continuous mode, AIN1-GND input, ±4.096V range
  writeBuf[2] = 0b11100101;       // 860 SPS rate, comparator disabled

  // Send configuration to ADS1115
  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(writeBuf[0]);
  Wire.write(writeBuf[1]);
  Wire.write(writeBuf[2]);
  Wire.endTransmission();

  delay(500); // Wait for ADC to stabilize
}

// Read voltage from ADS1115 ADC
float read_voltage() {
  // Point to conversion result register
  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(0x00);
  Wire.endTransmission();

  // Request 2 bytes of data from ADC
  Wire.requestFrom(ADS1115_ADDRESS, 2);
  int16_t result = (Wire.read() << 8) | Wire.read();

  // Convert ADC reading to voltage
  // ADS1115 has ±4.096V range, so LSB = 4.096V / 32768 counts
  float voltage = result * 4.096f / 32768.0f;
  return voltage;  // Return voltage in volts
}

// Connect to WiFi
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiConnected = false;
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

// Send data to Next.js API via HTTP POST
void sendDataToAPI(double rmsCurrent) {
  if (!wifiConnected) {
    Serial.println("WiFi not connected. Cannot send data.");
    return;
  }

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");

  // Calculate power (Current × Voltage / 1000 to convert to kW)
  double power_kw = (rmsCurrent * STANDARD_VOLTAGE) / 1000.0;

  // Create JSON payload
  // Format: {"power": 0.368, "current": 0.0016, "voltage": 230.0, "timestamp": "2024-01-15T14:30:25.123Z"}
  String jsonPayload = "{";
  jsonPayload += "\"power\":" + String(power_kw, 4) + ",";
  jsonPayload += "\"current\":" + String(rmsCurrent, 4) + ",";
  jsonPayload += "\"voltage\":" + String(STANDARD_VOLTAGE, 1) + ",";
  
  // Get current timestamp in ISO format
  // Note: For accurate time, configure NTP in setup() or use millis() as fallback
  unsigned long currentMillis = millis();
  unsigned long seconds = currentMillis / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  // Simple timestamp format (HH:MM:SS from millis)
  // For production, use NTP to get real time
  char timestamp[30];
  snprintf(timestamp, sizeof(timestamp), "2024-01-01T%02lu:%02lu:%02lu.000Z", 
           hours % 24, minutes % 60, seconds % 60);
  jsonPayload += "\"timestamp\":\"" + String(timestamp) + "\"";
  jsonPayload += "}";

  // Send POST request
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      Serial.print("✓ Data sent successfully: ");
      Serial.print("Current=");
      Serial.print(rmsCurrent, 4);
      Serial.print("A, Power=");
      Serial.print(power_kw, 4);
      Serial.println("kW");
    } else {
      Serial.print("✗ API Error: ");
      Serial.println(httpResponseCode);
    }
  } else {
    Serial.print("✗ Connection failed: ");
    Serial.println(http.errorToString(httpResponseCode));
  }

  http.end();
}

// Set relay state (ON or OFF)
void setRelayState(bool state) {
  // Always update GPIO, even if state variable is the same
  // This ensures physical relay matches software state
  relayState = state;
  
  // Relay module V2.0: Try both logics to find which works
  // Option 1: HIGH = ON, LOW = OFF (most common)
  // Option 2: LOW = ON, HIGH = OFF (active low - uncomment if Option 1 doesn't work)
  
  if (state) {
    digitalWrite(RELAY_PIN, HIGH);  // Try HIGH for ON
  } else {
    digitalWrite(RELAY_PIN, LOW);   // Try LOW for OFF
  }
  
  // Verify the pin was actually set
  delay(10);  // Small delay to ensure pin state is set
  int actualPinState = digitalRead(RELAY_PIN);
  
  Serial.println("========================================");
  Serial.print("[Relay] Command: Set to ");
  Serial.println(state ? "ON" : "OFF");
  Serial.print("[Relay] GPIO ");
  Serial.print(RELAY_PIN);
  Serial.print(" written: ");
  Serial.println(state ? "HIGH" : "LOW");
  Serial.print("[Relay] GPIO ");
  Serial.print(RELAY_PIN);
  Serial.print(" read back: ");
  Serial.println(actualPinState == HIGH ? "HIGH" : "LOW");
  Serial.println("========================================");
  
  // If read back doesn't match, there's a problem
  if ((state && actualPinState != HIGH) || (!state && actualPinState != LOW)) {
    Serial.println("[Relay] ⚠ WARNING: Pin state mismatch!");
  }
}

// Check for relay control commands from server
void checkRelayCommand() {
  if (!wifiConnected) {
    return;
  }

  HTTPClient http;
  http.begin(relayControlUrl);
  http.addHeader("Content-Type", "application/json");
  
  // Send GET request to check for pending commands
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.print("Relay command check response: ");
    Serial.println(response);
    
    // Parse JSON response
    // Expected format: {"command": "on"} or {"command": "off"} or {"command": null}
    if (response.indexOf("\"command\":\"on\"") >= 0) {
      Serial.println("Received ON command");
      setRelayState(true);
      // Acknowledge command by sending status back
      sendRelayStatus();
    } else if (response.indexOf("\"command\":\"off\"") >= 0) {
      Serial.println("========================================");
      Serial.println("[Relay] ✓✓✓ RECEIVED OFF COMMAND ✓✓✓");
      Serial.println("========================================");
      setRelayState(false);
      delay(100);  // Give relay time to physically switch
      sendRelayStatus();
    }
    // If command is null, no action needed
  } else {
    Serial.print("Relay command check failed: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

// Send current relay status to server
void sendRelayStatus() {
  if (!wifiConnected) {
    return;
  }

  HTTPClient http;
  http.begin(relayControlUrl);
  http.addHeader("Content-Type", "application/json");
  
  // Send POST with current status
  String jsonPayload = "{\"status\":\"" + String(relayState ? "on" : "off") + "\"}";
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode == 200) {
    Serial.print("Relay status sent: ");
    Serial.println(relayState ? "ON" : "OFF");
  }
  
  http.end();
}

//=================================================================================================================================
// SETUP FUNCTION
//=================================================================================================================================
void setup() {
  Serial.begin(115200);  // Initialize serial communication for debugging
  delay(1000);

  Serial.println(F("========================================"));
  Serial.println(F("ESP32 RMS Current Monitor - WIRELESS"));
  Serial.println(F("========================================"));

  // Connect to WiFi
  connectWiFi();

  // Configure the ADS1115 ADC
  config_i2c();

  // Configure relay pin
  pinMode(RELAY_PIN, OUTPUT);
  setRelayState(false);  // Start with relay OFF
  
  // Send initial relay state to server
  delay(1000);  // Wait a bit for WiFi to be fully ready
  sendRelayStatus();

  // Print system information
  Serial.println(F("Sampling: 1 ms, Per-cycle RMS: ~20 ms, Average: ~5 s"));
  Serial.println(F("Ready to measure current..."));
  Serial.println(F("Relay control enabled on GPIO "));
  Serial.println(RELAY_PIN);
  Serial.println();
}

//=================================================================================================================================
// MAIN LOOP - RMS CURRENT CALCULATION
//=================================================================================================================================
void loop() {
  // Check WiFi connection periodically (every 30 seconds)
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 30000) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      Serial.println("WiFi disconnected. Reconnecting...");
      connectWiFi();
    }
    lastWiFiCheck = millis();
  }

  // Check for relay control commands periodically (every 2 seconds)
  static unsigned long lastRelayCheck = 0;
  if (millis() - lastRelayCheck > 2000) {
    checkRelayCommand();
    lastRelayCheck = millis();
  }

  // STEP 1: Sample current every 1ms and accumulate squared values
  unsigned long now = micros();
  if (now - time_ant >= 1000) {           // Check if 1ms has passed
    time_ant = now;

    // Read voltage from CT burden resistor (subtract 1.65V offset)
    float v_shunt = read_voltage() - 1.65;       // Voltage across burden resistor

    // Convert voltage to current using CT ratio
    // Secondary current = V_shunt / R_shunt
    // Primary current = Secondary current × turns ratio
    double i_inst = (v_shunt / Rshunt) * n_trafo;

    // Add squared current to sum for RMS calculation
    quadratic_sum_v += i_inst * i_inst;
    quadratic_sum_counter++;
  }

  // STEP 2: Calculate RMS over one power cycle (20ms at 50Hz)
  if (quadratic_sum_counter >= sampleDuration) {
    // Calculate RMS: sqrt(sum of squares / number of samples)
    double Irms_cycle = sqrt(quadratic_sum_v / (double)quadratic_sum_counter);

    // Reset variables for next cycle
    quadratic_sum_v = 0.0;
    quadratic_sum_counter = 0;

    // STEP 3: Auto-zero calibration (remove DC offset)
    if (first_run) {
      // During first 100 cycles, accumulate values to calculate baseline
      v_calib_acum += Irms_cycle;
      calib_cycles++;
      if (calib_cycles >= CALIB_NCYCLES) {
        v_calib = v_calib_acum / (double)calib_cycles;  // Calculate average baseline
        first_run = false;  // Calibration complete
        Serial.println("Calibration complete!");
      }
    }

    // Remove baseline offset and ensure positive values
    double Irms_filtered = Irms_cycle - (first_run ? 0.0 : v_calib);
    if (Irms_filtered < 0.0) Irms_filtered = 0.0;

    // Accumulate filtered RMS values for averaging
    accumulated_current += Irms_filtered;
    accumulated_counter++;
  }

  // STEP 4: Calculate and send average RMS every 5 seconds
  if (accumulated_counter >= sampleAverage) {
    // Calculate average RMS over 250 cycles (≈5 seconds)
    double Iavg_5s = accumulated_current / (double)accumulated_counter;

    // Reset for next averaging period
    accumulated_current = 0.0;
    accumulated_counter = 0;

    // Display on Serial (for debugging)
    Serial.print(F("I_RMS_avg_5s (A): "));
    Serial.println(Iavg_5s, 4);

    // Send data to Next.js API via WiFi
    if (!first_run) {  // Only send after calibration is complete
      sendDataToAPI(Iavg_5s);
    }
  }
}

