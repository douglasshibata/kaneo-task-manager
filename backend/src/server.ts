import express, { Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import http from 'http';
import { db } from './db';
import { authenticateToken, requireOrgRole, AuthenticatedRequest } from './middleware/auth';
import { calculateLexorank } from './utils/lexorank';
import { initWebSocketServer, broadcastToProject } from './websocket';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('❌ ERRO CRÍTICO: Variável de ambiente JWT_SECRET não foi configurada em ambiente de produção!');
}
const SECRET_KEY = JWT_SECRET || 'kaneo_fallback_development_secret_only';

// ----------------------------------------------------
// 1. ROTAS DE AUTENTICAÇÃO (Sem autenticação prévia)
// ----------------------------------------------------

/**
 * Registro de novos usuários
 */
app.post('/api/auth/register', (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const userExists = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (userExists) {
    return res.status(400).json({ error: 'E-mail já cadastrado' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = {
    id: 'usr-' + Math.random().toString(36).substr(2, 9),
    email: email.toLowerCase(),
    name,
    passwordHash,
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    createdAt: new Date(),
  };

  db.users.push(newUser);

  // Cria organização padrão para o novo usuário
  const newOrg = {
    id: 'org-' + Math.random().toString(36).substr(2, 9),
    name: `Minha Organização`,
    slug: `org-${newUser.id}`,
    createdAt: new Date(),
  };

  db.organizations.push(newOrg);

  db.members.push({
    id: 'mem-' + Math.random().toString(36).substr(2, 9),
    organizationId: newOrg.id,
    userId: newUser.id,
    role: 'ADMIN',
  });

  const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, SECRET_KEY, {
    expiresIn: '7d',
  });

  return res.status(201).json({
    token,
    user: { id: newUser.id, email: newUser.email, name: newUser.name, avatarUrl: newUser.avatarUrl },
    organization: newOrg,
  });
});

/**
 * Login
 */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET_KEY, {
    expiresIn: '7d',
  });

  // Busca a primeira organização do usuário para retornar ao login
  const membership = db.members.find((m) => m.userId === user.id);
  const organization = membership ? db.organizations.find((o) => o.id === membership.organizationId) : null;

  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    organization,
  });
});

// ----------------------------------------------------
// 2. ROTAS PROTEGIDAS POR AUTENTICAÇÃO E TENANT (RBAC)
// ----------------------------------------------------

/**
 * Obter organizações associadas ao usuário logado
 */
app.get('/api/organizations', authenticateToken, (req: AuthenticatedRequest, res) => {
  const userMemberships = db.members.filter((m) => m.userId === req.user?.id);
  const orgs = db.organizations.filter((o) => userMemberships.some((m) => m.organizationId === o.id));
  return res.json(orgs);
});

/**
 * Projetos da Organização
 */
app.get('/api/organizations/:orgId/projects', authenticateToken, requireOrgRole('VIEWER'), (req: AuthenticatedRequest, res) => {
  const projects = db.projects.filter((p) => p.organizationId === req.organizationId);
  return res.json(projects);
});

app.post('/api/organizations/:orgId/projects', authenticateToken, requireOrgRole('MEMBER'), (req: AuthenticatedRequest, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'O nome do projeto é obrigatório' });
  }

  const newProject = {
    id: 'prj-' + Math.random().toString(36).substr(2, 9),
    organizationId: req.organizationId!,
    name,
    description,
    createdAt: new Date(),
  };

  db.projects.push(newProject);

  // Cria um board padrão e colunas para esse projeto
  const newBoard = {
    id: 'brd-' + Math.random().toString(36).substr(2, 9),
    projectId: newProject.id,
    name: 'Quadro Principal',
  };
  db.boards.push(newBoard);

  db.columns.push(
    { id: 'col-' + Math.random().toString(36).substr(2, 9), boardId: newBoard.id, name: 'A Fazer', position: 1000 },
    { id: 'col-' + Math.random().toString(36).substr(2, 9), boardId: newBoard.id, name: 'Em Progresso', position: 2000 },
    { id: 'col-' + Math.random().toString(36).substr(2, 9), boardId: newBoard.id, name: 'Concluído', position: 3000 }
  );

  return res.status(201).json(newProject);
});

/**
 * Obter o Quadro (Board) de um Projeto com todas as Colunas e Tarefas (Ordenadas por Lexorank)
 */
app.get('/api/organizations/:orgId/projects/:projectId/board', authenticateToken, requireOrgRole('VIEWER'), (req: AuthenticatedRequest, res) => {
  const board = db.boards.find((b) => b.projectId === req.params.projectId);
  if (!board) {
    return res.status(404).json({ error: 'Quadro de projeto não encontrado' });
  }

  const columns = db.columns
    .filter((c) => c.boardId === board.id)
    .sort((a, b) => a.position - b.position);

  const enrichedColumns = columns.map((col) => {
    const tasks = db.tasks
      .filter((t) => t.columnId === col.id)
      // Ordenação léxica string-based (Lexorank)
      .sort((a, b) => a.position.localeCompare(b.position));
    return {
      ...col,
      tasks,
    };
  });

  return res.json({
    board,
    columns: enrichedColumns,
  });
});

