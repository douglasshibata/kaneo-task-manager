# 📐 Arquitetura do Sistema - Kaneo Task Manager

Este documento descreve a arquitetura de alta performance, escalável e resiliente para a aplicação de Gestão de Tarefas e Projetos (inspirada no Kaneo). Ela foi projetada para lidar com colaboração em tempo real, consistência eventual, alta concorrência e buscas de milissegundos.

---

## 🗺️ 1. Diagrama de Arquitetura do Sistema (ASCII)

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

---

## 💾 2. Modelagem de Dados & Estratégia de Multi-Tenancy

O banco de dados relacional principal é o **PostgreSQL**, modelado via **Prisma ORM**. A arquitetura adota uma abordagem de **Multi-Tenancy lógico** por meio da entidade `Organization`.

### Principais Entidades e Relacionamentos
1. **User & Session:** Controla credenciais, avatares e as sessões ativas dos usuários.
2. **Organization & OrganizationMember:** Implementa o isolamento de ambientes (Tenants). Cada organização possui múltiplos membros. O acesso é governado por controle baseado em papéis (**RBAC**):
   - `ADMIN`: Permissões administrativas plenas sobre a organização, membros, faturamento, projetos e configurações.
   - `MEMBER`: Permissão para criar, modificar e comentar em tarefas de projetos em que está inserido.
   - `VIEWER`: Acesso somente leitura a quadros, cronogramas e tarefas. Não pode alterar dados.
3. **Project & Board:** Cada organização pode hospedar múltiplos projetos, e cada projeto possui um ou mais quadros (Boards).
4. **Column / Status:** Representa as colunas customizáveis do quadro Kanban (ex: "A Fazer", "Em Progresso", "Revisão", "Concluído"). Cada coluna tem uma propriedade `position` para ordenação sequencial.
5. **Task & Subtask:** Representa os cards do Kanban. Utiliza o algoritmo **Lexorank** no campo `position` para ordenação eficiente e não bloqueante. Contém tags, datas de entrega, prioridade (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) e membros assinalados.
6. **Comment & ActivityLog:** Canal de comunicação interna na tarefa e trilha de auditoria contendo data, autor e ação executada (ex: criação, movimentação, alteração de descrição).

---

## ⚡ 3. WebSocket Gateway & Sincronização em Tempo Real (RealtimeHub)

Para manter a consistência visual entre múltiplos colaboradores simultâneos sem sobrecarregar o banco de dados com polling contínuo:
1. **Salas de Projeto (Project Rooms):** Quando o usuário acessa um quadro, o frontend envia um sinal de handshake para se associar a uma "sala" WebSocket identificada por `project:{projectId}`.
2. **Redis Pub/Sub:** Com múltiplos contêineres/réplicas do servidor backend rodando sob um balanceador de carga, o Redis é utilizado como barramento Pub/Sub. Quando o `Servidor A` recebe uma movimentação de tarefa via HTTP/REST, ele publica o evento no Redis, e todos os demais servidores assinados recebem a notificação e propagam para os seus clientes conectados naquela sala específica.
3. **Tipos de Eventos Publicados:**
   - `TASK_MOVED`: Card reordenado ou trocado de coluna.
   - `TASK_UPDATED`: Edição em tempo real de título, prioridade, prazos ou descrição.
   - `COMMENT_ADDED`: Novas discussões injetadas imediatamente no modal de detalhes sem atualizar a página.

---

## 🛡️ 4. Prevenção de Race Conditions & Consistência de Dados

Quando dois ou mais usuários manipulam a mesma tarefa de forma concorrente (ex: mover a mesma tarefa para colunas diferentes ou alterar o título ao mesmo tempo), adotamos duas abordagens integradas:

### A. Controle de Concorrência Otimista (Frontend)
O cliente atualiza o estado visual instantaneamente (reordena o card na tela imediatamente após o drop) para oferecer latência zero perceptível. Caso a requisição HTTP backend falhe (ex: devido a falha de permissão, rede ou conflito), o frontend reverte visualmente a alteração para a posição original de forma suave, disparando um toast de alerta ao usuário.

### B. Bloqueio Otimista / Controle de Versão (Backend)
Cada entidade `Task` possui um campo `version` (inteiro auto-incrementado).
- Ao atualizar ou mover uma tarefa, o frontend envia a versão que estava visualizando (`version`).
- O banco executa um update condicional:
  ```sql
  UPDATE "Task" SET "columnId" = $1, "position" = $2, "version" = "version" + 1
  WHERE "id" = $3 AND "version" = $4;
  ```
- Se nenhuma linha for afetada (`affectedRows === 0`), significa que outro usuário alterou a tarefa primeiro. O backend rejeita a transação com erro HTTP `409 Conflict`, forçando o frontend do segundo usuário a recarregar o estado mais recente.

---

## 🚀 5. Performance, Indexação & Algoritmos Chave

### A. Algoritmo Lexorank (Posições Fracionárias)
O reordenamento tradicional de cards exige re-escrever o índice de posição de todas as tarefas subsequentes da coluna (ex: mover o primeiro item para o segundo exige atualizar as posições $2 \to 3$, $3 \to 4$, etc., gerando operações de escrita quadráticas $O(N)$ no banco).
O **Lexorank** resolve isso usando representação em string alfanumérica de base arbitrária (ex: caracteres `a-z`).
- Para inserir um card entre as posições `"a"` e `"c"`, o algoritmo calcula o ponto médio lexográfico, que é `"b"`.
- Para inserir entre `"b"` e `"c"`, calcula-se `"bm"`.
- Desse modo, o custo de reordenação é **sempre $O(1)$**, alterando unicamente o card que sofreu drag-and-drop.
- **Auto-Balanciamento:** Se o comprimento de uma chave Lexorank crescer demais (ex: aproximação contínua como `"aaaaab"`), um job em segundo plano ou trigger re-espaça uniformemente as posições de toda a coluna para valores curtos.

### B. Busca Rápida com `pg_trgm` (PostgreSQL GIN Indexes)
Para realizar pesquisas textuais de alta velocidade sobre títulos, descrições e tags sem recorrer a soluções pesadas como Elasticsearch em estágios iniciais:
- Habilitamos a extensão `pg_trgm` (Postgres Trigram) no schema.
- Criamos um índice **GIN (Generalized Inverted Index)** multivariado sobre as colunas pesquisáveis:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_task_search_trgm ON "Task" USING gin (title gin_trgm_ops, description gin_trgm_ops);
  ```
- Isso garante buscas parciais instantâneas (tipo *search-as-you-type*) com operadores de similaridade `LIKE`, `ILIKE` ou `%` para milhares de registros.

### C. Estratégia de Paginação & Cursor-Based Infinite Scroll
Quadros e listas contendo centenas de tarefas podem degradar a performance de renderização do DOM e aumentar o payload de tráfego.
- **Cursor-based Pagination:** Em vez de usar offsets tradicionais (que causam lentidão em datasets gigantescos e itens duplicados durante inserções dinâmicas), a API adota paginação baseada em cursor. O cliente envia o `id` da última tarefa carregada e o backend busca as próximas $N$ tarefas onde `position > last_position`.
- **Renderização Virtualizada:** No frontend, as listas longas de tarefas utilizam virtualização do DOM (ex: `react-window` ou similar) para renderizar em tela apenas os cards visíveis na viewport, preservando FPS de 60fps no scroll.
