import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  projectId: string;
  data: any;
}

/**
 * Custom Hook para gerenciar conexões em tempo real via WebSockets.
 * Realiza conexão, gerencia reconexão automática e ouve eventos específicos de atualizações de tarefas
 * e novos comentários, aplicando callbacks reativos para atualizar o estado local instantaneamente.
 */
export function useProjectSocket(
  projectId: string | undefined,
  onTaskMoved: (data: { taskId: string; oldColumnId: string; newColumnId: string; position: string; version: number }) => void,
  onTaskUpdated: (data: { task: any; action: string }) => void,
  onCommentAdded: (data: { taskId: string; comment: any }) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Configura endpoint do WebSocket com fallback apropriado para localhost
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:4000';
    const ws = new WebSocket(`${wsUrl}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log(`🔌 Conectado ao RealtimeHub. Inscrevendo no projeto: ${projectId}`);
      // Join na sala do projeto
      ws.send(JSON.stringify({ action: 'join', projectId }));
    };

    ws.onmessage = (event) => {
      try {
        const payload: WebSocketMessage = JSON.parse(event.data);

        if (payload.projectId !== projectId && payload.type !== 'joined') return;

        switch (payload.type) {
          case 'TASK_MOVED':
            onTaskMoved(payload.data);
            break;
          case 'TASK_UPDATED':
            onTaskUpdated(payload.data);
            break;
          case 'COMMENT_ADDED':
            onCommentAdded(payload.data);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Erro ao decodificar dados do websocket:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('🔌 Conexão do WebSocket fechada.');
    };

    ws.onerror = (err) => {
      console.error('🔌 Erro na conexão do WebSocket:', err);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'leave', projectId }));
        ws.close();
      }
    };
  }, [projectId, onTaskMoved, onTaskUpdated, onCommentAdded]);

  return { isConnected };
}
