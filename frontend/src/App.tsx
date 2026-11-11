import React, { useState, useEffect, useCallback } from 'react';
import { Column, Task, Organization, Project, Comment, ActivityLog } from './types';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetailModal } from './components/TaskDetailModal';
import { useProjectSocket } from './hooks/useProjectSocket';

// Dados mockados/locais rápidos para demonstração e interação caso as rotas REST offline falhem
const LOCAL_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>({
    id: 'org-kaneo-default',
    name: 'Kaneo Corporation',
    slug: 'kaneo-corp'
  });
  const [project, setProject] = useState<Project | null>({
    id: 'prj-kanban-default',
    organizationId: 'org-kaneo-default',
    name: 'Ecosystem Refactor',
    description: 'Migração completa de arquiteturas legadas para microsserviços modernos.',
    createdAt: new Date().toISOString()
  });

  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [alertMessage, setAlertMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // ----------------------------------------------------
  // Autenticação mockada inicial automática para facilidade de uso
  // ----------------------------------------------------
  useEffect(() => {
    // Realiza um login simulado automático ou registra
    fetch(`${LOCAL_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kaneo.io', password: 'kaneo123' }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setToken(data.token);
        if (data.organization) setOrganization(data.organization);
        fetchBoard(data.token, 'org-kaneo-default', 'prj-kanban-default');
      })
      .catch(() => {
        // Se falhar o login, tenta registrar o mesmo admin@kaneo.io
        fetch(`${LOCAL_API_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@kaneo.io', name: 'Arquiteto Kaneo', password: 'kaneo123' }),
        })
          .then((res) => res.json())
          .then((data) => {
            setToken(data.token);
            if (data.organization) setOrganization(data.organization);
            fetchBoard(data.token, 'org-kaneo-default', 'prj-kanban-default');
          })
          .catch((err) => console.error('Erro na inicialização automática de credenciais do backend:', err));
      });
  }, []);

  // ----------------------------------------------------
  // Fetch das Colunas e Tarefas
  // ----------------------------------------------------
  const fetchBoard = (authToken: string, orgId: string, prjId: string) => {
    fetch(`${LOCAL_API_URL}/api/organizations/${orgId}/projects/${prjId}/board`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.columns) {
          setColumns(data.columns);
        }
      })
      .catch((err) => console.error('Erro ao buscar colunas do quadro:', err));
  };

  // ----------------------------------------------------
  // Fetch de Detalhes da Tarefa (Comentários e Histórico)
  // ----------------------------------------------------
  const fetchTaskDetails = useCallback((taskId: string) => {
    if (!token || !organization) return;
    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/tasks/${taskId}/details`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setComments(data.comments || []);
        setLogs(data.logs || []);
      })
      .catch((err) => console.error('Erro ao buscar detalhes da tarefa:', err));
  }, [token, organization]);

  // Abre detalhes quando selecionado
  useEffect(() => {
    if (selectedTask) {
      fetchTaskDetails(selectedTask.id);
    }
  }, [selectedTask, fetchTaskDetails]);

  // ----------------------------------------------------
  // WebSocket Callbacks Reativos (useProjectSocket Hook)
  // ----------------------------------------------------
  const handleWebSocketTaskMoved = useCallback((data: {
    taskId: string;
    oldColumnId: string;
    newColumnId: string;
    position: string;
    version: number;
    movedBy?: string;
  }) => {
    // Atualiza otimistamente o estado sem remontar do zero
    setColumns((prevColumns) => {
      let taskToMove: Task | null = null;

      // Localiza a tarefa a ser movida
      const updatedColumns = prevColumns.map((col) => {
        const found = col.tasks.find((t) => t.id === data.taskId);
        if (found) {
          taskToMove = { ...found, columnId: data.newColumnId, position: data.position, version: data.version };
          return {
            ...col,
            tasks: col.tasks.filter((t) => t.id !== data.taskId),
          };
        }
        return col;
      });

      if (!taskToMove) return prevColumns;

      // Insere na nova coluna e reordena lexograficamente
      return updatedColumns.map((col) => {
        if (col.id === data.newColumnId) {
          const newTasks = [...col.tasks, taskToMove!].sort((a, b) => a.position.localeCompare(b.position));
          return {
            ...col,
            tasks: newTasks,
          };
        }
        return col;
      });
    });

    if (data.movedBy) {
      setAlertMessage({ type: 'success', text: `Tarefa movida em tempo real por ${data.movedBy}!` });
      setTimeout(() => setAlertMessage(null), 3500);
    }
  }, []);

  const handleWebSocketTaskUpdated = useCallback((data: { task: any; action: string }) => {
    setColumns((prevColumns) => {
      return prevColumns.map((col) => {
        // Se for criação de tarefa
        if (data.action === 'CREATE' && col.id === data.task.columnId) {
          const exists = col.tasks.some((t) => t.id === data.task.id);
          if (exists) return col;
          const newTasks = [...col.tasks, data.task].sort((a, b) => a.position.localeCompare(b.position));
          return { ...col, tasks: newTasks };
        }

        // Se for atualização
        return {
          ...col,
          tasks: col.tasks.map((t) => (t.id === data.task.id ? data.task : t)),
        };
      });
    });

    // Se a tarefa atualmente selecionada no modal foi atualizada, sincroniza
    setSelectedTask((curr) => (curr && curr.id === data.task.id ? data.task : curr));
  }, []);

  const handleWebSocketCommentAdded = useCallback((data: { taskId: string; comment: any }) => {
    if (selectedTask && selectedTask.id === data.taskId) {
      setComments((prev) => {
        const exists = prev.some((c) => c.id === data.comment.id);
        if (exists) return prev;
        return [...prev, data.comment];
      });
    }
  }, [selectedTask]);

  // Conecta ao Socket.IO/WS Gateway via Hook Customizado
  useProjectSocket(
    project?.id,
    handleWebSocketTaskMoved,
    handleWebSocketTaskUpdated,
    handleWebSocketCommentAdded
  );

  // ----------------------------------------------------
  // OPERAÇÕES DO CONTROLADOR: MOVER, ATUALIZAR, CRIAR, COMENTAR
  // ----------------------------------------------------

  /**
   * Movimentação de tarefa com Lexorank e Controle Otimista de Concorrência
   */
  const handleMoveTask = (
    taskId: string,
    targetColumnId: string,
    prevTaskId: string | null,
    nextTaskId: string | null
  ) => {
    if (!token || !organization) return;

    // Acha a tarefa atual para enviar a versão
    let currentTask: Task | undefined;
    for (const col of columns) {
      currentTask = col.tasks.find((t) => t.id === taskId);
      if (currentTask) break;
    }

    if (!currentTask) return;

    // Atualização otimista local imediata no Frontend (Latência Zero)
    const oldColumnsState = [...columns];
    setColumns((prevColumns) => {
      let taskToMove: Task | null = null;
      const filtered = prevColumns.map((col) => {
        const found = col.tasks.find((t) => t.id === taskId);
        if (found) {
          taskToMove = { ...found, columnId: targetColumnId };
          return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
        }
        return col;
      });

      if (!taskToMove) return prevColumns;

      return filtered.map((col) => {
        if (col.id === targetColumnId) {
          const newTasks = [...col.tasks, taskToMove!];
          return { ...col, tasks: newTasks };
        }
        return col;
      });
    });

    // Envia alteração ao backend
    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/tasks/${taskId}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetColumnId,
        prevTaskId,
        nextTaskId,
        clientVersion: currentTask.version,
      }),
    })
      .then(async (res) => {
        if (res.status === 409) {
          const conflictData = await res.json();
          setAlertMessage({
            type: 'error',
            text: conflictData.error || 'Conflito de concorrência detectado.',
          });
          // Reverte o estado visual otimista
          setColumns(oldColumnsState);
          // Atualiza com a versão do servidor
          fetchBoard(token, organization.id, project!.id);
          setTimeout(() => setAlertMessage(null), 5000);
          return;
        }

        if (!res.ok) {
          throw new Error();
        }

        const updatedTask = await res.json();
        // Atualiza a posição definitiva calculada pelo Lexorank do backend
        setColumns((prev) => {
          return prev.map((col) => {
            return {
              ...col,
              tasks: col.tasks
                .map((t) => (t.id === taskId ? updatedTask : t))
                .sort((a, b) => a.position.localeCompare(b.position)),
            };
          });
        });
      })
      .catch((err) => {
        console.error('Erro ao mover tarefa:', err);
        setColumns(oldColumnsState);
      });
  };

  /**
   * Atualizar Atributos da Tarefa
   */
  const handleUpdateTask = (updatedFields: Partial<Task>) => {
    if (!token || !organization || !selectedTask) return;

    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/tasks/${selectedTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updatedFields),
    })
      .then((res) => res.json())
      .then((updatedTask) => {
        setColumns((prev) => {
          return prev.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) => (t.id === selectedTask.id ? updatedTask : t)),
          }));
        });
        setSelectedTask(updatedTask);
        fetchTaskDetails(updatedTask.id);
      })
      .catch((err) => console.error('Erro ao atualizar atributos da tarefa:', err));
  };

  /**
   * Adicionar Comentário
   */
  const handleAddComment = (content: string) => {
    if (!token || !organization || !selectedTask) return;

    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/tasks/${selectedTask.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    })
      .then((res) => res.json())
      .then((newComment) => {
        setComments((prev) => [...prev, newComment]);
        fetchTaskDetails(selectedTask.id);
      })
      .catch((err) => console.error('Erro ao postar comentário:', err));
  };

  /**
   * Criar Nova Tarefa
   */
  const handleCreateTask = (columnId: string, title: string) => {
    if (!token || !organization) return;

    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        columnId,
        title,
        priority: 'MEDIUM',
      }),
    })
      .then((res) => res.json())
      .then((newTask) => {
        setColumns((prev) => {
          return prev.map((col) => {
            if (col.id === columnId) {
              return {
                ...col,
                tasks: [...col.tasks, newTask].sort((a, b) => a.position.localeCompare(b.position)),
              };
            }
            return col;
          });
        });
      })
      .catch((err) => console.error('Erro ao criar tarefa:', err));
  };

  /**
   * Busca de Tarefas rápida
   */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !organization) return;

    fetch(`${LOCAL_API_URL}/api/organizations/${organization.id}/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((results) => {
        setAlertMessage({
          type: 'success',
          text: `Busca encontrou ${results.length} tarefa(s) correspondente(s).`,
        });
        setTimeout(() => setAlertMessage(null), 3500);
      })
      .catch((err) => console.error('Erro ao buscar tarefas:', err));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

      {/* Topbar/Navbar */}
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex flex-wrap justify-between items-center gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-indigo-300 bg-clip-text text-transparent flex items-center gap-2">
            📊 Kaneo Task Manager
          </span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-700/50">
            {organization?.name}
          </span>
        </div>

        {/* Barra de Busca de Alta Performance */}
        <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-sm">
          <input
            type="text"
            placeholder="Pesquisar tarefas (pg_trgm indices)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md px-3 py-2 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs px-3 rounded-md transition-colors font-medium text-slate-300"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end text-xs">
            <span className="text-slate-200 font-semibold">Arquiteto Kaneo</span>
            <span className="text-emerald-400 text-[10px] flex items-center gap-1">
              ● Online / Realtime
            </span>
          </div>
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Kaneo"
            alt="Avatar"
            className="w-9 h-9 rounded-full border border-indigo-500/30"
          />
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">

        {/* Banner Informativo do Projeto */}
        <div className="bg-gradient-to-r from-indigo-900/20 to-slate-900 border border-indigo-500/10 rounded-lg p-5 flex flex-col gap-1 shadow-sm">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            📁 Projeto: {project?.name}
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            {project?.description}
          </p>
        </div>

        {/* Notificações / Toast de Alertas flutuante */}
        {alertMessage && (
          <div
            className={`px-4 py-3 rounded-md border text-xs shadow-md animate-slideIn fixed bottom-6 right-6 z-50 ${
              alertMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}
          >
            {alertMessage.text}
          </div>
        )}

        {/* Quadro Kanban */}
        <div className="flex-1">
          <KanbanBoard
            columns={columns}
            onMoveTask={handleMoveTask}
            onSelectTask={setSelectedTask}
            onCreateTask={handleCreateTask}
          />
        </div>
      </main>

      {/* Modal de Detalhes da Tarefa quando ativa */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdateTask={handleUpdateTask}
          onAddComment={handleAddComment}
          comments={comments}
          logs={logs}
        />
      )}
    </div>
  );
}
export default App;
