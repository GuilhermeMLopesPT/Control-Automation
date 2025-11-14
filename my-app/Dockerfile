# Dockerfile para o Next.js Dashboard
# Este ficheiro define como construir a imagem Docker da aplicação

# Usa a imagem oficial do Node.js como base
FROM node:20-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os ficheiros de dependências primeiro (para cache do Docker)
COPY package.json package-lock.json* ./

# Instala as dependências
RUN npm ci --only=production

# Copia o resto do código da aplicação
COPY . .

# Expõe a porta 3000 (porta padrão do Next.js)
EXPOSE 3000

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Comando para iniciar a aplicação
CMD ["npm", "run", "start"]

