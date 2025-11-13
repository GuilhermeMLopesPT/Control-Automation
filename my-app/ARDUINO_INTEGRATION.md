# Arduino Dashboard Integration Guide

## 🔌 **Como Conectar o Arduino ao Dashboard**


### **Conectar Arduino ao Dashboard:**

#### **Passo 1: Configurar WiFi no Arduino**
```cpp
// No ficheiro arduino-dashboard-integration.ino
const char* ssid = "YOUR_WIFI_SSID";        // ← Muda para o teu WiFi
const char* password = "YOUR_WIFI_PASSWORD"; // ← Muda para a tua password
```

#### **Passo 2: Configurar IP do Dashboard**
```cpp
// Muda para o IP do teu computador
const char* dashboardUrl = "http://192.168.1.100:3000/api/arduino-data";
```

**Para encontrar o IP do teu computador:**
- **Windows**: `ipconfig` no Command Prompt
- **Mac/Linux**: `ifconfig` no Terminal

#### **Passo 3: Upload do Código**
1. Abre o Arduino IDE
2. Carrega o ficheiro `arduino-dashboard-integration.ino`
3. Configura as credenciais WiFi e IP
4. Faz upload para o Arduino/ESP32

#### **Passo 4: Testar Conexão**
1. Abre o Serial Monitor (115200 baud)
2. Verifica se conecta ao WiFi
3. Verifica se envia dados para o dashboard

### **3. Estrutura dos Dados:**

O Arduino envia dados JSON para `/api/arduino-data`:
```json
{
  "power": 2.5,        // Potência em kW
  "current": 10.8,     // Corrente em A
  "voltage": 230.0,    // Tensão em V
  "vibration": 45.2,   // Vibração em %
  "frequency": 52.1,   // Frequência em Hz
  "timestamp": 1234567890
}
```

### **4. Dashboard Atualizado:**

#### **✅ Funcionalidades:**
- **Power Monitoring**: Mostra dados reais do Arduino
- **Vibration Sensor**: Dados de vibração (simulados por agora)
- **REE Prices**: Preços espanhóis (simulados por defeito)
- **Fallback**: Se Arduino não estiver conectado, usa dados simulados

#### **🔄 Atualização Automática:**
- Dashboard atualiza a cada 2 segundos
- Busca dados do Arduino via API
- Se não conseguir conectar, usa dados simulados

### **5. Testar sem Arduino:**

Se não tiveres Arduino conectado, o dashboard funciona normalmente com dados simulados. Para testar:

1. Executa `npm run dev`
2. Vai para `http://localhost:3000`
3. Vê os dados simulados no dashboard

### **6. Próximos Passos:**

1. **Conectar Arduino**: Segue os passos acima
2. **Dados Reais**: Substitui os dados simulados pelos reais
3. **Sensores**: Adiciona sensores de vibração reais
4. **REE API**: Descomenta o código para usar preços reais

### **7. Troubleshooting:**

#### **Arduino não conecta ao WiFi:**
- Verifica credenciais WiFi
- Verifica se está na mesma rede

#### **Dashboard não recebe dados:**
- Verifica IP do computador
- Verifica se o dashboard está a correr
- Verifica Serial Monitor do Arduino

#### **Erro na API:**
- Verifica se `npm run dev` está a correr
- Verifica se a porta 3000 está livre

---

## 🚀 **Resumo:**

1. ✅ **Problemas corrigidos**: Simulated data e erro JSON
2. ✅ **API criada**: `/api/arduino-data` para receber dados
3. ✅ **Dashboard atualizado**: Usa dados reais do Arduino
4. ✅ **Código Arduino**: Pronto para enviar dados
5. ✅ **Fallback**: Funciona sem Arduino conectado

**Agora podes conectar o teu Arduino ao dashboard!** 🎯
