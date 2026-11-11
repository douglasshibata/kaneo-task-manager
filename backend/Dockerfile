# ----------------------------------------------------
# Dockerfile para Desenvolvimento/Produção do Backend Node.js
# ----------------------------------------------------
FROM node:18-alpine

# Instala ferramentas úteis (como curl para healthchecks se necessário)
RUN apk add --no-cache libc6-compat

WORKDIR /usr/src/app

# Copia arquivos de dependência
COPY package*.json ./

# Instala as dependências incluindo pacotes de desenvolvimento
RUN npm install

# Copia o código fonte completo
COPY . .

# Expõe a porta em que a aplicação roda
EXPOSE 4000

# Script para rodar em modo de desenvolvimento com nodemon/hot-reload
CMD ["npm", "run", "dev"]
