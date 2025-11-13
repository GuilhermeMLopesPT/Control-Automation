/*
 * Arduino Code for Smart Meter Dashboard Integration
 * 
 * This code reads power consumption data and sends it to the Next.js dashboard
 * via HTTP POST requests. It's based on your existing code.ino but modified
 * to send data to the web dashboard.
 * 
 * Requirements:
 * - ESP32 or Arduino with WiFi capability
 * - Current Transformer (CT) connected to ADS1115
 * - WiFi connection to same network as dashboard
 */

#include <Wire.h>
#include <WiFi.h>  // For ESP32, or use WiFi101 for Arduino MKR
#include <HTTPClient.h>  // For ESP32
#include <ArduinoJson.h>

// WiFi credentials - CHANGE THESE TO YOUR NETWORK
const char* ssid = "MOVISTAR_52A0";
const char* password = "UVeVc9344TTPRV4R3Rc7";

// Dashboard URL - CHANGE THIS TO YOUR COMPUTER'S IP
const char* dashboardUrl = "http://192.168.1.52:3000/api/arduino-data";


#define ADS1115_ADDRESS 0x48

// Current transformer params (same as your original code)
const double Rshunt = 33.3;      // Burden resistor value in ohms
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
const int sampleAverage = 250;   // Cycles to average (250 cycles ≈ 5 seconds)

// Auto-zero calibration variables
bool first_run = true;           // Flag for first run calibration
double v_calib_acum = 0.0;       // Accumulated values for baseline calculation
double v_calib = 0.0;            // Calculated baseline offset
int calib_cycles = 0;            // Cycles used for calibration
const int CALIB_NCYCLES = 100;   // Number of cycles for baseline calibration

byte writeBuf[3];                // Buffer for I2C communication with ADS1115

// Data to send to dashboard
struct PowerData {
  double power;
  double current;
  double voltage;
  double vibration;  // Optional: if you have a vibration sensor
  double frequency;  // Optional: vibration frequency
};

//=================================================================================================================================
// FUNCTIONS (same as your original code)
//=================================================================================================================================

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

// New function to send data to dashboard
void sendDataToDashboard(PowerData data) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    return;
  }

  HTTPClient http;
  http.begin(dashboardUrl);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["power"] = data.power;
  doc["current"] = data.current;
  doc["voltage"] = data.voltage;
  doc["vibration"] = data.vibration;
  doc["frequency"] = data.frequency;
  doc["timestamp"] = millis(); // Arduino timestamp

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("Sending data to dashboard:");
  Serial.println(jsonString);

  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Dashboard response: " + response);
  } else {
    Serial.println("Error sending data: " + String(httpResponseCode));
  }

  http.end();
}

//=================================================================================================================================
// SETUP FUNCTION
//=================================================================================================================================
void setup() {
  Serial.begin(115200);
  config_i2c();

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Dashboard URL: ");
  Serial.println(dashboardUrl);

  Serial.println("Smart Meter Dashboard Integration Ready!");
}

//=================================================================================================================================
// MAIN LOOP - RMS CURRENT CALCULATION (modified from your original)
//=================================================================================================================================
void loop() {
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

    // Calculate power (assuming 230V)
    double power = Iavg_5s * 230.0 / 1000.0; // Convert to kW

    // Prepare data for dashboard
    PowerData data;
    data.power = power;
    data.current = Iavg_5s;
    data.voltage = 230.0; // You can measure this if you have a voltage sensor
    data.vibration = random(0, 100); // Simulated vibration data - replace with real sensor
    data.frequency = 50.0 + random(-5, 5); // Simulated frequency - replace with real sensor

    // Send data to dashboard
    sendDataToDashboard(data);

    // Print to serial for debugging
    Serial.print("Power: ");
    Serial.print(power, 4);
    Serial.print(" kW, Current: ");
    Serial.print(Iavg_5s, 4);
    Serial.println(" A");
  }
}
