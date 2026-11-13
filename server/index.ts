import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type {
  CardColor,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/types.js';
import { CARD_COLORS } from './gameEngine.js';
import { RoomManager, type Room } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3001', 10);
const VALID_COLORS = new Set<string>(CARD_COLORS);

const app = express();
app.set('trust proxy', true);

app.get('/api/health', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['polling', 'websocket'],
  pingInterval: 20_000,
  pingTimeout: 25_000,
});

function broadcastRoomState(room: Room): void {
  for (const player of room.players) {
    if (player.socketId && player.connected) {
      io.to(player.socketId).emit('room:state', manager.serializeForPlayer(room, player.id));
    }
  }
}

const manager = new RoomManager(broadcastRoomState, (socketId, reason) => {
  io.to(socketId).emit('room:kicked', { reason });
});

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    const name = typeof payload?.playerName === 'string' ? payload.playerName : '';
    const res = manager.createRoom(socket.id, name);
    ack?.(res);
  });

  socket.on('room:join', (payload, ack) => {
    const code = typeof payload?.roomCode === 'string' ? payload.roomCode : '';
    const name = typeof payload?.playerName === 'string' ? payload.playerName : '';
    const res = manager.joinRoom(socket.id, code, name);
    ack?.(res);
  });

  socket.on('room:rejoin', (payload, ack) => {
    if (
      typeof payload?.roomCode !== 'string' ||
      typeof payload?.playerId !== 'string' ||
      typeof payload?.reconnectToken !== 'string'
    ) {
      ack?.({ ok: false, error: 'Ungültige Sitzungsdaten.' });
      return;
    }
    const res = manager.rejoinRoom(socket.id, payload);
    ack?.(res);
  });

  socket.on('room:leave', (ack) => {
    const res = manager.leaveRoom(socket.id);
    ack?.(res);
  });

  socket.on('room:toggle_ready', (ack) => {
    const res = manager.toggleReady(socket.id);
    ack?.(res);
  });

  socket.on('room:set_game_mode', (payload, ack) => {
    const gameMode = payload?.gameMode === 'jump_in' ? 'jump_in' : 'standard';
    const res = manager.setGameMode(socket.id, gameMode);
    ack?.(res);
  });

  socket.on('room:add_bot', (ack) => {
    const res = manager.addBot(socket.id);
    ack?.(res);
  });

  socket.on('room:remove_player', (payload, ack) => {
    const targetPlayerId =
      typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : '';
    const res = manager.removePlayerByHost(socket.id, targetPlayerId);
    ack?.(res);
  });

  socket.on('room:skip_disconnected', (payload, ack) => {
    const targetPlayerId =
      typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : '';
    const res = manager.skipDisconnectedTurn(socket.id, targetPlayerId);
    ack?.(res);
  });

  socket.on('room:next_round', (ack) => {
    const res = manager.returnToLobby(socket.id);
    ack?.(res);
  });

  socket.on('game:choose_initial_color', (payload, ack) => {
    if (typeof payload?.color !== 'string' || !VALID_COLORS.has(payload.color)) {
      ack?.({ ok: false, error: 'Ungültige Farbe.' });
      return;
    }
    const res = manager.handleChooseInitialColor(socket.id, payload.color as CardColor);
    ack?.(res);
  });

  socket.on('game:play_card', (payload, ack) => {
    const cardId = typeof payload?.cardId === 'string' ? payload.cardId : '';
    const chosenColor =
      typeof payload?.chosenColor === 'string' && VALID_COLORS.has(payload.chosenColor)
        ? (payload.chosenColor as CardColor)
        : undefined;
    const res = manager.handlePlayCard(socket.id, cardId, chosenColor);
    ack?.(res);
  });

  socket.on('game:play_cards', (payload, ack) => {
    const cardIds = Array.isArray(payload?.cardIds)
      ? payload.cardIds.filter((id): id is string => typeof id === 'string')
      : [];
    const chosenColor =
      typeof payload?.chosenColor === 'string' && VALID_COLORS.has(payload.chosenColor)
        ? (payload.chosenColor as CardColor)
        : undefined;
    const res = manager.handlePlayCards(socket.id, cardIds, chosenColor);
    ack?.(res);
  });

  socket.on('game:draw_card', (ack) => {
    const res = manager.handleDrawCard(socket.id);
    ack?.(res);
  });

  socket.on('game:keep_drawn_card', (ack) => {
    const res = manager.handleKeepDrawnCard(socket.id);
    ack?.(res);
  });

  socket.on('game:resolve_challenge', (payload, ack) => {
    const challenge = Boolean(payload?.challenge);
    const res = manager.handleResolveChallenge(socket.id, challenge);
    ack?.(res);
  });

  socket.on('game:call_uno', (ack) => {
    const res = manager.handleCallUno(socket.id);
    ack?.(res);
  });

  socket.on('game:catch_uno', (payload, ack) => {
    const targetPlayerId =
      typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : '';
    const res = manager.handleCatchUno(socket.id, targetPlayerId);
    ack?.(res);
  });

  socket.on('disconnect', () => {
    manager.handleDisconnect(socket.id);
  });
});

// Serve built React app in production
const candidateDistPaths = [
  path.resolve(process.cwd(), 'dist'),
  path.resolve(__dirname, '../../dist'),
];
const distDir = candidateDistPaths.find((p) => existsSync(path.join(p, 'index.html')));

if (distDir) {
  app.use(express.static(distDir, { maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`UNO Server läuft auf http://0.0.0.0:${PORT}`);
});

