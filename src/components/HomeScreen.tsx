import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Wifi, WifiOff } from 'lucide-react';

interface HomeScreenProps {
  connected: boolean;
  initialRoomCode: string;
  errorMessage: string | null;
  onCreateRoom: (playerName: string) => Promise<void>;
  onJoinRoom: (roomCode: string, playerName: string) => Promise<void>;
  onClearError: () => void;
}

const NAME_STORAGE_KEY = 'uno_player_name';

export function HomeScreen({
  connected,
  initialRoomCode,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onClearError,
}: HomeScreenProps) {
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode);
  const [submitting, setSubmitting] = useState<'create' | 'join' | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    }
  }, [initialRoomCode]);

  const persistName = (name: string) => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      // ignore storage issues
    }
  };

  const handleCreate = async () => {
    const cleanName = playerName.trim();
    if (!cleanName || submitting) return;
    persistName(cleanName);
    setSubmitting('create');
    await onCreateRoom(cleanName);
    setSubmitting(null);
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim();
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanName || cleanCode.length < 4 || submitting) return;
    persistName(cleanName);
    setSubmitting('join');
    await onJoinRoom(cleanCode, cleanName);
    setSubmitting(null);
  };

  const hasName = playerName.trim().length > 0;
  const hasInviteCode = initialRoomCode.length > 0;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between px-4 py-8 sm:px-6">
      {/* Top status bar */}
      <header className="max-w-xl w-full mx-auto flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              connected
                ? 'border-white/15 text-zinc-300 bg-white/[0.03]'
                : 'border-white/10 text-zinc-500 bg-white/[0.02]'
            }`}
          >
            {connected ? <Wifi className="w-3 h-3 text-white" /> : <WifiOff className="w-3 h-3" />}
            <span>{connected ? 'P2P Host-Modus bereit' : 'Verbinde…'}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowRules((v) => !v)}
          className="text-zinc-400 hover:text-white transition-colors cursor-pointer underline-offset-4 hover:underline"
        >
          {showRules ? 'Regeln ausblenden' : 'Standardregeln'}
        </button>
      </header>

      {/* Main content */}
      <main className="max-w-md w-full mx-auto my-auto py-8">
        {/* Minimalist Wordmark */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-5xl font-bold tracking-[-0.04em] text-white">UNO</h1>
            <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-red-500/85" />
              <span className="w-2 h-2 rounded-full bg-yellow-500/85" />
              <span className="w-2 h-2 rounded-full bg-green-500/85" />
              <span className="w-2 h-2 rounded-full bg-blue-500/85" />
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Minimalistisches Online-UNO komplett ohne externen Server. Der Host erstellt den Room direkt im Browser — Freunde treten weltweit per Code bei.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-white/25 bg-white/[0.06] px-4 py-3 text-sm text-white flex items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-xs text-zinc-400 hover:text-white shrink-0 cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {showRules && (
          <div className="mb-6 rounded-2xl border border-white/12 bg-[#0A0A0B] p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <div className="font-semibold text-white">Offizielle Standardregeln</div>
            <ul className="space-y-1 text-zinc-400 list-disc pl-4">
              <li>108 Karten, 7 Handkarten pro Spieler, kein Stapeln von +2 / +4.</li>
              <li>Bei 2 Spielern wirkt Richtungswechsel wie Aussetzen.</li>
              <li>2 identische Karten derselben Farbe &amp; Zahl können gleichzeitig gelegt werden.</li>
              <li>Optional in der Lobby: Modus „Einwerfen“ (identische Karte jederzeit legen).</li>
              <li>Farbwahl +4 darf legal ohne passende Farbe gelegt oder geblufft &amp; angezweifelt werden.</li>
              <li>Bei der vorletzten Karte „UNO!“ rufen — sonst drohen +2 Strafkarten beim Erwischt-Werden.</li>
            </ul>
          </div>
        )}

        <div className="space-y-6">
          {/* Player Name */}
          <div>
            <label htmlFor="player-name" className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
              Dein Name
            </label>
            <input
              id="player-name"
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="z. B. Alex"
              autoFocus
              className="w-full rounded-xl border border-white/15 bg-[#0A0A0B] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          {!hasInviteCode ? (
            <>
              <button
                type="button"
                disabled={!hasName || submitting !== null}
                onClick={handleCreate}
                className="w-full rounded-xl bg-white text-black font-semibold text-sm py-3.5 px-4 flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{submitting === 'create' ? 'Starte Host…' : 'Neuen Room erstellen (Host)'}</span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/10" />
                <span className="mx-3 text-[11px] uppercase tracking-widest text-zinc-600">oder</span>
                <div className="flex-grow border-t border-white/10" />
              </div>

              <form onSubmit={handleJoin} className="space-y-2.5">
                <label htmlFor="room-code" className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Einem Room beitreten
                </label>
                <div className="flex gap-2">
                  <input
                    id="room-code"
                    type="text"
                    maxLength={6}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="ROOM-CODE"
                    className="flex-1 rounded-xl border border-white/15 bg-[#0A0A0B] px-4 py-3 text-sm font-mono-code tracking-[0.2em] uppercase text-white placeholder:text-zinc-600 placeholder:tracking-normal focus:outline-none focus:border-white transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!hasName || roomCode.trim().length < 4 || submitting !== null}
                    className="rounded-xl border border-white/20 bg-white/[0.06] text-white font-medium text-sm px-5 flex items-center gap-1.5 hover:bg-white hover:text-black disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    <span>{submitting === 'join' ? '…' : 'Join'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <form onSubmit={handleJoin} className="space-y-3">
                <div className="rounded-xl border border-white/15 bg-[#0A0A0B] p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Einladung zu Room</div>
                    <div className="font-mono-code text-xl font-bold tracking-[0.2em] text-white mt-0.5">
                      {roomCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoomCode('')}
                    className="text-xs text-zinc-500 hover:text-white cursor-pointer"
                  >
                    Ändern
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!hasName || submitting !== null}
                  className="w-full rounded-xl bg-white text-black font-semibold text-sm py-3.5 px-4 flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <span>{submitting === 'join' ? 'Verbinde mit Host…' : 'Room beitreten'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <button
                type="button"
                disabled={!hasName || submitting !== null}
                onClick={handleCreate}
                className="w-full rounded-xl border border-white/15 bg-transparent text-zinc-300 font-medium text-sm py-3 px-4 flex items-center justify-center gap-2 hover:bg-white/[0.05] hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Stattdessen eigenen Room hosten</span>
              </button>
            </>
          )}
        </div>
      </main>

      <footer className="max-w-xl w-full mx-auto text-center text-[11px] text-zinc-600">
        Browser-to-Browser WebRTC (PeerJS) • Host = Server • Kein externer Spielserver nötig
      </footer>
    </div>
  );
}
