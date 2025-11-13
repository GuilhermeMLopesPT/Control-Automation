# Configuração Wireless - ESP32 para Next.js

Este guia explica como configurar o ESP32 para enviar dados diretamente via WiFi, eliminando a necessidade do script Python e do cabo USB.

## 📋 Pré-requisitos

1. ESP32 com WiFi
2. ESP32 e computador na mesma rede WiFi
3. Next.js a correr no computador

## 🔧 Passo 1: Configurar Hotspot do iPhone (Recomendado para eduroam)

Se estiveres numa rede complicada como eduroam, podes usar o hotspot do iPhone:

1. **iPhone**: Settings → Personal Hotspot → On
2. **Anota o nome da rede** (SSID) e **password**
3. **Conecta o teu computador** ao hotspot do iPhone também
4. **Vantagem**: Mais simples, sem autenticação especial

### Encontrar o IP do teu computador

**Quando conectado ao hotspot do iPhone**, o IP geralmente é `172.20.10.x`:

### Windows:
```bash
ipconfig
```
Procura por "IPv4 Address" na interface do hotspot (exemplo: `172.20.10.2`)

### Mac/Linux:
```bash
ifconfig
```
Procura por "inet" na interface do hotspot (exemplo: `172.20.10.2`)

**Nota**: Se estiveres numa rede normal (não hotspot), o IP pode ser `192.168.1.x` ou `192.168.0.x`

## 🔧 Passo 2: Configurar o Next.js para aceitar conexões da rede local

Por padrão, o Next.js só aceita conexões de `localhost`. Para aceitar conexões da rede local:

1. Edita `my-app/package.json` e modifica o script `dev`:
```json
"scripts": {
  "dev": "next dev -H 0.0.0.0"
}
```

Ou executa diretamente:
```bash
cd my-app
next dev -H 0.0.0.0
```

Isto permite que o Next.js aceite conexões de qualquer IP na rede local.

## 🔧 Passo 3: Configurar o código ESP32

1. Abre `code_wireless.ino` no Arduino IDE

2. **Configura as credenciais WiFi** (linhas 20-21):
```cpp
const char* ssid = "YOUR_WIFI_SSID";           // ← Muda para o teu WiFi
const char* password = "YOUR_WIFI_PASSWORD";    // ← Muda para a tua password
```

3. **Configura o IP do servidor** (linha 25):
```cpp
const char* apiUrl = "http://172.20.10.2:3000/api/arduino-data";  // ← Muda para o IP do teu PC
```
Substitui `172.20.10.2` pelo IP que encontraste no Passo 1.

**Importante**: 
- Se usares **hotspot do iPhone**: IP geralmente é `172.20.10.2` ou `172.20.10.3`
- Se usares **WiFi normal**: IP pode ser `192.168.1.100` ou `192.168.0.100`
- **Ambos** (ESP32 e computador) devem estar na **mesma rede**!

## 🔧 Passo 4: Instalar bibliotecas necessárias (se necessário)

O código usa bibliotecas padrão do ESP32:
- `WiFi.h` - Já incluída
- `HTTPClient.h` - Já incluída
- `ArduinoJson.h` - Opcional (o código funciona sem ela usando String)

Se quiseres usar ArduinoJson (mais eficiente):
1. Arduino IDE → Sketch → Include Library → Manage Libraries
2. Procura "ArduinoJson" e instala

## 🚀 Passo 5: Upload e Teste

1. **Inicia o Next.js** (no teu computador):
```bash
cd my-app
npm run dev -H 0.0.0.0
```

2. **Faz upload do código** `code_wireless.ino` para o ESP32

3. **Abre o Serial Monitor** (115200 baud) para ver:
   - Status da conexão WiFi
   - Dados sendo enviados
   - Erros (se houver)

4. **Verifica o dashboard**: `http://localhost:3000/dashboard` ou `http://SEU_IP:3000/dashboard`

## ✅ Verificação

Se tudo estiver correto, deves ver no Serial Monitor:
```
WiFi connected!
IP address: 192.168.1.XXX
✓ Data sent successfully: Current=0.0016A, Power=0.3680kW
```

E no dashboard, os dados devem aparecer automaticamente!

## 🔍 Troubleshooting

### ESP32 não conecta ao WiFi
- Verifica SSID e password (case-sensitive!)
- Se usares hotspot do iPhone: verifica se está ligado e se o computador também está conectado
- Verifica se o ESP32 está na mesma rede que o computador
- Verifica a força do sinal WiFi
- **Eduroam**: Geralmente não funciona porque requer autenticação WPA2-Enterprise (username + password). Usa hotspot do iPhone em vez disso!

### "Connection failed" no Serial Monitor
- Verifica se o Next.js está a correr com `-H 0.0.0.0`
- Verifica se o IP no código está correto
- Verifica firewall do Windows (pode estar a bloquear a porta 3000)
- Tenta aceder ao Next.js no browser: `http://SEU_IP:3000`

### Dados não aparecem no dashboard
- Verifica os logs do Next.js (deves ver `Received Arduino data:`)
- Verifica o console do browser (F12) para erros
- Verifica se a API está a responder: `http://SEU_IP:3000/api/arduino-data`

## 📊 Vantagens da Versão Wireless

✅ **Sem cabo USB** - ESP32 pode estar em qualquer lugar da casa  
✅ **Sem script Python** - Menos componentes, mais simples  
✅ **Tempo real** - Dados enviados diretamente a cada 5 segundos  
✅ **Mais robusto** - Reconexão automática se WiFi cair  

## 🔄 Comparação

| Método | Cabo USB + Python | WiFi Direto |
|--------|-------------------|-------------|
| **Conexão** | Cabo USB (COM8) | WiFi |
| **Scripts** | Python + Next.js | Apenas Next.js |
| **Mobilidade** | Limitada | Total |
| **Complexidade** | Média | Baixa |

