/*
 * Current Transformer RMS Current Monitor - SERIAL VERSION
 * 
 * This code measures AC current using a current transformer (CT) and calculates
 * the RMS (Root Mean Square) value. Communication is via Serial (USB cable).
 * 
 * The system samples at 1ms intervals, calculates RMS over each power cycle (~20ms),
 * and then averages over 5 seconds for stable readings.
 * 
 * Commands format:
 * - Send "RELAY_ON\n" to turn relay ON
 * - Send "RELAY_OFF\n" to turn relay OFF
 * 
 * Data format (sent every 5 seconds):
 * - "DATA:0.0016\n" (current in Amperes)
 */

#include <Wire.h>

// Standard voltage (for power calculation)
const double STANDARD_VOLTAGE = 230.0;  // 230V for Portugal/Spain

//=================================================================================================================================
// RELAY CONFIGURATION
//=================================================================================================================================
// FireBeetle ESP32 pin mapping:
// D0 = GPIO 2, D1 = GPIO 4, D2 = GPIO 5, D5 = GPIO 21, D8 = GPIO 25, D9 = GPIO 26
// Working pins: D0 (GPIO 2), D1 (GPIO 4), D5 (GPIO 21), D8 (GPIO 25), D9 (GPIO 26)
// D2 (GPIO 5) doesn't work - may have special function on ESP32
#define RELAY_PIN 2   // GPIO 2 = D0 (confirmed working - makes relay click)

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

//=================================================================================================================================
// VIBRATION SENSOR CONFIGURATION (Piezo Disk Vibration Sensor V2 on A0)
//=================================================================================================================================
#define VIBRATION_PIN A0          // Analog pin for vibration sensor
double accumulated_vibration = 0.0;  // Sum of vibration values for averaging
int vibration_sample_count = 0;      // Number of vibration samples collected
const int VIBRATION_SAMPLES = 250;    // Sample vibration same number of times as current (≈5 seconds)

// Auto-zero calibration variables
bool first_run = true;           // Flag for first run calibration
double v_calib_acum = 0.0;       // Accumulated values for baseline calculation
double v_calib = 0.0;            // Calculated baseline offset
int calib_cycles = 0;            // Cycles used for calibration
const int CALIB_NCYCLES = 100;   // Number of cycles for baseline calibration

byte writeBuf[3];                // Buffer for I2C communication with ADS1115

// Serial command buffer
String serialBuffer = "";

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
        Serial.print("ADS1115 found at 0x");
        Serial.print(address, HEX);
        Serial.println();
        devicesFound++;
        break;
      }
    }
  }
  
  if (devicesFound == 0) {
    Serial.println("ADS1115 not found! Check I2C connections (SDA/SCL)");
  }
}

// Configure the ADS1115 ADC for current measurement
void config_i2c() {
  Wire.begin();
  delay(200);
  
  Serial.println("Checking I2C connection...");
  scanI2C();

  Wire.beginTransmission(ADS1115_ADDRESS);
  byte testError = Wire.endTransmission();
  
  if (testError != 0) {
    Serial.print("ADS1115 communication error: ");
    Serial.println(testError);
    return;
  }

  // Configure ADS1115: measure AIN1 vs GND, ±4.096V range, continuous mode, 860 samples/sec
  writeBuf[0] = 1;
  writeBuf[1] = 0b11010010;
  writeBuf[2] = 0b11100101;

  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(writeBuf[0]);
  Wire.write(writeBuf[1]);
  Wire.write(writeBuf[2]);
  byte error = Wire.endTransmission();

  if (error != 0) {
    Serial.print("ADS1115 config error: ");
    Serial.println(error);
  }

  delay(500);
}

// Read voltage from ADS1115 ADC
float read_voltage() {
  Wire.beginTransmission(ADS1115_ADDRESS);
  Wire.write(0x00);
  byte error = Wire.endTransmission();
  
  if (error != 0) {
    return 0.0;
  }

  Wire.requestFrom(ADS1115_ADDRESS, 2);
  if (Wire.available() < 2) {
    return 0.0;
  }
  
  int16_t result = (Wire.read() << 8) | Wire.read();
  float voltage = result * 4.096f / 32768.0f;
  return voltage;
}

// Set relay state (ON or OFF)
void setRelayState(bool state) {
  relayState = state;
  
  Serial.println("========================================");
  Serial.print("[Relay] Setting to: ");
  Serial.println(state ? "ON" : "OFF");
  Serial.print("[Relay] Pin: GPIO ");
  Serial.println(RELAY_PIN);
  
  // Try BOTH logics to see which one works
  // Logic 1: HIGH = ON, LOW = OFF
  if (state) {
    Serial.println("[Relay] Trying Logic 1: HIGH=ON");
    digitalWrite(RELAY_PIN, LOW);   // Go to opposite
    delay(50);
    digitalWrite(RELAY_PIN, HIGH);   // HIGH = ON
    Serial.println("[Relay] Pin set to HIGH");
  } else {
    Serial.println("[Relay] Trying Logic 1: LOW=OFF");
    digitalWrite(RELAY_PIN, HIGH);  // Go to opposite
    delay(50);
    digitalWrite(RELAY_PIN, LOW);   // LOW = OFF
    Serial.println("[Relay] Pin set to LOW");
  }
  delay(200);
  
  // If Logic 1 doesn't work, try Logic 2: LOW = ON, HIGH = OFF
  Serial.println("[Relay] Also trying Logic 2: LOW=ON, HIGH=OFF");
  if (state) {
    digitalWrite(RELAY_PIN, HIGH);  // Go to opposite
    delay(50);
    digitalWrite(RELAY_PIN, LOW);   // LOW = ON (active LOW)
    Serial.println("[Relay] Pin set to LOW (active LOW mode)");
  } else {
    digitalWrite(RELAY_PIN, LOW);   // Go to opposite
    delay(50);
    digitalWrite(RELAY_PIN, HIGH);  // HIGH = OFF
    Serial.println("[Relay] Pin set to HIGH (active LOW mode)");
  }
  delay(200);
  
  // Verify final state
  int pinState = digitalRead(RELAY_PIN);
  Serial.print("[Relay] Final pin reading: ");
  Serial.println(pinState == LOW ? "LOW" : "HIGH");
  Serial.println(">>> LISTEN FOR RELAY CLICK! <<<");
  Serial.println("========================================");
}

