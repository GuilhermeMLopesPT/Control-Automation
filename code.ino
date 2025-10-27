/*
 * Current Transformer RMS Current Monitor
 * 
 * This code measures AC current using a current transformer (CT) and calculates
 * the RMS (Root Mean Square) value. The CT reduces the current by its turns ratio,
 * and we measure the voltage across a burden resistor to calculate the actual current.
 * 
 * The system samples at 1ms intervals, calculates RMS over each power cycle (~20ms),
 * and then averages over 5 seconds for stable readings.
 */

#include <Wire.h>

// ADS1115 ADC address (default when ADDR pin is connected to ground)
#define ADS1115_ADDRESS 0x48

//=================================================================================================================================
// VARIABLES AND CONSTANTS
//=================================================================================================================================

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

//=================================================================================================================================
// SETUP FUNCTION
//=================================================================================================================================
void setup() {
  Serial.begin(115200);  // Initialize serial communication for debugging
  config_i2c();          // Configure the ADS1115 ADC

  // Print system information
  Serial.println(F("ADS1115 CT RMS Monitor"));
  Serial.println(F("Sampling: 1 ms, Per-cycle RMS: ~20 ms, Average: ~5 s"));
}

//=================================================================================================================================
// MAIN LOOP - RMS CURRENT CALCULATION
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

  // STEP 4: Calculate and display average RMS every 5 seconds
  if (accumulated_counter >= sampleAverage) {
    // Calculate average RMS over 250 cycles (≈5 seconds)
    double Iavg_5s = accumulated_current / (double)accumulated_counter;

    // Reset for next averaging period
    accumulated_current = 0.0;
    accumulated_counter = 0;

    // Display the final result
    Serial.print(F("I_RMS_avg_5s (A): "));
    Serial.println(Iavg_5s, 4);
  }
}
