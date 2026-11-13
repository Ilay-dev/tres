import type { CardColor, CardColorOrWild, CardValue, UnoCard } from '../../shared/types.ts';

export const COLOR_META: Record<
  CardColor,
  {
    label: string;
    hex: string;
    border: string;
    glow: string;
    tint: string;
    text: string;
    dotClass: string;
  }
> = {
  red: {
    label: 'Rot',
    hex: '#EF4444',
    border: 'rgba(239, 68, 68, 0.52)',
    glow: 'rgba(239, 68, 68, 0.16)',
    tint: 'rgba(239, 68, 68, 0.09)',
    text: '#F87171',
    dotClass: 'bg-red-500',
  },
  yellow: {
    label: 'Gelb',
    hex: '#EAB308',
    border: 'rgba(234, 179, 8, 0.52)',
    glow: 'rgba(234, 179, 8, 0.16)',
    tint: 'rgba(234, 179, 8, 0.09)',
    text: '#FACC15',
    dotClass: 'bg-yellow-500',
  },
  green: {
    label: 'Grün',
    hex: '#22C55E',
    border: 'rgba(34, 197, 94, 0.52)',
    glow: 'rgba(34, 197, 94, 0.16)',
    tint: 'rgba(34, 197, 94, 0.09)',
    text: '#4ADE80',
    dotClass: 'bg-green-500',
  },
  blue: {
    label: 'Blau',
    hex: '#3B82F6',
    border: 'rgba(59, 130, 246, 0.52)',
    glow: 'rgba(59, 130, 246, 0.16)',
    tint: 'rgba(59, 130, 246, 0.09)',
    text: '#60A5FA',
    dotClass: 'bg-blue-500',
  },
};

export const COLOR_ORDER: Record<CardColorOrWild, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
  wild: 4,
};

export const VALUE_ORDER: Record<CardValue, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  skip: 10,
  reverse: 11,
  draw2: 12,
  wild: 13,
  wild4: 14,
};

export function sortHand(hand: readonly UnoCard[]): UnoCard[] {
  return [...hand].sort((a, b) => {
    const colorDiff = COLOR_ORDER[a.color] - COLOR_ORDER[b.color];
    if (colorDiff !== 0) return colorDiff;
    return VALUE_ORDER[a.value] - VALUE_ORDER[b.value];
  });
}

export function isPlayableClient(
  card: UnoCard,
  topCard: UnoCard | null,
  activeColor: CardColor | null,
  pendingDrawCount = 0
): boolean {
  if (!topCard || !activeColor) return false;
  if (pendingDrawCount > 0) {
    if (topCard.value === 'wild4') {
      return card.value === 'wild4';
    }
    return card.value === 'draw2' || card.value === 'wild4';
  }
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function canJumpInClient(
  card: UnoCard,
  topCard: UnoCard | null,
  activeColor: CardColor | null
): boolean {
  if (!topCard || !activeColor) return false;
  if (card.color === 'wild' || topCard.color === 'wild') return false;
  return card.color === topCard.color && card.value === topCard.value && activeColor === topCard.color;
}

export function findTwinCard(card: UnoCard, hand: readonly UnoCard[]): UnoCard | undefined {
  if (card.color === 'wild') return undefined;
  return hand.find(
    (other) => other.id !== card.id && other.color === card.color && other.value === card.value
  );
}

export function getShortCornerLabel(value: CardValue): string {
  switch (value) {
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'W';
    case 'wild4':
      return '+4';
    default:
      return value;
  }
}

export function getCardDescriptionDe(card: UnoCard): string {
  const valueNames: Record<CardValue, string> = {
    '0': '0',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    skip: 'Aussetzen',
    reverse: 'Richtungswechsel',
    draw2: '+2',
    wild: 'Farbwahl',
    wild4: 'Farbwahl +4',
  };
  if (card.color === 'wild') return valueNames[card.value];
  return `${COLOR_META[card.color].label} ${valueNames[card.value]}`;
}