// Process serial commands
void processSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        serialBuffer.trim();
        serialBuffer.toUpperCase();
        
        if (serialBuffer == "RELAY_ON") {
          Serial.println("========================================");
          Serial.println("[Relay] COMMAND RECEIVED: ON");
          Serial.println("========================================");
          setRelayState(true);
          delay(500);  // Give more time for relay to switch
        } else if (serialBuffer == "RELAY_OFF") {
          Serial.println("========================================");
          Serial.println("[Relay] COMMAND RECEIVED: OFF");
          Serial.println("========================================");
          setRelayState(false);
          delay(500);  // Give more time for relay to switch
        } else if (serialBuffer == "STATUS") {
          Serial.print("STATUS:RELAY:");
          Serial.println(relayState ? "ON" : "OFF");
        }
        
        serialBuffer = "";
      }
    } else {
      serialBuffer += c;
    }
  }
}

//=================================================================================================================================
// SETUP FUNCTION
//=================================================================================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========================================");
  Serial.println("ESP32 RMS Current Monitor - SERIAL");
  Serial.println("========================================");

  // Configure the ADS1115 ADC
  config_i2c();

  // Configure relay pin
  pinMode(RELAY_PIN, OUTPUT);
  Serial.print("[Relay] Configured pin: GPIO ");
  Serial.println(RELAY_PIN);
  
  // Force initial state to OFF (LOW)
  digitalWrite(RELAY_PIN, LOW);
  delay(100);
  Serial.println("[Relay] Initial state: OFF");
  
  setRelayState(false);
  
  // Configure vibration sensor pin (A0 is analog, no pinMode needed)
  Serial.println("[Vibration] Sensor configured on A0");

  Serial.println("========================================");
  Serial.println("System ready - Starting measurements...");
  Serial.println("Commands: RELAY_ON, RELAY_OFF, STATUS");
  Serial.println("========================================");
  Serial.println();
}

//=================================================================================================================================
// MAIN LOOP - RMS CURRENT CALCULATION
//=================================================================================================================================
void loop() {
  // Process serial commands
  processSerialCommands();

  // STEP 1: Sample current every 1ms and accumulate squared values
  unsigned long now = micros();
  if (now - time_ant >= 1000) {
    time_ant = now;

    float v_shunt = read_voltage() - 1.65;
    double i_inst = (v_shunt / Rshunt) * n_trafo;

    quadratic_sum_v += i_inst * i_inst;
    quadratic_sum_counter++;
    
    // Read vibration sensor from A0 (sample at same rate as current)
    int vibrationRaw = analogRead(VIBRATION_PIN);
    // Convert ADC reading (0-4095) to voltage (0-3.3V), then normalize
    // Piezo sensors typically output 0-3.3V, we'll use absolute value of deviation from center
    double vibrationVoltage = (vibrationRaw * 3.3) / 4095.0;
    double vibrationValue = abs(vibrationVoltage - 1.65); // Deviation from center (1.65V)
    accumulated_vibration += vibrationValue;
    vibration_sample_count++;
  }

  // STEP 2: Calculate RMS over one power cycle (20ms at 50Hz)
  if (quadratic_sum_counter >= sampleDuration) {
    double Irms_cycle = sqrt(quadratic_sum_v / (double)quadratic_sum_counter);

    quadratic_sum_v = 0.0;
    quadratic_sum_counter = 0;

    // STEP 3: Auto-zero calibration (remove DC offset)
    if (first_run) {
      v_calib_acum += Irms_cycle;
      calib_cycles++;
      if (calib_cycles >= CALIB_NCYCLES) {
        v_calib = v_calib_acum / (double)calib_cycles;
        first_run = false;
        Serial.println("Calibration complete - Starting data transmission");
      }
    }

    double Irms_filtered = Irms_cycle - (first_run ? 0.0 : v_calib);
    if (Irms_filtered < 0.0) Irms_filtered = 0.0;

    accumulated_current += Irms_filtered;
    accumulated_counter++;
  }

  // STEP 4: Calculate and send average RMS every 5 seconds
  if (accumulated_counter >= sampleAverage) {
    double Iavg_5s = accumulated_current / (double)accumulated_counter;
    
    // Calculate average vibration over same period
    double avgVibration = 0.0;
    if (vibration_sample_count > 0) {
      avgVibration = accumulated_vibration / (double)vibration_sample_count;
    }

    accumulated_current = 0.0;
    accumulated_counter = 0;
    accumulated_vibration = 0.0;
    vibration_sample_count = 0;

    // Send data via Serial (format: DATA:current,vibration)
    if (!first_run) {
      Serial.print("DATA:");
      Serial.print(Iavg_5s, 4);
      Serial.print(",");
      Serial.print(avgVibration, 3);
      Serial.println();
    }
  }
}