/**
 * Criar Nova Tarefa
 */
app.post('/api/organizations/:orgId/tasks', authenticateToken, requireOrgRole('MEMBER'), (req: AuthenticatedRequest, res) => {
  const { columnId, title, description, priority, tags, assignees } = req.body;

  if (!columnId || !title) {
    return res.status(400).json({ error: 'Campos columnId e title são obrigatórios' });
  }

  // Busca tarefas na coluna para calcular a posição Lexorank correta (inserção no final)
  const columnTasks = db.tasks
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.position.localeCompare(b.position));

  const lastTask = columnTasks[columnTasks.length - 1];
  const nextPosition = calculateLexorank(lastTask ? lastTask.position : null, null);

  const newTask = {
    id: 'tsk-' + Math.random().toString(36).substr(2, 9),
    columnId,
    title,
    description: description || '',
    priority: priority || 'MEDIUM',
    position: nextPosition,
    version: 1,
    tags: tags || [],
    assignees: assignees || [],
  };

  db.tasks.push(newTask);

  // Envia log de atividade
  const log = {
    id: 'log-' + Math.random().toString(36).substr(2, 9),
    taskId: newTask.id,
    userId: req.user!.id,
    action: `Criou a tarefa "${title}"`,
    createdAt: new Date(),
  };
  db.activityLogs.push(log);

  // WebSocket Broadcast de criação
  const column = db.columns.find((c) => c.id === columnId);
  if (column) {
    const board = db.boards.find((b) => b.id === column.boardId);
    if (board) {
      broadcastToProject(board.projectId, {
        type: 'TASK_UPDATED',
        projectId: board.projectId,
        data: { task: newTask, action: 'CREATE' },
      });
    }
  }

  return res.status(201).json(newTask);
});

/**
 * Movimentação e Reordenação de Tarefas (Integração com Lexorank e Controle de Concorrência Otimista)
 */
app.patch('/api/organizations/:orgId/tasks/:taskId/move', authenticateToken, requireOrgRole('MEMBER'), (req: AuthenticatedRequest, res) => {
  const { targetColumnId, prevTaskId, nextTaskId, clientVersion } = req.body;
  const taskId = req.params.taskId;

  const taskIndex = db.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }

  const task = db.tasks[taskIndex];

  // Controle de Concorrência Otimista (Bloqueio Condicional de Versão)
  if (clientVersion !== undefined && task.version !== clientVersion) {
    return res.status(409).json({
      error: 'Conflito de concorrência detectado. Outro colaborador alterou esta tarefa simultaneamente.',
      serverTask: task,
    });
  }

  // Determina os ranks vizinhos para calcular o novo rank intermediário Lexorank
  const prevTask = prevTaskId ? db.tasks.find((t) => t.id === prevTaskId) : null;
  const nextTask = nextTaskId ? db.tasks.find((t) => t.id === nextTaskId) : null;

  const newPosition = calculateLexorank(
    prevTask ? prevTask.position : null,
    nextTask ? nextTask.position : null
  );

  // Atualiza as propriedades no banco de dados e incrementa a versão da tarefa
  const oldColumnId = task.columnId;
  task.columnId = targetColumnId || task.columnId;
  task.position = newPosition;
  task.version += 1;

  // Adiciona atividade ao log
  const oldColName = db.columns.find((c) => c.id === oldColumnId)?.name || 'Desconhecida';
  const newColName = db.columns.find((c) => c.id === targetColumnId)?.name || 'Desconhecida';

  db.activityLogs.push({
    id: 'log-' + Math.random().toString(36).substr(2, 9),
    taskId: task.id,
    userId: req.user!.id,
    action: `Moveu a tarefa de "${oldColName}" para "${newColName}"`,
    createdAt: new Date(),
  });

  // Identifica o id do projeto para notificar via WebSockets
  const currentColumn = db.columns.find((c) => c.id === task.columnId);
  if (currentColumn) {
    const board = db.boards.find((b) => b.id === currentColumn.boardId);
    if (board) {
      broadcastToProject(board.projectId, {
        type: 'TASK_MOVED',
        projectId: board.projectId,
        data: {
          taskId,
          oldColumnId,
          newColumnId: task.columnId,
          position: newPosition,
          version: task.version,
          movedBy: req.user?.name,
        },
      });
    }
  }

  return res.json(task);
});

/**
 * Atualizar Atributos da Tarefa e Comentários
 */
