import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  CardColor,
  ClientRoomState,
  ClientToServerEvents,
  GameMode,
  RoomActionResponse,
  ServerToClientEvents,
  SessionCredentials,
} from '../../shared/types.ts';

const SESSION_KEY = 'uno_online_session';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function saveSession(creds: SessionCredentials | null): void {
  try {
    if (creds) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore storage issues
  }
}

function loadSession(): SessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionCredentials;
    if (parsed?.roomCode && parsed?.playerId && parsed?.reconnectToken) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function useUnoSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<string>('connecting');
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorBanner(msg);
  }, []);

  const clearError = useCallback(() => {
    setErrorBanner(null);
  }, []);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_WS_URL?.trim() || undefined;
    const socket: TypedSocket = io(serverUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 15000,
    });

    socketRef.current = socket;

    const updateTransport = () => {
      const name = socket.io.engine?.transport?.name;
      if (name) setTransport(name);
    };

    socket.on('connect', () => {
      setConnected(true);
      updateTransport();
      socket.io.engine?.on('upgrade', updateTransport);

      const saved = loadSession();
      if (saved) {
        socket.emit('room:rejoin', saved, (res) => {
          if (!res.ok) {
            saveSession(null);
            setRoomState(null);
          }
        });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setTransport('reconnecting');
    });

    socket.on('connect_error', () => {
      setConnected(false);
    });

    socket.on('room:state', (state) => {
      setRoomState(state);
    });

    socket.on('room:kicked', ({ reason }) => {
      saveSession(null);
      setRoomState(null);
      setErrorBanner(reason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const createRoom = useCallback((playerName: string): Promise<RoomActionResponse> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve({ ok: false, error: 'Keine Serververbindung. Bitte kurz warten…' });
        return;
      }
      socket.emit('room:create', { playerName }, (res) => {
        if (res.ok && res.credentials) {
          saveSession(res.credentials);
          setErrorBanner(null);
        } else if (res.error) {
          setErrorBanner(res.error);
        }
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string): Promise<RoomActionResponse> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve({ ok: false, error: 'Keine Serververbindung. Bitte kurz warten…' });
        return;
      }
      socket.emit('room:join', { roomCode, playerName }, (res) => {
        if (res.ok && res.credentials) {
          saveSession(res.credentials);
          setErrorBanner(null);
        } else if (res.error) {
          setErrorBanner(res.error);
        }
        resolve(res);
      });
    });
  }, []);

  const leaveRoom = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      saveSession(null);
      setRoomState(null);
      setErrorBanner(null);
      if (!socket?.connected) {
        resolve();
        return;
      }
      socket.emit('room:leave', () => resolve());
    });
  }, []);

  const emitAction = useCallback(
    (
      fn: (socket: TypedSocket, cb: (res: RoomActionResponse) => void) => void,
      options?: { silentError?: boolean }
    ): Promise<RoomActionResponse> => {
      return new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          const msg = 'Verbindung unterbrochen — verbinde erneut…';
          if (!options?.silentError) setErrorBanner(msg);
          resolve({ ok: false, error: msg });
          return;
        }
        fn(socket, (res) => {
          if (!res.ok && res.error && !options?.silentError) {
            setErrorBanner(res.error);
          }
          resolve(res);
        });
      });
    },
    []
  );

  const toggleReady = useCallback(() => {
    void emitAction((s, cb) => s.emit('room:toggle_ready', cb));
  }, [emitAction]);

  const setGameMode = useCallback(
    (gameMode: GameMode) => {
      void emitAction((s, cb) => s.emit('room:set_game_mode', { gameMode }, cb));
    },
    [emitAction]
  );

  const addBot = useCallback(() => {
    void emitAction((s, cb) => s.emit('room:add_bot', cb));
  }, [emitAction]);

  const removePlayer = useCallback(
    (targetPlayerId: string) => {
      void emitAction((s, cb) => s.emit('room:remove_player', { targetPlayerId }, cb));
    },
    [emitAction]
  );

  const skipDisconnected = useCallback(
    (targetPlayerId: string) => {
      void emitAction((s, cb) => s.emit('room:skip_disconnected', { targetPlayerId }, cb));
    },
    [emitAction]
  );

  const nextRoundToLobby = useCallback(() => {
    void emitAction((s, cb) => s.emit('room:next_round', cb));
  }, [emitAction]);

  const chooseInitialColor = useCallback(
    (color: CardColor) => {
      void emitAction((s, cb) => s.emit('game:choose_initial_color', { color }, cb));
    },
    [emitAction]
  );

  const playCards = useCallback(
    (cardIds: string[], chosenColor?: CardColor): Promise<RoomActionResponse> => {
      return emitAction(
        (s, cb) => s.emit('game:play_cards', { cardIds, chosenColor }, cb),
        { silentError: true }
      );
    },
    [emitAction]
  );

  const drawCard = useCallback(() => {
    void emitAction((s, cb) => s.emit('game:draw_card', cb));
  }, [emitAction]);

  const keepDrawnCard = useCallback(() => {
    void emitAction((s, cb) => s.emit('game:keep_drawn_card', cb));
  }, [emitAction]);

  const resolveChallenge = useCallback(
    (challenge: boolean) => {
      void emitAction((s, cb) => s.emit('game:resolve_challenge', { challenge }, cb));
    },
    [emitAction]
  );

  const callUno = useCallback(() => {
    void emitAction((s, cb) => s.emit('game:call_uno', cb));
  }, [emitAction]);

  const catchUno = useCallback(
    (targetPlayerId: string) => {
      void emitAction((s, cb) => s.emit('game:catch_uno', { targetPlayerId }, cb));
    },
    [emitAction]
  );

  return {
    connected,
    transport,
    roomState,
    errorBanner,
    showError,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    setGameMode,
    addBot,
    removePlayer,
    skipDisconnected,
    nextRoundToLobby,
    chooseInitialColor,
    playCards,
    drawCard,
    keepDrawnCard,
    resolveChallenge,
    callUno,
    catchUno,
  };
}
