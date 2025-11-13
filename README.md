# Control-Automation

## Sistema de Monitorização de Corrente RMS com ESP32 e Dashboard Next.js

Este projeto integra um ESP32 que mede corrente RMS usando um transformador de corrente (CT) com um dashboard Next.js para visualização em tempo real.

## Estrutura do Projeto

- **`code.ino`** - Código Arduino/ESP32 que mede corrente RMS usando ADS1115
- **`data_extraction.py`** - Script Python que lê dados do ESP32 via serial e envia para a API Next.js
- **`my-app/`** - Aplicação Next.js com dashboard para visualização de dados

## Como Usar

### 1. Configurar o ESP32

1. Carrega o código `code.ino` para o ESP32
2. O ESP32 envia dados no formato: `I_RMS_avg_5s (A): 0.0016` a cada 5 segundos

### 2. Configurar o Script Python

1. Edita `data_extraction.py` se necessário:
   - `SERIAL_PORT = 'COM8'` - Muda para a tua porta COM
   - `API_URL = "http://localhost:3000/api/arduino-data"` - URL da API Next.js
   - `STANDARD_VOLTAGE = 230.0` - Tensão padrão (230V para Portugal/Espanha)

2. Executa o script:
   ```bash
   python data_extraction.py
   ```

### 3. Iniciar o Dashboard Next.js

1. Navega para a pasta `my-app`:
   ```bash
   cd my-app
   ```

2. Instala dependências (se ainda não instalaste):
   ```bash
   npm install
   ```

3. Inicia o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Abre o browser em: `http://localhost:3000/dashboard`

## Fluxo de Dados

1. **ESP32** → Mede corrente RMS e envia via Serial (COM8)
2. **Python Script** → Lê dados do serial, calcula potência (P = V × I), e envia para API Next.js
3. **Next.js API** → Recebe dados via POST `/api/arduino-data`
4. **Dashboard** → Mostra dados em tempo real (atualiza a cada 2 segundos)

## Formato dos Dados

O script Python envia para a API:
```json
{
  "power": 0.368,        // Potência em kW (calculada: V × I / 1000)
  "current": 0.0016,     // Corrente RMS em A (do ESP32)
  "voltage": 230.0,      // Tensão em V (assumida constante)
  "timestamp": "2024-01-15T14:30:25.123456"
}
```

## Troubleshooting

### Porta COM não disponível
- Fecha o Serial Monitor do Arduino IDE
- Verifica qual porta COM está a usar: Device Manager (Windows)

### API não recebe dados
- Verifica se o Next.js está a correr (`npm run dev`)
- Verifica se a URL da API está correta em `data_extraction.py`
- Verifica o console do Next.js para erros

### Dados não aparecem no dashboard
- Verifica se o script Python está a enviar dados (vê o output do script)
- Verifica o console do browser (F12) para erros
- O dashboard atualiza a cada 2 segundos automaticamente