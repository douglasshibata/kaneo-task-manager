import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import Redis from 'ioredis';

// Mapeia salas de projetos contendo as conexões websockets locais ativas neste nó/processo
const localProjectRooms = new Map<string, Set<WebSocket>>();

// Clientes do Redis para Pub/Sub e Sincronização Horizontal
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export function initWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  // Inicializa conexão Redis Pub/Sub de forma resiliente
  if (process.env.NODE_ENV !== 'test') {
    try {
      console.log(`🔌 Conectando ao Redis Pub/Sub em: ${REDIS_URL}`);
      redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
      redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

      redisPub.on('error', (err) => console.error('❌ Redis Pub Client Erro:', err.message));
      redisSub.on('error', (err) => console.error('❌ Redis Sub Client Erro:', err.message));

      // Inscreve-se nas mensagens globais de broadcast de canais de projetos
      redisSub.psubscribe('project:*', (err, count) => {
        if (err) {
          console.error('❌ Erro ao psubscribe no Redis:', err);
        } else {
          console.log(`📡 Ouvindo barramento global Redis para ${count} canais.`);
        }
      });

      // Trata as mensagens recebidas via barramento global Redis e encaminha aos clientes conectados locais
      redisSub.on('pmessage', (pattern, channel, message) => {
        const projectId = channel.split(':')[1];
        if (!projectId) return;

        const clients = localProjectRooms.get(projectId);
        if (clients && clients.size > 0) {
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
      });
    } catch (error) {
      console.error('⚠️ Falha ao conectar ao Redis. Fallback para broadcasting local ativo.', error);
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url || '').pathname;

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let currentProjectId: string | null = null;

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message);

        // Ação de inscrição em um Projeto Específico (Project Room)
        if (payload.action === 'join' && payload.projectId) {
          currentProjectId = payload.projectId;

          if (!localProjectRooms.has(currentProjectId!)) {
            localProjectRooms.set(currentProjectId!, new Set());
          }
          localProjectRooms.get(currentProjectId!)?.add(ws);

          ws.send(JSON.stringify({ type: 'joined', projectId: currentProjectId }));
        }

        // Ação de desinscrição/saída da sala
        if (payload.action === 'leave' && currentProjectId) {
          localProjectRooms.get(currentProjectId)?.delete(ws);
          currentProjectId = null;
        }
      } catch (err) {
        console.error('Erro ao processar mensagem do socket:', err);
      }
    });

    ws.on('close', () => {
      if (currentProjectId) {
        localProjectRooms.get(currentProjectId)?.delete(ws);
      }
    });
  });

  console.log('🔌 WebSocket Gateway acoplado em /ws com sucesso.');
}

/**
 * Transmite uma notificação em tempo real para todos os usuários inscritos em um projeto específico.
 * Publique no Redis se conectado, garantindo escalonabilidade horizontal perfeita em microsserviços.
 * Fallback transparente para transmissão em memória local caso o Redis esteja indisponível.
 */
export function broadcastToProject(projectId: string, messagePayload: any) {
  const serialized = JSON.stringify(messagePayload);

  if (redisPub && redisPub.status === 'ready') {
    // Publica no barramento Redis para que todos os nós/servidores enviem para seus respectivos clientes
    redisPub.publish(`project:${projectId}`, serialized);
  } else {
    // Fallback local caso Redis não esteja disponível
    const clients = localProjectRooms.get(projectId);
    if (clients) {
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(serialized);
        }
      });
    }
  }
}
