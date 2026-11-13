import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { CardColor } from '../../shared/types.ts';
import { COLOR_META } from '../utils/cardLabels.ts';

interface ColorPickerModalProps {
  title: string;
  subtitle?: string;
  onSelect: (color: CardColor) => void;
  onCancel?: () => void;
}

const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];

export function ColorPickerModal({
  title,
  subtitle,
  onSelect,
  onCancel,
}: ColorPickerModalProps) {
  useEffect(() => {
    if (!onCancel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed left-1/2 -translate-x-1/2 bottom-[255px] sm:bottom-[290px] z-30 w-max max-w-[calc(100vw-24px)]"
    >
      <div className="rounded-2xl border border-white/15 bg-[#09090B]/95 backdrop-blur-md px-3.5 py-2.5 shadow-[0_16px_42px_rgba(0,0,0,0.85)] animate-card-pop">
        <div className="flex items-center justify-between gap-4 mb-2 px-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-white">{title}</span>
            {subtitle && <span className="text-[11px] text-zinc-400 hidden sm:inline">{subtitle}</span>}
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Abbrechen"
              className="rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {COLORS.map((color) => {
            const meta = COLOR_META[color];
            return (
              <button
                key={color}
                type="button"
                onClick={() => onSelect(color)}
                style={{
                  borderColor: meta.border,
                  background: `radial-gradient(circle at 50% 35%, ${meta.tint} 0%, #0D0D0F 90%)`,
                }}
                className="rounded-xl border px-3 py-2 sm:px-3.5 sm:py-2.5 flex items-center justify-center gap-2 hover:scale-[1.04] active:scale-[0.98] transition-transform cursor-pointer"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: meta.hex }}
                />
                <span className="text-xs font-medium text-white">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