app.patch('/api/organizations/:orgId/tasks/:taskId', authenticateToken, requireOrgRole('MEMBER'), (req: AuthenticatedRequest, res) => {
  const taskId = req.params.taskId;
  const { title, description, priority, tags, assignees } = req.body;

  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }

  task.title = title !== undefined ? title : task.title;
  task.description = description !== undefined ? description : task.description;
  task.priority = priority !== undefined ? priority : task.priority;
  task.tags = tags !== undefined ? tags : task.tags;
  task.assignees = assignees !== undefined ? assignees : task.assignees;
  task.version += 1;

  db.activityLogs.push({
    id: 'log-' + Math.random().toString(36).substr(2, 9),
    taskId: task.id,
    userId: req.user!.id,
    action: `Atualizou os atributos de "${task.title}"`,
    createdAt: new Date(),
  });

  // WebSocket Broadcast de modificação
  const col = db.columns.find((c) => c.id === task.columnId);
  if (col) {
    const board = db.boards.find((b) => b.id === col.boardId);
    if (board) {
      broadcastToProject(board.projectId, {
        type: 'TASK_UPDATED',
        projectId: board.projectId,
        data: { task, action: 'UPDATE' },
      });
    }
  }

  return res.json(task);
});

/**
 * Adicionar Comentário
 */
app.post('/api/organizations/:orgId/tasks/:taskId/comments', authenticateToken, requireOrgRole('MEMBER'), (req: AuthenticatedRequest, res) => {
  const { content } = req.body;
  const taskId = req.params.taskId;

  if (!content) {
    return res.status(400).json({ error: 'O conteúdo do comentário é obrigatório' });
  }

  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }

  const newComment = {
    id: 'cmt-' + Math.random().toString(36).substr(2, 9),
    taskId,
    userId: req.user!.id,
    content,
    createdAt: new Date(),
  };

  db.comments.push(newComment);

  // WebSocket Broadcast do comentário enriquecido com dados de usuário
  const user = db.users.find((u) => u.id === req.user!.id);
  const enrichedComment = {
    ...newComment,
    user: user ? { name: user.name, avatarUrl: user.avatarUrl } : null,
  };

  const col = db.columns.find((c) => c.id === task.columnId);
  if (col) {
    const board = db.boards.find((b) => b.id === col.boardId);
    if (board) {
      broadcastToProject(board.projectId, {
        type: 'COMMENT_ADDED',
        projectId: board.projectId,
        data: { taskId, comment: enrichedComment },
      });
    }
  }

  return res.status(201).json(enrichedComment);
});

/**
 * Obter Comentários e Histórico de Atividade
 */
app.get('/api/organizations/:orgId/tasks/:taskId/details', authenticateToken, requireOrgRole('VIEWER'), (req: AuthenticatedRequest, res) => {
  const taskId = req.params.taskId;

  const comments = db.comments
    .filter((c) => c.taskId === taskId)
    .map((c) => {
      const u = db.users.find((user) => user.id === c.userId);
      return {
        ...c,
        user: u ? { name: u.name, avatarUrl: u.avatarUrl } : null,
      };
    });

  const logs = db.activityLogs
    .filter((l) => l.taskId === taskId)
    .map((l) => {
      const u = db.users.find((user) => user.id === l.userId);
      return {
        ...l,
        user: u ? { name: u.name, avatarUrl: u.avatarUrl } : null,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return res.json({
    comments,
    logs,
  });
});

/**
 * Busca de Tarefas de Alta Performance baseada no pg_trgm (Simulação)
 */
app.get('/api/organizations/:orgId/search', authenticateToken, requireOrgRole('VIEWER'), (req: AuthenticatedRequest, res) => {
  const query = (req.query.q as string || '').toLowerCase();

  // Filtra projetos da organização
  const projects = db.projects.filter((p) => p.organizationId === req.organizationId);
  const projectIds = projects.map((p) => p.id);
  const boards = db.boards.filter((b) => projectIds.includes(b.projectId));
  const boardIds = boards.map((b) => b.id);
  const columns = db.columns.filter((c) => boardIds.includes(c.boardId));
  const columnIds = columns.map((c) => c.id);

  // Busca e filtra tarefas associadas aos trigramas/termos da pesquisa
  const tasks = db.tasks.filter((t) => {
    if (!columnIds.includes(t.columnId)) return false;
    return (
      t.title.toLowerCase().includes(query) ||
      (t.description || '').toLowerCase().includes(query) ||
      t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  return res.json(tasks);
});

// Inicialização dos serviços HTTP e WebSocket conjugados na mesma porta
initWebSocketServer(server);

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 Servidor Kaneo API rodando na porta ${PORT}`);
    console.log(`🔌 WebSocket Gateway ativo e integrado.`);
  });
}

export { app, server };
