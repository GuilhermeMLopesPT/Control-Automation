# Smart Meter

A simple and clean power consumption monitoring application with Spanish electricity market prices integration.

## Features

- **Real-time Power Monitoring**: Monitor your power consumption in real-time with accurate measurements
- **Current & Voltage Display**: View current and voltage readings alongside power consumption
- **Vibration Sensor**: Monitor vibration levels and frequency analysis
- **Spanish Electricity Prices**: View current Spanish electricity market prices from REE
- **Direct Dashboard Access**: No authentication required - direct access to monitoring
- **Simple Interface**: Clean, intuitive design focused on essential functionality

## Technology Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS with custom blue theme
- **API**: Spanish REE (Red Eléctrica de España) electricity prices API
- **Database**: Supabase (PostgreSQL) - optional for data storage

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd my-app
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Dashboard Features

### Power Monitoring Tab
- Real-time power consumption display (kW)
- Current and voltage readings (A, V)
- Historical power and current charts
- Cost calculation per hour

### Vibration Sensor Tab
- Vibration level monitoring (0-100%)
- Frequency analysis (Hz)
- Historical vibration data charts

### REE Prices Tab
- Spanish electricity market prices
- Hourly price breakdown
- Peak, valley, and flat period identification

## API Endpoints

- `GET /api/electricity-prices`: Get Spanish electricity prices for a specific date

## Hardware Integration

The application is designed to work with:
- Current Transformers (CT) for power measurement
- ADS1115 ADC for analog-to-digital conversion
- Arduino or similar microcontroller for data collection
- Vibration sensors for mechanical monitoring

## Data Simulation

Currently, the application uses simulated data for demonstration purposes:
- Power readings update every 2 seconds
- Vibration data simulates realistic patterns
- All data is generated client-side for immediate testing

## Database Integration (Optional)

If you want to store real data, you can:
1. Set up a Supabase project
2. Run the SQL schema from `smart-meter-schema.sql`
3. Configure environment variables for database connection

## Usage

1. **Direct Access**: Open the application and go straight to the dashboard
2. **Power Monitoring**: View real-time power consumption and electrical parameters
3. **Vibration Analysis**: Monitor vibration levels and frequency patterns
4. **Electricity Prices**: Check current Spanish electricity market prices

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.