# 📋 Kaneo Task Manager

[![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20TypeScript%20%7C%20Prisma%20%7C%20Postgres-blue)](#)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)](#)
[![Security](https://img.shields.io/badge/Security-RBAC%20%26%20WAF-orange)](#)

O **Kaneo Task Manager** é uma plataforma de nível enterprise para gestão colaborativa de tarefas e projetos inspirada nas melhores práticas de quadros Kanban (como Trello e Jira). Desenvolvido com foco em alta performance, consistência eventual sob concorrência e colaboração em tempo real, o sistema resolve os principais gargalos de sincronização e concorrência comuns em ferramentas de produtividade empresarial.

A plataforma foi arquitetada para suportar o isolamento de dados de organizações de forma segura (**Multi-Tenancy lógico**), garantindo buscas de milissegundos por similaridade trigramada através do banco de dados, ordenações instantâneas de cards com custo de banco constante via algoritmo **Lexorank**, e propagação de eventos instantânea para clientes ativos por meio de uma arquitetura baseada em **WebSocket Gateways** conectados por um barramento **Redis Pub/Sub**.

---

## 📐 1. Arquitetura & Componentes Internos

### Mapeamento da Estrutura de Pastas
```text
kaneo-task-manager/
├── backend/                  # Servidor de API REST e WebSocket Gateway
│   ├── src/
│   │   ├── auth.ts           # Middlewares de JWT e RBAC baseados em Organização
│   │   ├── db.ts             # Wrapper de inicialização/fallback do banco de dados
│   │   ├── lexorank.ts       # Auxiliar de ordenamento alfanumérico O(1)
│   │   ├── server.ts         # Controladores HTTP REST Express e inicialização do servidor
│   │   └── websocket.ts      # WebSocket Gateway com multicasting por salas de projeto
│   ├── tests/                # Testes automatizados (Jest / Supertest)
│   ├── Dockerfile            # Configuração do container do Backend
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Workspace da Interface Web Single Page (React)
│   ├── src/
│   │   ├── components/       # Componentes reativos (KanbanBoard, TaskDetailModal)
│   │   ├── hooks/            # Hooks customizados para websocket auto-reconectável
│   │   ├── types/            # Tipos e Contratos TypeScript do sistema
│   │   └── index.tsx         # Ponto de entrada do Frontend
│   ├── Dockerfile            # Configuração do container do Frontend
│   ├── package.json
│   └── tailwind.config.js
├── db/
│   └── init.sql              # Script SQL inicial e ativação de índices pg_trgm GIN
├── prisma/
│   └── schema.prisma         # Modelo de dados e mapeamento objeto-relacional (ORM)
└── docker-compose.yml        # Orquestração do ecossistema local (App, DB, Redis, MinIO)
```

### Diagrama de Fluxo de Dados e Componentes
```text
                                    +-----------------------+
                                    |  Frontend Web Client  |
                                    | (React / Next.js / TS)|
                                    +-----------+-----------+
                                                |
                        +-----------------------+-----------------------+
                        | HTTP (REST API)                               | WebSocket (WS / WSS)
                        v                                               v
            +-----------------------+                       +-----------------------+
            |      API Gateway      |                       |  WebSocket Gateway    |
            |     & Load Balancer   |                       |    (RealtimeHub)      |
            +-----------+-----------+                       +-----------+-----------+
                        |                                               |
                        +-----------------------+-----------------------+
                                                | Interno
                                                v
                                    +-----------------------+
                                    |    Backend Services   |
                                    |     (Node.js / TS)    |
                                    +-----+-----+-----+-----+
                                          |     |     |
                 +------------------------+     |     +-------------------------+
                 | PostgreSQL Client            | Redis Pub/Sub & Cache         | S3 API Client
                 v                              v                               v
    +-------------------------+    +-------------------------+    +-------------------------+
    |       PostgreSQL        |    |       Redis Cache       |    |      Object Storage     |
    | (Schemas, Relations,    |    | (Session, Pub/Sub,      |    |      (MinIO / S3)       |
    |  pg_trgm Search GIN)    |    |  Locking, Task Queues)  |    | (Attachments, Avatars)  |
    +-------------------------+    +-------------------------+    +-------------------------+
```

### Tabela de Tecnologias & Dependências

| Componente | Tecnologia | Versão Standard | Descrição / Papel no Ecossistema |
|------------|------------|-----------------|----------------------------------|
| **Runtime Backend** | Node.js (TypeScript) | v20.x | Engine principal de execução da API |
| **Framework HTTP** | Express / Fastify | ^4.19.0 | Roteamento HTTP e processamento de payloads |
| **ORM** | Prisma ORM | ^5.x | Modelagem estática, migrations e consultas relacionais |
| **Banco de Dados** | PostgreSQL | 16-alpine | Banco de dados relacional principal |
| **Cache & Pub/Sub** | Redis | 7-alpine | Cache local de sessões e barramento Pub/Sub para WS |
| **WebSockets** | `ws` package | ^8.16.0 | Gateway para atualizações de cards em tempo real |
| **Object Storage** | MinIO (S3 API) | Latest | Armazenamento persistente de anexos e avatares |
| **Framework UI** | React | ^18.2.0 | Biblioteca para construção da interface de usuário |
| **Estilização** | Tailwind CSS | ^3.4.1 | Design atômico altamente responsivo |
| **Testes** | Jest & Supertest | ^29.x | Suite de testes unitários e de integração de API |

---

## 🚀 2. Guia de Instalação & Pré-requisitos

### Pré-requisitos de Sistema
Antes de prosseguir, garanta que os seguintes softwares estão instalados na sua máquina:
* **Docker & Docker Compose** (v20.10+ / v2.0+)
* **Node.js** (v18.x ou v20.x recomendado)
* **NPM** (v9.x+) ou **Yarn**

### Passo a Passo para Instalação Local

1. **Clonar o Repositório:**
   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd kaneo-task-manager
   ```

2. **Instalar Dependências do Backend:**
   ```bash
   cd backend
   npm install
   cd ..
   ```

3. **Instalar Dependências do Frontend:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Configurar as Variáveis de Ambiente:**
   Crie os arquivos `.env` tanto na raiz do `backend/` quanto do `frontend/` com base nas instruções da seção de configuração abaixo.

---

## ⚙️ 3. Configuração & Variáveis de Ambiente

As variáveis de ambiente controlam o comportamento dos serviços. Certifique-se de configurar os segredos antes de iniciar a aplicação em ambientes produtivos.

### Configuração do Backend (`backend/.env`)

| Nome da Variável | Descrição | Valor Padrão | Obrigatória? | Sensível? |
|------------------|-----------|--------------|--------------|-----------|
| `PORT` | Porta onde a API HTTP e WS escutam | `4000` | Não | Não |
| `DATABASE_URL` | String de conexão com o PostgreSQL | `postgresql://kaneo_user:kaneo_password@postgres:5432/kaneo_db` | Sim | Sim |
| `REDIS_URL` | URL de conexão com a instância Redis | `redis://redis:6379` | Sim | Sim |
| `JWT_SECRET` | Chave criptográfica para assinatura e validação dos tokens JWT | `kaneo_super_secret_jwt_token` | Sim | Sim |
| `MINIO_ENDPOINT` | Endpoint do S3 para o storage MinIO | `minio` (ou `localhost` localmente) | Não | Não |
| `MINIO_PORT` | Porta do endpoint do MinIO | `9000` | Não | Não |
| `MINIO_ACCESS_KEY`| Usuário mestre do storage S3 | `kaneo_admin` | Sim | Sim |
| `MINIO_SECRET_KEY`| Senha do storage S3 | `kaneo_s3_password` | Sim | Sim |
| `MINIO_BUCKET` | Nome do bucket persistente padrão | `kaneo-attachments` | Não | Não |

### Configuração do Frontend (`frontend/.env`)

| Nome da Variável | Descrição | Valor Padrão | Obrigatória? | Sensível? |
|------------------|-----------|--------------|--------------|-----------|
| `REACT_APP_API_URL` | Endpoint público da API HTTP do Backend | `http://localhost:4000` | Sim | Não |
| `REACT_APP_WS_URL` | Endpoint público do WebSocket Gateway | `ws://localhost:4000` | Sim | Não |

---

## 🛠️ 4. Instruções de Execução e Uso

### Execução via Docker Compose (Recomendado - Completo)

Para provisionar o banco de dados PostgreSQL, Redis, MinIO, Backend e Frontend em uma rede isolada, use:
```bash
docker-compose up --build
```
Isso inicializará todos os serviços automaticamente, incluindo o auto-provisionamento do bucket do MinIO.

* **Frontend:** Acesse em [http://localhost:3000](http://localhost:3000)
* **Backend API:** Acesse em [http://localhost:4000](http://localhost:4000)
* **MinIO Console:** Acesse em [http://localhost:9001](http://localhost:9001)

### Execução em Modo de Desenvolvimento (Local)

1. **Subir apenas a infraestrutura auxiliar (DB + Redis + Storage):**
   ```bash
   docker-compose up -d postgres redis minio
   ```

2. **Iniciar o Backend em Modo de Observação (Hot-Reload):**
   ```bash
   cd backend
   # Executar as migrações do Prisma no banco local
   npx prisma db push
   # Rodar o servidor de desenvolvimento
   npm run dev
   ```

3. **Iniciar o Frontend:**
   ```bash
   cd frontend
   npm start
   ```

### Exemplos Práticos de Uso

#### Criar uma Nova Sessão de Usuário (Login para obter JWT)
```bash
curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@kaneo.org", "password": "securepassword123"}'
```

#### Mover uma Tarefa via REST API (Gera broadcast automático no WebSocket)
```bash
curl -X PUT http://localhost:4000/api/tasks/task-id-999/move \
     -H "Authorization: Bearer <SEU_TOKEN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"columnId": "col-inprogress-123", "position": "bi", "version": 2}'
```

---

## 🧪 5. End-to-End Testing & Qualidade

O projeto adota testes rigorosos tanto no nível de controladores/serviços de API quanto em lógica algorítmica.

### Executando Testes Unitários e de Integração (Backend)
Entre no diretório do backend e execute:
```bash
cd backend
npm test
```
Este comando executa a suite de testes baseada em **Jest** e **Supertest**, cobrindo autenticação, controle de permissões (RBAC), reordenamento com o algoritmo Lexorank e verificação de concorrência.

### Cobertura de Código
Para gerar relatórios completos de cobertura de código no backend:
```bash
npm test -- --coverage
```
Os resultados detalhados em HTML serão exportados para `backend/coverage/lcov-report/index.html`.

---

## 🛡️ 6. Aspectos de Segurança & Governança (AppSec)

A arquitetura do Kaneo foi projetada sob o princípio de **Zero-Trust** e do isolamento estrito de inquilinos (**Multi-Tenancy**):

1. **Controle de Acesso Baseado em Papéis (RBAC):**
   Toda requisição que cruza as barreiras dos serviços passa pelo middleware `auth.ts`, validando o token JWT e verificando a associação e o papel (`ADMIN`, `MEMBER`, `VIEWER`) do usuário na organização ativa. Um membro da Organização A jamais conseguirá acessar recursos da Organização B.

2. **Controle de Concorrência Otimista (Version-Locking):**
   Para evitar perda de dados por escritas sobrepostas (Race Conditions) em conexões assíncronas concorrentes, as tarefas possuem controle de versão incremental. Se duas pessoas reordenarem o mesmo card simultaneamente, apenas o primeiro a chegar ao banco persiste a alteração; o segundo é recusado com erro `409 Conflict` e orientado a mesclar o estado visual.

3. **Buscas Seguras com pg_trgm:**
   As pesquisas rápidas em banco de dados utilizam parâmetros higienizados pelo Prisma Client, blindando a query engine contra ataques de **SQL Injection** estrutural mesmo utilizando o índice GIN trigramado.

4. **Tratamento de Dados Sensíveis (Sensibilidade PII):**
   Todas as senhas de usuários são salvas após derivação criptográfica do tipo unidirecional via **Bcryptjs** com fator de custo de `10`. Tokens de autenticação expirados ou expirando são invalidados pelo middleware.

---

## 💡 7. Troubleshooting & Solução de Problemas Comuns

| Sintoma de Erro | Causa Provável | Ação Corretiva / Resolução |
|-----------------|----------------|----------------------------|
| `Database connection timed out` | O container Postgres ainda não concluiu a inicialização e aplicação de scripts de DDL | Aguarde 10 segundos ou execute `docker-compose logs postgres` para confirmar se está pronto para aceitar conexões. |
| `Redis error: connection refused` | O barramento de Pub/Sub local está inacessível ou na porta errada | Verifique se a variável `REDIS_URL` condiz com o host e a porta exposta pelo Docker Compose. Rode `docker ps` para ver o status do container Redis. |
| `409 Conflict upon card movement` | Outro usuário modificou a tarefa que você estava tentando reordenar | Atualize seu browser para sincronizar com a versão atualizada da tarefa em banco de dados e repita a ação. |
| `AWS SDK/S3 Error: Bucket Not Found` | O bucket `kaneo-attachments` não foi criado localmente no MinIO | Certifique-se de usar o docker-compose oficial que executa a configuração e provisionamento automático do bucket ou crie manualmente no console administrativo em `http://localhost:9001`. |
