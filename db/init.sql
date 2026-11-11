-- Ativa a extensão pg_trgm para buscas de texto rápido com trigramas
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Recriação das tabelas em SQL puro correspondente ao schema Prisma
-- Isso é útil caso queira inicializar o banco sem o Prisma Client de imediato

CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- User
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Session
CREATE TABLE IF NOT EXISTS "Session" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "token" VARCHAR(255) UNIQUE NOT NULL,
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Organization
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) UNIQUE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- OrganizationMember (Multi-tenancy Link with Roles)
CREATE TABLE IF NOT EXISTS "OrganizationMember" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "role" "Role" DEFAULT 'MEMBER' NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE("organizationId", "userId")
);

-- Project
CREATE TABLE IF NOT EXISTS "Project" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Board
CREATE TABLE IF NOT EXISTS "Board" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Column (Kanban columns)
CREATE TABLE IF NOT EXISTS "Column" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "boardId" UUID NOT NULL REFERENCES "Board"("id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Task (The heart of Kaneo - using Lexorank on 'position')
CREATE TABLE IF NOT EXISTS "Task" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "columnId" UUID NOT NULL REFERENCES "Column"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "priority" "Priority" DEFAULT 'MEDIUM' NOT NULL,
    "dueDate" TIMESTAMP WITH TIME ZONE,
    "position" VARCHAR(255) NOT NULL, -- Lexorank string sorting
    "version" INTEGER DEFAULT 1 NOT NULL, -- Optimistic concurrency control
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Subtask
CREATE TABLE IF NOT EXISTS "Subtask" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "isCompleted" BOOLEAN DEFAULT FALSE NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Comment (Supports rich text / markdown)
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ActivityLog (Audit trail)
CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Relation table for Task Assignees (Many-to-Many between User and Task)
CREATE TABLE IF NOT EXISTS "_TaskAssignees" (
    "A" UUID NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
    "B" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    PRIMARY KEY ("A", "B")
);

-- ----------------------------------------------------
-- INDEXING FOR OPTIMAL HIGH-PERFORMANCE SEARCH & QUERIES
-- ----------------------------------------------------

-- Trigram GIN index for fast search-as-you-type on tasks (title & description)
CREATE INDEX IF NOT EXISTS idx_task_title_trgm ON "Task" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_task_description_trgm ON "Task" USING gin ("description" gin_trgm_ops);

-- Indexing for Multi-tenancy Isolation (Organization ID querying)
CREATE INDEX IF NOT EXISTS idx_org_member_org_user ON "OrganizationMember" ("organizationId", "userId");
CREATE INDEX IF NOT EXISTS idx_project_organization ON "Project" ("organizationId");

-- Indexing for Board Columns and Tasks reordering
CREATE INDEX IF NOT EXISTS idx_column_board ON "Column" ("boardId");
CREATE INDEX IF NOT EXISTS idx_task_column ON "Task" ("columnId");
CREATE INDEX IF NOT EXISTS idx_task_position ON "Task" ("position");
CREATE INDEX IF NOT EXISTS idx_subtask_task ON "Subtask" ("taskId");
CREATE INDEX IF NOT EXISTS idx_comment_task ON "Comment" ("taskId");
CREATE INDEX IF NOT EXISTS idx_activity_task ON "ActivityLog" ("taskId");
