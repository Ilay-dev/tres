import { Check, Trophy } from 'lucide-react';
import type { ClientRoomState } from '../../shared/types.ts';
import { UnoCard } from './UnoCard.tsx';

interface RoundOverModalProps {
  room: ClientRoomState;
  onToggleReady: () => void;
  onReturnToLobby: () => void;
}

export function RoundOverModal({
  room,
  onToggleReady,
  onReturnToLobby,
}: RoundOverModalProps) {
  const summary = room.roundSummary;
  if (!summary) return null;

  const me = room.players.find((p) => p.id === room.myPlayerId);
  const isHost = room.hostId === room.myPlayerId;
  const readyCount = room.players.filter((p) => p.isReady).length;
  const totalCount = room.players.length;

  return (
    <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#09090B] p-6 shadow-2xl animate-card-pop space-y-6 my-auto">
        {/* Winner Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-400 mb-1">
              <Trophy className="w-3.5 h-3.5 text-white" />
              <span>Runde {room.roundNumber} beendet</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {summary.winnerName} gewinnt!
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              +{summary.pointsEarned} Punkte aus den verbleibenden Handkarten
            </p>
          </div>
          <div className="font-mono-code text-right">
            <div className="text-xl font-bold text-white">+{summary.pointsEarned}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Punkte</div>
          </div>
        </div>

        {/* Scoreboard & Remaining Cards */}
        <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
          {summary.breakdown.map((row, idx) => {
            const playerObj = room.players.find((p) => p.id === row.id);
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-3.5 ${
                  row.id === summary.winnerId
                    ? 'border-white/30 bg-white/[0.05]'
                    : 'border-white/10 bg-black/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-code text-xs text-zinc-500 w-4">
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-medium text-white truncate">
                      {row.name}
                    </span>
                    {playerObj?.isReady && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-white text-black font-semibold px-1.5 py-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5" />
                        Bereit
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono-code text-sm font-semibold text-white">
                      {row.totalScore} Pkt
                    </span>
                    {row.handPoints > 0 && (
                      <span className="ml-2 text-[11px] text-zinc-500">
                        (Rest: {row.handPoints})
                      </span>
                    )}
                  </div>
                </div>

                {row.remainingCards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {row.remainingCards.map((card) => (
                      <UnoCard key={card.id} card={card} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          {room.countdownSeconds !== null ? (
            <div className="rounded-xl bg-white text-black px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Nächste Runde startet in {room.countdownSeconds}…
              </span>
              <button
                type="button"
                onClick={onToggleReady}
                className="text-xs font-semibold border border-black/25 rounded-lg px-2.5 py-1 hover:bg-black/10 cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full rounded-xl py-3.5 px-4 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                me?.isReady
                  ? 'border border-white/30 bg-white/[0.08] text-white hover:bg-white/[0.15]'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {me?.isReady ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Bereit für nächste Runde ({readyCount}/{totalCount})</span>
                </>
              ) : (
                <span>Bereit für nächste Runde ({readyCount}/{totalCount})</span>
              )}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              onClick={onReturnToLobby}
              className="w-full rounded-xl border border-white/12 py-2.5 px-4 text-xs text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              Zurück in die Lobby (Spieler verwalten)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

