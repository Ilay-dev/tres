import type { UnoCard as UnoCardType } from '../../shared/types.ts';
import { COLOR_META, getCardDescriptionDe, getShortCornerLabel } from '../utils/cardLabels.ts';

interface UnoCardProps {
  card: UnoCardType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  highlighted?: boolean;
  rejected?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

function WildEmblem({ size }: { size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = {
    sm: 'w-6 h-6',
    md: 'w-11 h-11 sm:w-12 sm:h-12',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20 sm:w-24 sm:h-24',
  }[size];

  return (
    <svg viewBox="0 0 48 48" className={cls} aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
      <path d="M24 6 A18 18 0 0 1 42 24 L24 24 Z" fill="rgba(239, 68, 68, 0.85)" />
      <path d="M42 24 A18 18 0 0 1 24 42 L24 24 Z" fill="rgba(59, 130, 246, 0.85)" />
      <path d="M24 42 A18 18 0 0 1 6 24 L24 24 Z" fill="rgba(34, 197, 94, 0.85)" />
      <path d="M6 24 A18 18 0 0 1 24 6 L24 24 Z" fill="rgba(234, 179, 8, 0.85)" />
      <circle cx="24" cy="24" r="8.5" fill="#0B0B0E" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
    </svg>
  );
}

function WildFourEmblem({ size }: { size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = {
    sm: 'w-7 h-7',
    md: 'w-12 h-12 sm:w-14 sm:h-14',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24 sm:w-28 sm:h-28',
  }[size];

  return (
    <svg viewBox="0 0 56 56" className={cls} aria-hidden="true">
      <rect x="9" y="16" width="15" height="22" rx="3" fill="#101014" stroke="rgba(239,68,68,0.85)" strokeWidth="1.6" transform="rotate(-12 16 27)" />
      <rect x="17" y="12" width="15" height="22" rx="3" fill="#101014" stroke="rgba(234,179,8,0.85)" strokeWidth="1.6" transform="rotate(-3 24 23)" />
      <rect x="24" y="16" width="15" height="22" rx="3" fill="#101014" stroke="rgba(34,197,94,0.85)" strokeWidth="1.6" transform="rotate(6 31 27)" />
      <rect x="31" y="20" width="15" height="22" rx="3" fill="#101014" stroke="rgba(59,130,246,0.85)" strokeWidth="1.6" transform="rotate(14 38 31)" />
    </svg>
  );
}

function SkipIcon({ color, size }: { color: string; size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = {
    sm: 'w-5 h-5',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16 sm:w-20 sm:h-20',
  }[size];

  return (
    <svg viewBox="0 0 36 36" className={cls} fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="11.5" stroke={color} strokeWidth="2.6" />
      <line x1="9.8" y1="26.2" x2="26.2" y2="9.8" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function ReverseIcon({ color, size }: { color: string; size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = {
    sm: 'w-5 h-5',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16 sm:w-20 sm:h-20',
  }[size];

  return (
    <svg viewBox="0 0 36 36" className={cls} fill="none" aria-hidden="true">
      <path
        d="M9 13.5H26M26 13.5L21 8.5M26 13.5L21 18.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 22.5H10M10 22.5L15 17.5M10 22.5L15 27.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UnoCard({
  card,
  size = 'md',
  highlighted = false,
  rejected = false,
  interactive = false,
  onClick,
}: UnoCardProps) {
  const colorInfo = card.color === 'wild' ? null : COLOR_META[card.color];
  const corner = getShortCornerLabel(card.value);

  const sizeClasses = {
    sm: 'w-11 h-[62px] rounded-lg p-1.5',
    md: 'w-[84px] h-[122px] sm:w-[96px] sm:h-[140px] rounded-2xl p-2.5',
    lg: 'w-[120px] h-[174px] sm:w-[136px] sm:h-[198px] rounded-[20px] p-3',
    xl: 'w-[152px] h-[222px] sm:w-[186px] sm:h-[270px] rounded-[24px] p-4',
  }[size];

  const cornerTextSize = {
    sm: 'text-[10px]',
    md: 'text-xs sm:text-[13px]',
    lg: 'text-sm sm:text-base',
    xl: 'text-base sm:text-xl',
  }[size];

  const centerTextSize = {
    sm: 'text-base',
    md: 'text-3xl sm:text-[34px]',
    lg: 'text-4xl sm:text-5xl',
    xl: 'text-6xl sm:text-[68px]',
  }[size];

  const borderColor = rejected
    ? 'rgba(255, 255, 255, 0.95)'
    : highlighted
      ? 'rgba(255, 255, 255, 0.92)'
      : colorInfo
        ? colorInfo.border
        : 'rgba(255, 255, 255, 0.30)';

  const surfaceBackground = colorInfo
    ? `radial-gradient(circle at 50% 48%, ${colorInfo.glow} 0%, ${colorInfo.tint} 42%, #0A0A0C 82%), linear-gradient(155deg, #16161B 0%, #08080A 100%)`
    : 'radial-gradient(circle at 50% 48%, rgba(255,255,255,0.09) 0%, #09090B 78%), linear-gradient(155deg, #151519 0%, #070709 100%)';

  const accentHex = colorInfo ? colorInfo.hex : '#FFFFFF';
  const centerColor = colorInfo ? colorInfo.text : '#FFFFFF';
  const ovalStroke = colorInfo ? colorInfo.border : 'rgba(255, 255, 255, 0.20)';

  const showUnderline = card.value === '6' || card.value === '9';

  const renderCenter = () => {
    if (card.value === 'wild') {
      return <WildEmblem size={size} />;
    }
    if (card.value === 'wild4') {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <WildFourEmblem size={size} />
          <span
            className={`font-mono-code font-bold tracking-tight text-white ${
              size === 'sm' ? 'text-[10px]' : size === 'xl' ? 'text-base sm:text-lg' : 'text-xs'
            }`}
          >
            +4
          </span>
        </div>
      );
    }
    if (card.value === 'skip') {
      return <SkipIcon color={accentHex} size={size} />;
    }
    if (card.value === 'reverse') {
      return <ReverseIcon color={accentHex} size={size} />;
    }
    return (
      <span
        className={`font-bold tracking-tight select-none leading-none ${centerTextSize} ${
          showUnderline ? 'underline decoration-2 underline-offset-4' : ''
        }`}
        style={{ color: centerColor }}
      >
        {card.value === 'draw2' ? '+2' : card.value}
      </span>
    );
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={getCardDescriptionDe(card)}
      style={{
        background: surfaceBackground,
        borderColor,
        boxShadow: highlighted
          ? '0 0 0 1.5px rgba(255,255,255,0.9), 0 18px 38px rgba(0,0,0,0.9)'
          : '0 14px 32px rgba(0,0,0,0.82)',
      }}
      className={`animate-card-pop relative flex flex-col justify-between border overflow-hidden select-none transition-all duration-200 ease-out shrink-0 ${sizeClasses} ${
        interactive ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-white' : ''
      } ${rejected ? 'animate-card-reject' : ''}`}
    >
      {/* Subtle architectural inner frame */}
      {size !== 'sm' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[5px] rounded-[inherit] border border-white/[0.06]"
        />
      )}

      {/* Subtle diagonal UNO oval ring */}
      {size !== 'sm' && (
        <svg
          viewBox="0 0 100 140"
          className="pointer-events-none absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <ellipse
            cx="50"
            cy="70"
            rx="34"
            ry="50"
            transform="rotate(-22 50 70)"
            fill="none"
            stroke={ovalStroke}
            strokeWidth="1.2"
            strokeOpacity="0.48"
          />
        </svg>
      )}

      {/* Top-left corner */}
      <div className="relative z-10 flex items-center justify-between w-full leading-none">
        <span
          className={`font-mono-code font-bold ${cornerTextSize}`}
          style={{ color: centerColor }}
        >
          {corner}
        </span>
        {colorInfo ? (
          <span
            className={`rounded-full ${
              size === 'sm' ? 'w-1.5 h-1.5' : size === 'xl' ? 'w-2.5 h-2.5' : 'w-2 h-2'
            }`}
            style={{ backgroundColor: colorInfo.hex }}
          />
        ) : (
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-red-500" />
            <span className="w-1 h-1 rounded-full bg-yellow-500" />
            <span className="w-1 h-1 rounded-full bg-green-500" />
            <span className="w-1 h-1 rounded-full bg-blue-500" />
          </span>
        )}
      </div>

      {/* Center symbol / value */}
      <div className="relative z-10 flex items-center justify-center flex-1">
        {renderCenter()}
      </div>

      {/* Bottom-right corner */}
      <div className="relative z-10 flex items-center justify-end w-full leading-none">
        <span
          className={`font-mono-code font-bold rotate-180 ${cornerTextSize}`}
          style={{ color: centerColor }}
        >
          {corner}
        </span>
      </div>
    </Component>
  );
}
