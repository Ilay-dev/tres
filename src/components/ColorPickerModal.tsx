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
  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-[#09090B] p-5 shadow-2xl animate-card-pop">
        <div className="text-center mb-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {COLORS.map((color) => {
            const meta = COLOR_META[color];
            return (
              <button
                key={color}
                type="button"
                onClick={() => onSelect(color)}
                style={{
                  borderColor: meta.border,
                  background: `radial-gradient(circle at 50% 50%, ${meta.tint} 0%, #0D0D0F 85%)`,
                }}
                className="rounded-xl border py-4 px-3 flex flex-col items-center gap-2 hover:scale-[1.02] transition-transform cursor-pointer"
              >
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: meta.hex }}
                />
                <span className="text-xs font-medium text-white">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 w-full text-xs text-zinc-400 hover:text-white py-2 transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}

