import React, { useState } from 'react';
import { Column, Task } from '../types';

interface KanbanBoardProps {
  columns: Column[];
  onMoveTask: (taskId: string, targetColumnId: string, prevTaskId: string | null, nextTaskId: string | null) => void;
  onSelectTask: (task: Task) => void;
  onCreateTask: (columnId: string, title: string) => void;
}

/**
 * Kanban Board Interativo com suporte nativo a Drag and Drop (HTML5 Drag and Drop API)
 * de alta fidelidade e excelente experiência visual, evitando sobrecarga ou dependências complexas.
 * Permite arrastar os cards entre colunas e reordená-los, acionando o algoritmo de Lexorank.
 */
export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  onMoveTask,
  onSelectTask,
  onCreateTask,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [newTasksTitles, setNewTasksTitles] = useState<{ [columnId: string]: string }>({});

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string, targetIndex?: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    // Localiza a coluna alvo e suas tarefas atuais
    const targetColumn = columns.find((c) => c.id === targetColumnId);
    if (!targetColumn) return;

    // Filtra tarefas excluindo o item arrastado se já estiver na coluna
    const currentTasks = targetColumn.tasks.filter((t) => t.id !== taskId);

    // Se o targetIndex não for fornecido, insere ao final
    let index = targetIndex !== undefined ? targetIndex : currentTasks.length;

    // Limita o índice
    if (index < 0) index = 0;
    if (index > currentTasks.length) index = currentTasks.length;

    // Encontra os IDs das tarefas vizinhas prévia e subsequente para cálculo de Lexorank
    const prevTask = index > 0 ? currentTasks[index - 1] : null;
    const nextTask = index < currentTasks.length ? currentTasks[index] : null;

    onMoveTask(
      taskId,
      targetColumnId,
      prevTask ? prevTask.id : null,
      nextTask ? nextTask.id : null
    );

    setDraggedTaskId(null);
    setDragOverColumnId(null);
  };

  const handleCreateTaskSubmit = (columnId: string) => {
    const title = newTasksTitles[columnId]?.trim();
    if (!title) return;

    onCreateTask(columnId, title);
    setNewTasksTitles((prev) => ({ ...prev, [columnId]: '' }));
  };

  return (
    <div className="flex gap-4 p-4 overflow-x-auto min-h-[70vh] items-start select-none">
      {columns.map((column) => {
        const isDraggingOverThis = dragOverColumnId === column.id;

        return (
          <div
            key={column.id}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={() => setDragOverColumnId(null)}
            onDrop={(e) => handleDrop(e, column.id)}
            className={`flex flex-col w-80 bg-slate-900 border border-slate-800 rounded-lg p-3 shrink-0 transition-all duration-200 ${
              isDraggingOverThis ? 'border-indigo-500 bg-slate-850 shadow-md ring-1 ring-indigo-500' : ''
            }`}
          >
            {/* Header da Coluna */}
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                {column.name}
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                  {column.tasks.length}
                </span>
              </h3>
            </div>

            {/* Lista de Cards de Tarefas */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-1 scrollbar-thin">
              {column.tasks.map((task, idx) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => onSelectTask(task)}
                  // Permite drop entre os cards para ordenação precisa
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDrop(e, column.id, idx);
                  }}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 rounded-md p-3 cursor-grab active:cursor-grabbing transition-all duration-150 group shadow-sm flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-100 font-medium text-sm group-hover:text-indigo-400 transition-colors duration-150">
                      {task.title}
                    </span>

                    {/* Badge de Prioridade */}
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        task.priority === 'URGENT'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : task.priority === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : task.priority === 'MEDIUM'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  {/* Descrição curta */}
                  {task.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  {/* Rodapé do Card (Tags) */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-slate-700/60 text-indigo-300 border border-slate-600/40 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {column.tasks.length === 0 && (
                <div className="border-2 border-dashed border-slate-800 text-slate-500 text-xs text-center py-8 rounded-md">
                  Arraste tarefas aqui
                </div>
              )}
            </div>

            {/* Adicionar Nova Tarefa inline */}
            <div className="mt-3 border-t border-slate-800 pt-3 flex flex-col gap-2">
              <input
                type="text"
                placeholder="+ Nova tarefa..."
                value={newTasksTitles[column.id] || ''}
                onChange={(e) =>
                  setNewTasksTitles((prev) => ({ ...prev, [column.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTaskSubmit(column.id);
                }}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
              {newTasksTitles[column.id] && (
                <button
                  onClick={() => handleCreateTaskSubmit(column.id)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-1 rounded transition-colors duration-150"
                >
                  Adicionar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
