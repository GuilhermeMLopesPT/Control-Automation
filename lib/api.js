/**
 * API Client for Flask Backend
 * Connects to http://localhost:5000
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const STANDARD_VOLTAGE = 230.0;

/**
 * Fetch recent power readings from ESP32
 */
export async function fetchReadings(limit = 50) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/arduino-data?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return data.data || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching readings:', error);
    return [];
  }
}

/**
 * Fetch current relay state
 */
export async function fetchRelayState() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/relay-control`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.status || 'off';
  } catch (error) {
    console.error('Error fetching relay state:', error);
    return 'off';
  }
}

/**
 * Control relay (turn ON or OFF)
 */
export async function controlRelay(command) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/relay-control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error controlling relay:', error);
    return false;
  }
}

/**
 * Fetch electricity prices from REE API
 */
export async function fetchElectricityPrices(date) {
  try {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const response = await fetch(`${API_BASE_URL}/api/electricity-prices?date=${dateStr}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return {
        prices: data.data || [],
        source: data.source || 'fallback',
      };
    }
    return { prices: [], source: 'fallback' };
  } catch (error) {
    console.error('Error fetching prices:', error);
    return { prices: [], source: 'fallback' };
  }
}

export { STANDARD_VOLTAGE };

