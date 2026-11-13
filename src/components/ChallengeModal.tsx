import type { PendingChallenge } from '../../shared/types.ts';
import { COLOR_META } from '../utils/cardLabels.ts';

interface ChallengeModalProps {
  challenge: PendingChallenge;
  onResolve: (shouldChallenge: boolean) => void;
}

export function ChallengeModal({ challenge, onResolve }: ChallengeModalProps) {
  const colorInfo = COLOR_META[challenge.chosenColor];

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#09090B] p-6 shadow-2xl animate-card-pop space-y-5">
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">
            Farbwahl +4 gespielt
          </div>
          <h2 className="text-lg font-semibold text-white">
            {challenge.offenderName} spielt +4 auf dich
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Neue Farbe:{' '}
            <span className="inline-flex items-center gap-1.5 text-white font-medium">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: colorInfo.hex }}
              />
              {colorInfo.label}
            </span>
            . Glaubst du, dass {challenge.offenderName} geblufft hat und eigentlich noch die alte Farbe hatte?
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="w-full rounded-xl bg-white text-black font-semibold text-sm py-3 px-4 hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Akzeptieren (4 Karten ziehen)
          </button>

          <button
            type="button"
            onClick={() => onResolve(true)}
            className="w-full rounded-xl border border-white/20 bg-white/[0.04] text-white font-medium text-sm py-3 px-4 hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            Anzweifeln (Bluff prüfen)
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 text-center">
          Erwischt = Gegner zieht 4 &amp; du bist dran • Falsch = Du ziehst 6 &amp; setzt aus
        </p>
      </div>
    </div>
  );
}

