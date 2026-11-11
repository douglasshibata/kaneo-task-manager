export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  position: string; // Lexorank
  version: number;
  tags: string[];
  assignees: string[]; // User IDs
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: {
    name: string;
    avatarUrl?: string;
  } | null;
}

export interface ActivityLog {
  id: string;
  taskId: string;
  userId: string;
  action: string;
  createdAt: string;
  user: {
    name: string;
    avatarUrl?: string;
  } | null;
}
