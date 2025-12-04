# Smart Meter Dashboard - Next.js + Flask API

Sistema completo de monitoramento de energia em tempo real com ESP32, Flask API e dashboard Next.js.

## 📋 Arquitetura

```
ESP32 (code_wireless.ino)
    ↓ HTTP POST
Flask API (api_server.py) ← Porta 5000
    ↓ HTTP GET/POST
Next.js Dashboard (npm run dev) ← Porta 3000
```

## 🚀 Como Usar

### 1. Instalar dependências Python (Flask API)

```bash
pip install -r requirements.txt
```

### 2. Instalar dependências Node.js (Next.js)

```bash
npm install
```

### 3. Iniciar o sistema

**Terminal 1 - Flask API:**
```bash
python api_server.py
```

**Terminal 2 - Next.js Dashboard:**
```bash
npm run dev
```

### 4. Acessar

- **Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **API Health:** [http://localhost:5000/health](http://localhost:5000/health)

## ⚙️ Configuração ESP32

No arquivo `code_wireless.ino`, configure:

1. **WiFi:**
```cpp
const char* ssid = "SEU_WIFI";
const char* password = "SUA_SENHA";
```

2. **IP do computador:**
```cpp
const char* apiUrl = "http://SEU_IP:5000/api/arduino-data";
const char* relayControlUrl = "http://SEU_IP:5000/api/relay-control";
```

Para descobrir seu IP:
- Windows: `ipconfig` (procure por "IPv4 Address")
- Mac/Linux: `ifconfig`

## 📁 Estrutura do Projeto

```
├── api_server.py          # Flask API (ESSENCIAL - recebe dados do ESP32)
├── code_wireless.ino      # Código ESP32
├── requirements.txt       # Dependências Python
├── package.json           # Dependências Node.js
├── lib/
│   └── api.js            # Cliente API para Next.js
├── components/            # Componentes React
├── pages/                 # Páginas Next.js
└── styles/               # Estilos
```

## ⚠️ Importante

**O `api_server.py` é ESSENCIAL!** Ele:
- Recebe dados do ESP32 via HTTP POST
- Fornece dados para o dashboard Next.js via HTTP GET
- Controla o relay através do ESP32
- Busca preços REE da API espanhola

**Sem o `api_server.py`, o sistema não funciona!**

## 🔧 Troubleshooting

**Dashboard não carrega dados:**
- Verifique se `api_server.py` está rodando na porta 5000
- Verifique se o ESP32 está conectado e enviando dados
- Verifique o console do navegador para erros

**ESP32 não conecta:**
- Verifique se o IP no código está correto
- Verifique se o Flask API está rodando
- Verifique a conexão WiFi do ESP32

**Relay não funciona:**
- Verifique se o ESP32 está recebendo comandos (Serial Monitor)
- Verifique se o pin está correto no código (GPIO 2 = D0)

