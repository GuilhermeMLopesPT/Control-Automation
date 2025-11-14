# 🐳 Docker Setup - Guia de Instalação

Este guia explica como usar Docker para executar o dashboard Next.js.

## 📋 Pré-requisitos

1. **Instalar Docker Desktop**:
   - Windows: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
   - Mac: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
   - Linux: `sudo apt-get install docker.io docker-compose`

2. Verificar instalação:
   ```bash
   docker --version
   docker-compose --version
   ```

## 🚀 Como Usar

### Opção 1: Docker Compose (Recomendado)

1. **Construir e iniciar o container**:
   ```bash
   docker-compose up -d
   ```
   O `-d` executa em background (detached mode).

2. **Ver logs**:
   ```bash
   docker-compose logs -f dashboard
   ```

3. **Parar o container**:
   ```bash
   docker-compose down
   ```

4. **Reconstruir após mudanças**:
   ```bash
   docker-compose up -d --build
   ```

### Opção 2: Docker Manual

1. **Construir a imagem**:
   ```bash
   cd my-app
   docker build -t smart-meter-dashboard .
   ```

2. **Executar o container**:
   ```bash
   docker run -d -p 3000:3000 --name dashboard smart-meter-dashboard
   ```

3. **Ver logs**:
   ```bash
   docker logs -f dashboard
   ```

4. **Parar o container**:
   ```bash
   docker stop dashboard
   docker rm dashboard
   ```

## 🌐 Aceder ao Dashboard

Após iniciar o container, o dashboard estará disponível em:
- **Local**: http://localhost:3000
- **Rede local**: http://SEU_IP:3000

## ⚙️ Configuração para ESP32

Para o ESP32 conseguir comunicar com o dashboard em Docker:

1. **Encontrar o IP do teu PC**:
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```

2. **Atualizar o código do ESP32** (`code_wireless.ino`):
   ```cpp
   const char* apiUrl = "http://SEU_IP:3000/api/arduino-data";
   const char* relayControlUrl = "http://SEU_IP:3000/api/relay-control";
   ```

3. **Garantir que o Docker expõe a porta corretamente**:
   - O `docker-compose.yml` já mapeia a porta 3000
   - Se necessário, podes mudar para outra porta: `"8080:3000"`

## 🔧 Comandos Úteis

```bash
# Ver containers em execução
docker ps

# Ver todas as imagens
docker images

# Limpar containers parados
docker container prune

# Limpar imagens não usadas
docker image prune

# Ver uso de recursos
docker stats
```

## 📝 Notas Importantes

1. **Desenvolvimento vs Produção**:
   - Para desenvolvimento, usa `npm run dev` normalmente
   - Para produção/deploy, usa Docker

2. **Variáveis de Ambiente**:
   - Cria um ficheiro `.env` se precisares de variáveis de ambiente
   - Adiciona ao `docker-compose.yml` se necessário

3. **Dados Persistidos**:
   - Os dados em memória (medidas do ESP32) são perdidos quando o container para
   - Para persistência, considera usar uma base de dados (PostgreSQL, MongoDB, etc.)

## 🚢 Deploy em Servidor

Para fazer deploy num servidor (VPS, AWS, etc.):

1. **Copiar os ficheiros** para o servidor
2. **Instalar Docker** no servidor
3. **Executar** `docker-compose up -d`
4. **Configurar firewall** para permitir porta 3000

## ❓ Troubleshooting

**Porta já em uso**:
```bash
# Ver o que está a usar a porta 3000
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Mac/Linux

# Mudar porta no docker-compose.yml
ports:
  - "8080:3000"
```

**Container não inicia**:
```bash
# Ver logs detalhados
docker-compose logs dashboard

# Reconstruir do zero
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

