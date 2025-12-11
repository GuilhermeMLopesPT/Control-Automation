/**
 * API Client for Flask Backend
 * Auto-detects API URL: localhost when on computer, IP when on mobile
 */

// Get API base URL - auto-detects if accessed from mobile or localhost
function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    // Client-side: check if we're on localhost or external IP
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    } else {
      // Accessed from mobile/other device - use same hostname but port 5000
      return `http://${hostname}:5000`;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
}

const STANDARD_VOLTAGE = 230.0;

/**
 * Fetch recent power readings from ESP32
 */
export async function fetchReadings(limit = 50) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/arduino-data?limit=${limit}`);
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
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/relay-control`);
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
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/relay-control`, {
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
    const apiUrl = getApiBaseUrl();
    const dateStr = date || new Date().toISOString().split('T')[0];
    const response = await fetch(`${apiUrl}/api/electricity-prices?date=${dateStr}`);
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

/**
 * Update equipment label for readings within a time range
 */
export async function updateEquipment(startTime, endTime = null, equipment = null) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/update-equipment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_time: startTime,
        end_time: endTime,
        equipment: equipment,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error updating equipment:', error);
    return false;
  }
}

/**
 * Save a completed measurement session
 */
export async function saveMeasurement(startTime, endTime, equipment, totalCost) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/measurements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_time: startTime,
        end_time: endTime,
        equipment: equipment,
        total_cost: totalCost,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error saving measurement:', error);
    return false;
  }
}

/**
 * Get active measurement (for syncing across devices)
 */
export async function getActiveMeasurement() {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/measurements?active_only=true`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success && data.data && data.data.length > 0) {
      return data.data[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching active measurement:', error);
    return null;
  }
}

/**
 * Create or update active measurement (for syncing across devices)
 */
export async function syncActiveMeasurement(startTime, equipment, totalCost) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/measurements/active`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_time: startTime,
        equipment: equipment,
        total_cost: totalCost,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error syncing active measurement:', error);
    return false;
  }
}

/**
 * Update active measurement cost (for real-time syncing)
 */
export async function updateActiveMeasurement(startTime, totalCost, equipment) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/measurements/active`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_time: startTime,
        total_cost: totalCost,
        equipment: equipment,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error updating active measurement:', error);
    return false;
  }
}

/**
 * Fetch measurement history
 */
export async function fetchMeasurements(limit = 50, equipment = null) {
  try {
    const apiUrl = getApiBaseUrl();
    let url = `${apiUrl}/api/measurements?limit=${limit}`;
    if (equipment) {
      url += `&equipment=${encodeURIComponent(equipment)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return data.data || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching measurements:', error);
    return [];
  }
}

/**
 * Delete a measurement session
 */
export async function deleteMeasurement(measurementId) {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/measurements/${measurementId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error deleting measurement:', error);
    return false;
  }
}

/**
 * Fetch power readings for a specific measurement (by equipment and time range)
 */
export async function fetchMeasurementReadings(equipment, startTime, endTime, limit = 10000) {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('[fetchMeasurementReadings] Request params:', {
      equipment,
      startTime,
      endTime,
      startTimeType: typeof startTime,
      endTimeType: typeof endTime
    });
    
    const params = new URLSearchParams({
      equipment: equipment,
      start_time: startTime,
      end_time: endTime,
      limit: limit.toString(),
    });
    
    const url = `${apiUrl}/api/power-readings?${params}`;
    console.log('[fetchMeasurementReadings] Request URL:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fetchMeasurementReadings] HTTP error:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }
    const data = await response.json();
    console.log('[fetchMeasurementReadings] Response:', {
      success: data.success,
      count: data.count,
      dataLength: data.data?.length || 0
    });
    
    if (data.success) {
      return data.data || [];
    }
    return [];
  } catch (error) {
    console.error('[fetchMeasurementReadings] Error:', error);
    return [];
  }
}

export { STANDARD_VOLTAGE };

