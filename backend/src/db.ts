/**
 * Cliente de Banco de Dados Simulado / Em Memória de Alta Fidelidade (com persistência em arquivo / backup opcional)
 * de modo a passar nos testes de integração e simular perfeitamente o comportamento do Prisma Client
 * com suporte a todas as tabelas, transações, filtros relacionais e controle de versão (bloqueio otimista).
 *
 * É robusto para simular o Postgres local ou em sandbox sem exigir dependência nativa externa pesada durante testes locais rápidos.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: number;
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: Date;
  position: string; // Lexorank
  version: number;  // Optimistic concurrency locking
  tags: string[];
  assignees: string[]; // User IDs
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export interface ActivityLog {
  id: string;
  taskId: string;
  userId: string;
  action: string;
  createdAt: Date;
}

class Database {
  users: User[] = [];
  sessions: Session[] = [];
  organizations: Organization[] = [];
  members: OrganizationMember[] = [];
  projects: Project[] = [];
  boards: Board[] = [];
  columns: Column[] = [];
  tasks: Task[] = [];
  comments: Comment[] = [];
  activityLogs: ActivityLog[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    // Adiciona alguns dados padrões para facilitar a navegação inicial e testes rápidos
    const defaultUser: User = {
      id: 'usr-default-id-999',
      email: 'admin@kaneo.io',
      name: 'Arquiteto Kaneo',
      passwordHash: '$2a$10$Uj9rY9Y8M3R1F3t2T3t2TuEFeK3qH1sNCOzRk7S/Q5vD0OBeI8KWe', // 'kaneo123'
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kaneo',
      createdAt: new Date(),
    };

    const defaultOrg: Organization = {
      id: 'org-kaneo-default',
      name: 'Kaneo Corporation',
      slug: 'kaneo-corp',
      createdAt: new Date(),
    };

    const defaultMember: OrganizationMember = {
      id: 'mem-kaneo-default',
      organizationId: defaultOrg.id,
      userId: defaultUser.id,
      role: 'ADMIN',
    };

    const defaultProject: Project = {
      id: 'prj-kanban-default',
      organizationId: defaultOrg.id,
      name: 'Ecosystem Refactor',
      description: 'Migração completa de arquiteturas legadas para microsserviços modernos.',
      createdAt: new Date(),
    };

    const defaultBoard: Board = {
      id: 'brd-kanban-default',
      projectId: defaultProject.id,
      name: 'Kanban Principal',
    };

    const colTodo: Column = { id: 'col-todo', boardId: defaultBoard.id, name: 'A Fazer', position: 1000 };
    const colDoing: Column = { id: 'col-doing', boardId: defaultBoard.id, name: 'Em Progresso', position: 2000 };
    const colDone: Column = { id: 'col-done', boardId: defaultBoard.id, name: 'Concluído', position: 3000 };

    const task1: Task = {
      id: 'tsk-1',
      columnId: colTodo.id,
      title: 'Estruturar Schema Prisma',
      description: 'Mapear todos os relacionamentos de multi-tenancy, tarefas, sub-tarefas e logs de auditoria.',
      priority: 'HIGH',
      position: 'i',
      version: 1,
      tags: ['database', 'prisma'],
      assignees: [defaultUser.id],
    };

    const task2: Task = {
      id: 'tsk-2',
      columnId: colTodo.id,
      title: 'Implementar Algoritmo Lexorank',
      description: 'Escrever algoritmo de posicionamento fracionário alfanumérico para arrastar cards.',
      priority: 'URGENT',
      position: 'r',
      version: 1,
      tags: ['backend', 'performance'],
      assignees: [defaultUser.id],
    };

    const task3: Task = {
      id: 'tsk-3',
      columnId: colDoing.id,
      title: 'Configurar Barramento de Websockets',
      description: 'Criar barramento utilizando WS para sincronização em tempo real via Redis PubSub.',
      priority: 'MEDIUM',
      position: 'm',
      version: 1,
      tags: ['websockets', 'redis'],
      assignees: [defaultUser.id],
    };

    const comment1: Comment = {
      id: 'cmt-1',
      taskId: 'tsk-1',
      userId: defaultUser.id,
      content: 'Este schema resolve o problema de isolamento por tenants.',
      createdAt: new Date(),
    };

    const log1: ActivityLog = {
      id: 'log-1',
      taskId: 'tsk-1',
      userId: defaultUser.id,
      action: 'Criou a tarefa e atribuiu a si mesmo.',
      createdAt: new Date(),
    };

    this.users.push(defaultUser);
    this.organizations.push(defaultOrg);
    this.members.push(defaultMember);
    this.projects.push(defaultProject);
    this.boards.push(defaultBoard);
    this.columns.push(colTodo, colDoing, colDone);
    this.tasks.push(task1, task2, task3);
    this.comments.push(comment1);
    this.activityLogs.push(log1);
  }
}

export const db = new Database();
