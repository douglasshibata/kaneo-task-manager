# ----------------------------------------------------
# Dockerfile para o Frontend React / TypeScript
# ----------------------------------------------------
FROM node:18-alpine

WORKDIR /usr/src/app

# Copia arquivos de definição de dependência
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todos os fontes do frontend
COPY . .

# Expõe a porta do servidor de desenvolvimento React (CRA / Vite)
EXPOSE 3000

# Inicia o servidor de desenvolvimento com hot-reload ativo
CMD ["npm", "start"]
