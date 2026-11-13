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
const SERVER_URL_KEY = 'uno_server_url';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface ServerConfigState {
  mode: 'same-origin' | 'env' | 'custom' | 'missing';
  url: string | null;
}

export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function resolveInitialServerConfig(): ServerConfigState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const paramServer = params.get('server');
    if (paramServer) {
      const normalized = normalizeServerUrl(paramServer);
      if (normalized) {
        try {
          localStorage.setItem(SERVER_URL_KEY, normalized);
        } catch {
          // ignore storage errors
        }
        return { mode: 'custom', url: normalized };
      }
    }
  }

  const envUrl = import.meta.env.VITE_WS_URL?.trim();
  if (envUrl) {
    const normalized = normalizeServerUrl(envUrl);
    if (normalized) {
      return { mode: 'env', url: normalized };
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(SERVER_URL_KEY);
      if (saved) {
        const normalized = normalizeServerUrl(saved);
        if (normalized) {
          return { mode: 'custom', url: normalized };
        }
      }
    } catch {
      // ignore storage errors
    }

    if (window.location.hostname.endsWith('github.io')) {
      return { mode: 'missing', url: null };
    }
  }

  return { mode: 'same-origin', url: null };
}

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
  const [serverConfig, setServerConfig] = useState<ServerConfigState>(() =>
    resolveInitialServerConfig()
  );
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

  const setCustomServerUrl = useCallback((rawUrl: string): boolean => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      try {
        localStorage.removeItem(SERVER_URL_KEY);
      } catch {
        // ignore
      }
      saveSession(null);
      setRoomState(null);
      setServerConfig(resolveInitialServerConfig());
      return true;
    }

    const normalized = normalizeServerUrl(trimmed);
    if (!normalized) {
      setErrorBanner('Bitte eine gültige Server-URL eingeben (z. B. https://mein-uno.onrender.com).');
      return false;
    }
    try {
      localStorage.setItem(SERVER_URL_KEY, normalized);
    } catch {
      // ignore
    }
    saveSession(null);
    setRoomState(null);
    setErrorBanner(null);
    setServerConfig({ mode: 'custom', url: normalized });
    return true;
  }, []);

  useEffect(() => {
    if (serverConfig.mode === 'missing') {
      setConnected(false);
      setTransport('unconfigured');
      return;
    }

    const socketTarget = serverConfig.url ?? undefined;
    const socket: TypedSocket = io(socketTarget, {
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
  }, [serverConfig.mode, serverConfig.url]);

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
    serverConfig,
    setCustomServerUrl,
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
