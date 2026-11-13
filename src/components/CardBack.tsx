interface CardBackProps {
  count: number;
  canDraw: boolean;
  pendingDrawCount?: number;
  onClick?: () => void;
}

export function CardBack({ count, canDraw, pendingDrawCount = 0, onClick }: CardBackProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canDraw}
      aria-label={`Karte ziehen (${count} Karten im Stapel)`}
      className={`group relative w-[84px] h-[122px] sm:w-[98px] sm:h-[142px] rounded-2xl border select-none transition-all duration-200 ease-out flex flex-col items-center justify-between p-2.5 ${
        canDraw
          ? 'border-white/65 bg-[#0C0C0F] cursor-pointer hover:-translate-y-1.5 hover:border-white shadow-[0_12px_34px_rgba(255,255,255,0.12)]'
          : 'border-white/18 bg-[#09090B] cursor-default opacity-85 shadow-[0_12px_28px_rgba(0,0,0,0.85)]'
      }`}
    >
      {/* Physical deck stack layers underneath */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 translate-x-[4px] translate-y-[4px] rounded-2xl border border-white/12 bg-[#070709]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 translate-x-[8px] translate-y-[8px] rounded-2xl border border-white/[0.06] bg-[#040405]"
      />

      {/* Inner hairline border */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[5px] rounded-xl border border-white/[0.06]"
      />

      {/* Top corner remaining count */}
      <div className="relative z-10 w-full flex items-center justify-between leading-none">
        <span className="font-mono-code text-[10px] font-medium text-zinc-400 group-hover:text-white transition-colors">
          {count}
        </span>
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="w-1 h-1 rounded-full bg-red-500/75" />
          <span className="w-1 h-1 rounded-full bg-yellow-500/75" />
          <span className="w-1 h-1 rounded-full bg-green-500/75" />
          <span className="w-1 h-1 rounded-full bg-blue-500/75" />
        </span>
      </div>

      {/* Tilted minimal UNO oval emblem */}
      <div className="relative z-10 flex items-center justify-center flex-1 w-full">
        <svg viewBox="0 0 80 100" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <ellipse
            cx="40"
            cy="50"
            rx="24"
            ry="34"
            transform="rotate(-22 40 50)"
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1.1"
          />
        </svg>
        <span className="text-xs sm:text-sm font-bold tracking-[0.22em] text-white/90 pl-0.5 -rotate-12">
          UNO
        </span>
      </div>

      {/* Bottom indicator */}
      <div className="relative z-10 w-full flex justify-center">
        {canDraw ? (
          <span className="rounded-full bg-white text-black px-2.5 py-0.5 text-[10px] font-bold tracking-wide">
            {pendingDrawCount > 0 ? `+${pendingDrawCount} ziehen` : 'Ziehen'}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600 font-medium">Stapel</span>
        )}
      </div>
    </button>
  );
}
