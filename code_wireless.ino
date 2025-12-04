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
 * Data is sent wirelessly to Flask API via WiFi HTTP POST.
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
 
 // Flask API URL - CHANGE THIS TO YOUR COMPUTER'S IP ADDRESS
 // Find your computer's IP: Windows (ipconfig) or Mac/Linux (ifconfig)
 // Example: "http://192.168.1.100:5000/api/arduino-data"
 const char* apiUrl = "http://172.20.10.3:5000/api/arduino-data";  // ← Your computer's IP (WiFi)
 const char* relayControlUrl = "http://172.20.10.3:5000/api/relay-control";  // ← Relay control API
 
 // Standard voltage (for power calculation)
 const double STANDARD_VOLTAGE = 230.0;  // 230V for Portugal/Spain
 
 //=================================================================================================================================
 // VIBRATION SENSOR CONFIGURATION (Piezo Disk Vibration Sensor V2)
 //=================================================================================================================================
 // Piezo sensors generate voltage when vibrated
 // Connect: Piezo positive leg -> Analog pin, Piezo negative leg -> GND
 // Recommended: Use a 1MΩ resistor between analog pin and GND for stability
 // ESP32 analog pins: GPIO 34, 35, 36, 39 (ADC1), or GPIO 32, 33 (ADC1)
 // FireBeetle: Can use A0 (GPIO 36) or any available analog pin
 #define VIBRATION_PIN A0  // Or use GPIO number: 36, 34, 35, 39, 32, 33
 
 // Variables for vibration reading
 float vibrationValue = 0.0;
 float vibrationBaseline = 0.0;  // Baseline/resting value
 bool vibrationCalibrated = false;
 const int VIBRATION_CALIB_SAMPLES = 100;  // Samples for baseline calibration
 int vibrationCalibCount = 0;
 
 // For peak-to-peak detection (more sensitive)
 float vibrationMin = 0.0;
 float vibrationMax = 0.0;
 const int VIBRATION_READINGS_PER_SECOND = 20;  // Read 20 times per second
 const unsigned long VIBRATION_READ_INTERVAL = 1000 / VIBRATION_READINGS_PER_SECOND;  // 50ms
 
 //=================================================================================================================================
 // RELAY CONFIGURATION
 //=================================================================================================================================
 // FireBeetle ESP32 pin mapping:
 // D0 = GPIO 2, D1 = GPIO 4, D2 = GPIO 5, D5 = GPIO 21, D8 = GPIO 25, D9 = GPIO 26
 // Working pins: D0 (GPIO 2), D1 (GPIO 4), D5 (GPIO 21), D8 (GPIO 25), D9 (GPIO 26)
 // D2 (GPIO 5) doesn't work - may have special function on ESP32
 // Using D0 (GPIO 2) - confirmed working (makes relay click)
   #define RELAY_PIN D0  // Use D0 if defined by board
 
 
 // Relay logic - Most modules use active LOW (LOW = ON, HIGH = OFF)
 // If your relay doesn't work, try swapping: change LOW to HIGH and HIGH to LOW
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
 
 // Scan I2C bus for devices
 void scanI2C() {
   byte devicesFound = 0;
   
   for (byte address = 1; address < 127; address++) {
     Wire.beginTransmission(address);
     byte error = Wire.endTransmission();
     
     if (error == 0) {
       if (address == ADS1115_ADDRESS) {
         Serial.print("✓ ADS1115 found at 0x");
         Serial.print(address, HEX);
         Serial.println();
         devicesFound++;
         break;  // Found it, no need to continue
       }
     }
   }
   
   if (devicesFound == 0) {
     Serial.println("✗ ADS1115 not found! Check I2C connections (SDA/SCL)");
   }
 }
 
 // Configure the ADS1115 ADC for current measurement
 void config_i2c() {
   // Initialize I2C communication
   // ESP32 default I2C pins: SDA = GPIO 21, SCL = GPIO 22
   // If using different pins, specify: Wire.begin(SDA_PIN, SCL_PIN)
   Wire.begin();
   delay(200);   // Wait for I2C bus to stabilize
   
   Serial.println("Checking I2C connection...");
   scanI2C();
 
   // Verify connection
   Wire.beginTransmission(ADS1115_ADDRESS);
   byte testError = Wire.endTransmission();
   
   if (testError != 0) {
     Serial.print("✗ ADS1115 communication error: ");
     Serial.println(testError);
     return;
   }
 
   // Configure ADS1115: measure AIN1 vs GND, ±4.096V range, continuous mode, 860 samples/sec
   writeBuf[0] = 1;                // Point to configuration register
   writeBuf[1] = 0b11010010;       // Continuous mode, AIN1-GND input, ±4.096V range
   writeBuf[2] = 0b11100101;       // 860 SPS rate, comparator disabled
 
   // Send configuration to ADS1115
   Wire.beginTransmission(ADS1115_ADDRESS);
   Wire.write(writeBuf[0]);
   Wire.write(writeBuf[1]);
   Wire.write(writeBuf[2]);
   byte error = Wire.endTransmission();
 
   if (error != 0) {
     Serial.print("✗ ADS1115 config error: ");
     Serial.println(error);
   }
 
   delay(500); // Wait for ADC to stabilize
 }
 
 // Read voltage from ADS1115 ADC
 float read_voltage() {
   // Point to conversion result register
   Wire.beginTransmission(ADS1115_ADDRESS);
   Wire.write(0x00);
   byte error = Wire.endTransmission();
   
   if (error != 0) {
     Serial.print("⚠ I2C error reading ADS1115: ");
     Serial.println(error);
     return 0.0;  // Return 0 if communication failed
   }
 
   // Request 2 bytes of data from ADC
   Wire.requestFrom(ADS1115_ADDRESS, 2);
   if (Wire.available() < 2) {
     Serial.println("⚠ I2C: Not enough data from ADS1115");
     return 0.0;
   }
   
   int16_t result = (Wire.read() << 8) | Wire.read();
 
   // Convert ADC reading to voltage
   // ADS1115 has ±4.096V range, so LSB = 4.096V / 32768 counts
   float voltage = result * 4.096f / 32768.0f;
   return voltage;  // Return voltage in volts
 }
 
 // Connect to WiFi - tries multiple times until successful
 void connectWiFi() {
   Serial.print("Connecting to WiFi: ");
   Serial.println(ssid);
   
   WiFi.mode(WIFI_STA);
   WiFi.disconnect();  // Disconnect any previous connection
   delay(100);
   WiFi.begin(ssid, password);
   
   int attempts = 0;
   const int maxAttempts = 30;  // Increased to 30 attempts (15 seconds)
   
   while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
     delay(500);
     Serial.print(".");
     attempts++;
     
     // Print progress every 5 attempts
     if (attempts % 10 == 0) {
       Serial.print("(");
       Serial.print(attempts);
       Serial.print(")");
     }
   }
   
   if (WiFi.status() == WL_CONNECTED) {
     wifiConnected = true;
     Serial.println();
     Serial.println("✓ WiFi connected!");
     Serial.print("IP address: ");
     Serial.println(WiFi.localIP());
   } else {
     wifiConnected = false;
     Serial.println();
     Serial.print("✗ WiFi connection failed after ");
     Serial.print(attempts);
     Serial.println(" attempts");
     Serial.println("Will retry in loop()...");
   }
 }
 
 // Read vibration sensor (Piezo Disk) - returns raw analog value
 int readVibrationRaw() {
   return analogRead(VIBRATION_PIN);
 }
 
 // Calibrate vibration sensor baseline (when no vibration)
 void calibrateVibration() {
   if (vibrationCalibrated) return;
   
   long sum = 0;
   for (int i = 0; i < VIBRATION_CALIB_SAMPLES; i++) {
     sum += readVibrationRaw();
     delay(10);
   }
   vibrationBaseline = sum / (float)VIBRATION_CALIB_SAMPLES;
   vibrationCalibrated = true;
   
   Serial.print("[Vibration] Baseline calibrated: ");
   Serial.println(vibrationBaseline);
 }
 
 // Sample vibration continuously and calculate peak-to-peak (more sensitive)
 float sampleVibration() {
   static unsigned long lastReadTime = 0;
   static float peakToPeak = 0.0;
   static unsigned long lastReset = 0;
   const unsigned long SAMPLE_WINDOW = 5000;  // 5 seconds window (same as current averaging)
   
   unsigned long now = millis();
   
   // Calibrate on first run
   if (!vibrationCalibrated) {
     calibrateVibration();
   }
   
   // Read vibration frequently (every 50ms = 20 times per second)
   if (now - lastReadTime >= VIBRATION_READ_INTERVAL) {
     lastReadTime = now;
     
     int rawValue = readVibrationRaw();
     float voltage = (rawValue * 3.3) / 4095.0;
     float baselineVoltage = (vibrationBaseline * 3.3) / 4095.0;
     
     // Calculate deviation from baseline (absolute value)
     float deviation = abs(voltage - baselineVoltage);
     
     // Track min and max deviations
     if (deviation > vibrationMax) {
       vibrationMax = deviation;
     }
     if (deviation < vibrationMin || vibrationMin == 0.0) {
       vibrationMin = deviation;
     }
     
     // Peak-to-peak = difference between max and min (more sensitive to vibrations)
     peakToPeak = vibrationMax - vibrationMin;
   }
   
   // Reset for next period
   if (now - lastReset > SAMPLE_WINDOW) {
     float result = peakToPeak;
     peakToPeak = 0.0;
     vibrationMax = 0.0;
     vibrationMin = 0.0;
     lastReset = now;
     return result;
   }
   
   return peakToPeak;
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
 
   // Get current vibration value (already sampled continuously in loop)
   // sampleVibration() returns the peak-to-peak value accumulated over 5 seconds
   float currentVibration = sampleVibration();
   if (currentVibration > 0) {
     vibrationValue = currentVibration;
   }
 
   // Create JSON payload
   // Format: {"current": 0.0016, "vibration": 0.5, "user_id": "optional-uuid"}
   // Note: timestamp is added by the server, power is calculated by server (current * 230V)
   String jsonPayload = "{";
   jsonPayload += "\"current\":" + String(rmsCurrent, 4);
   jsonPayload += ",\"vibration\":" + String(vibrationValue, 6);  // More decimal places for small values
   
   // Add user_id if you have user authentication (optional)
   // Example: jsonPayload += ",\"user_id\":\"" + String(userId) + "\"";
   
   jsonPayload += "}";
 
   // Send POST request
   int httpResponseCode = http.POST(jsonPayload);
 
   if (httpResponseCode == 200) {
     Serial.println("✓ OK");
   } else if (httpResponseCode > 0) {
     Serial.print("✗ Error ");
     Serial.println(httpResponseCode);
   } else {
     Serial.print("✗ Failed: ");
     Serial.println(http.errorToString(httpResponseCode));
   }
 
   http.end();
 }
 
 // Set relay state (ON or OFF)
 void setRelayState(bool state) {
   // Always update GPIO, even if state variable is the same
   // This ensures physical relay matches software state
   relayState = state;
   
   Serial.println("========================================");
   Serial.print("[Relay] Changing state to: ");
   Serial.println(state ? "ON" : "OFF");
   Serial.print("[Relay] Using pin: GPIO ");
   Serial.println(RELAY_PIN);
   
   // Force state change: go to opposite first, then desired state
   // This helps ensure the relay physically switches
   // Active HIGH logic: HIGH = ON, LOW = OFF (same as test script that worked)
   if (state) {
     digitalWrite(RELAY_PIN, LOW);   // Go to opposite first
     delay(20);
     digitalWrite(RELAY_PIN, HIGH);  // HIGH = Relay ON
     Serial.println("[Relay] Writing HIGH to pin (ON)");
   } else {
     digitalWrite(RELAY_PIN, HIGH);  // Go to opposite first
     delay(20);
     digitalWrite(RELAY_PIN, LOW);   // LOW = Relay OFF
     Serial.println("[Relay] Writing LOW to pin (OFF)");
   }
   
   delay(100);  // Delay to ensure pin state is set and relay has time to switch
   
   // Verify pin state
   int pinState = digitalRead(RELAY_PIN);
   Serial.print("[Relay] Pin reading after write: ");
   Serial.println(pinState == LOW ? "LOW" : "HIGH");
   Serial.println("========================================");
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
     // Only print response when there's a command (to reduce spam)
     if (response.indexOf("\"command\":\"on\"") >= 0 || response.indexOf("\"command\":\"off\"") >= 0) {
       Serial.print("[Relay] Server response: ");
       Serial.println(response);
     }
     
     // Remove all spaces from response for easier parsing
     String responseNoSpaces = response;
     responseNoSpaces.replace(" ", "");
     responseNoSpaces.replace("\n", "");
     responseNoSpaces.replace("\r", "");
     
     // Parse JSON response: {"command":"on"} or {"command":"off"} or {"command":null}
     // Check for "on" command (with quotes)
     int onIndex = responseNoSpaces.indexOf("\"command\":\"on\"");
     int offIndex = responseNoSpaces.indexOf("\"command\":\"off\"");
     
     if (onIndex >= 0 && (offIndex < 0 || onIndex < offIndex)) {
       Serial.println("========================================");
       Serial.println("[Relay] ⚡ COMMAND RECEIVED: ON");
       Serial.print("[Relay] Current state: ");
       Serial.println(relayState ? "ON" : "OFF");
       Serial.println("========================================");
       // Always execute, even if state seems the same (relay might be stuck)
       setRelayState(true);
       delay(200);  // Give relay time to switch
       sendRelayStatus();
     } else if (offIndex >= 0) {
       Serial.println("========================================");
       Serial.println("[Relay] ⚡ COMMAND RECEIVED: OFF");
       Serial.print("[Relay] Current state: ");
       Serial.println(relayState ? "ON" : "OFF");
       Serial.println("========================================");
       // Always execute, even if state seems the same (relay might be stuck)
       setRelayState(false);
       delay(200);  // Give relay time to switch
       sendRelayStatus();
     } else {
       // No command pending - show response for debugging (only once per 10 seconds)
       static unsigned long lastNoCommandLog = 0;
       if (millis() - lastNoCommandLog > 10000) {
         Serial.print("[Relay] No command (response: ");
         Serial.print(response);
         Serial.println(")");
         lastNoCommandLog = millis();
       }
     }
   } else {
     Serial.print("[Relay] HTTP Error: ");
     Serial.println(httpResponseCode);
   }
   
   http.end();
 }
 
 // Send current relay status to server
 void sendRelayStatus() {
   if (!wifiConnected) {
     Serial.println("⚠ Cannot send relay status: WiFi not connected");
     return;
   }
 
   HTTPClient http;
   http.setTimeout(1500);
   http.setConnectTimeout(1500);
   http.begin(relayControlUrl);
   http.addHeader("Content-Type", "application/json");
   
   String jsonPayload = "{\"status\":\"" + String(relayState ? "on" : "off") + "\"}";
   int httpResponseCode = http.POST(jsonPayload);
   
   if (httpResponseCode != 200 && httpResponseCode > 0) {
     Serial.print("⚠ Relay status error: ");
     Serial.println(httpResponseCode);
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
 
   // Connect to WiFi - will keep trying until successful
   Serial.println("Initializing WiFi connection...");
   while (!wifiConnected) {
     connectWiFi();
     if (!wifiConnected) {
       Serial.println("Retrying WiFi connection in 5 seconds...");
       delay(5000);
     }
   }
 
   // Configure the ADS1115 ADC
   config_i2c();
 
   // Configure vibration sensor pin (analog input)
   pinMode(VIBRATION_PIN, INPUT);
   Serial.print("[Vibration] Configured pin: ");
   Serial.println(VIBRATION_PIN);
   Serial.println("[Vibration] Sensor ready - monitoring vibrations");
 
   // Configure relay pin
   pinMode(RELAY_PIN, OUTPUT);
   Serial.print("[Relay] Configured pin: GPIO ");
   Serial.println(RELAY_PIN);
   
   // Force initial state to OFF (LOW)
   digitalWrite(RELAY_PIN, LOW);
   delay(100);
   Serial.println("[Relay] Initial state forced to LOW (OFF)");
   
   setRelayState(false);  // Start with relay OFF
   
   // Send initial relay state to server
   delay(500);
   sendRelayStatus();
 
   // Print system information
   Serial.println(F("========================================"));
   Serial.println(F("System ready - Starting measurements..."));
   Serial.println(F("========================================"));
   Serial.println();
 }
 
 //=================================================================================================================================
 // MAIN LOOP - RMS CURRENT CALCULATION
 //=================================================================================================================================
 void loop() {
   // Check WiFi connection periodically (every 10 seconds for faster recovery)
   static unsigned long lastWiFiCheck = 0;
   if (millis() - lastWiFiCheck > 10000) {
     if (WiFi.status() != WL_CONNECTED) {
       wifiConnected = false;
       Serial.println("⚠ WiFi disconnected. Reconnecting...");
       connectWiFi();
     } else if (!wifiConnected) {
       // WiFi is connected but flag wasn't set
       wifiConnected = true;
       Serial.println("✓ WiFi reconnected!");
       Serial.print("IP address: ");
       Serial.println(WiFi.localIP());
     }
     lastWiFiCheck = millis();
   }
 
   // Check for relay control commands periodically (every 500ms for faster response)
   static unsigned long lastRelayCheck = 0;
   if (millis() - lastRelayCheck > 500) {
     checkRelayCommand();
     lastRelayCheck = millis();
   }
 
   // Continuously sample vibration (runs in parallel with current measurement)
   sampleVibration();  // This accumulates peak-to-peak data over 5 seconds
 
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
         Serial.println("✓ Calibration complete - Starting data transmission");
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
 
     // Send data to Flask API via WiFi
     if (!first_run) {  // Only send after calibration is complete
       Serial.print(F("I_RMS_avg_5s (A): "));
       Serial.print(Iavg_5s, 4);
       Serial.print(F(" | Vibration: "));
       Serial.print(vibrationValue, 6);
       Serial.print(F("V (baseline: "));
       Serial.print(vibrationBaseline);
       Serial.print(F(") -> Sending to API... "));
       sendDataToAPI(Iavg_5s);
     }
   }
 }
 
 