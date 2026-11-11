import React, { useState, useEffect } from 'react';
import { Task, Comment, ActivityLog } from '../types';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onUpdateTask: (updatedFields: Partial<Task>) => void;
  onAddComment: (content: string) => void;
  comments: Comment[];
  logs: ActivityLog[];
}

/**
 * Modal Detalhado de Tarefas
 * Suporta edição em tempo real de título, descrição (Rich Text/Markdown), prioridade, tags,
 * inserção de comentários e visualização de trilha de auditoria/logs de atividade em tempo real.
 */
export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  onClose,
  onUpdateTask,
  onAddComment,
  comments,
  logs,
}) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [tagInput, setTagInput] = useState('');
  const [commentInput, setCommentInput] = useState('');

  // Sincroniza estado se a tarefa for atualizada via WebSocket
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority);
  }, [task]);

  const handleBlurUpdate = () => {
    if (title.trim() === '') return;
    onUpdateTask({ title, description, priority });
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const newTags = [...task.tags, tagInput.trim()];
      onUpdateTask({ tags: newTags });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = task.tags.filter((t) => t !== tagToRemove);
    onUpdateTask({ tags: newTags });
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    onAddComment(commentInput.trim());
    setCommentInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header do Modal */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Painel de Detalhes da Tarefa (Versão #{task.version})
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Corpo do Modal dividido em Duas Colunas */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Coluna Esquerda: Edição de Atributos & Descrição */}
          <div className="md:col-span-2 flex flex-col gap-4">

            {/* Título Editável */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleBlurUpdate}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-md px-3 py-2 text-slate-100 font-medium focus:outline-none transition-colors"
              />
            </div>

            {/* Descrição Markdown/Rich Text */}
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-semibold text-slate-400 block mb-1">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleBlurUpdate}
                placeholder="Insira detalhes ricos utilizando texto ou Markdown..."
                className="w-full flex-1 min-h-[150px] bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-md p-3 text-slate-300 text-sm focus:outline-none transition-colors resize-y scrollbar-thin"
              />
            </div>

            {/* Seção de Comentários */}
            <div className="mt-4 border-t border-slate-800 pt-4 flex flex-col gap-4">
              <h4 className="font-semibold text-sm text-slate-200">Discussões & Comentários ({comments.length})</h4>

              {/* Comentários Feed */}
              <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 bg-slate-950/40 border border-slate-800/60 p-3 rounded-lg">
                    <img
                      src={comment.user?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=user'}
                      alt={comment.user?.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-slate-300">{comment.user?.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}

                {comments.length === 0 && (
                  <p className="text-xs text-slate-500 italic py-2">Sem comentários nesta tarefa. Inicie a conversa abaixo!</p>
                )}
              </div>

              {/* Input para Novo Comentário */}
              <form onSubmit={handleCommentSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva um comentário..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 rounded-md transition-colors font-medium"
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>

          {/* Coluna Direita: Metadados, Tags & Trilha de Atividade (Logs) */}
          <div className="bg-slate-950/30 border-l border-slate-800/80 pl-4 flex flex-col gap-5">

            {/* Prioridade */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => {
                  const newPrio = e.target.value as any;
                  setPriority(newPrio);
                  onUpdateTask({ priority: newPrio });
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            {/* Tags / Etiquetas */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[9px] hover:text-red-400"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Pressione Enter..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              />
            </div>

            {/* Trilha de Atividade / Auditoria */}
            <div className="flex-1 flex flex-col min-h-[200px]">
              <label className="text-xs font-semibold text-slate-400 block mb-2">Histórico de Atividades</label>
              <div className="flex-1 overflow-y-auto max-h-[250px] scrollbar-thin pr-1 flex flex-col gap-3">
                {logs.map((log) => (
                  <div key={log.id} className="text-[11px] text-slate-400 border-l border-slate-800 pl-2 py-0.5">
                    <span className="font-semibold text-slate-300 block">
                      {log.user?.name || 'Sistema'}
                    </span>
                    <p className="text-slate-500 my-0.5 leading-tight">{log.action}</p>
                    <span className="text-[9px] text-slate-600 block">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
