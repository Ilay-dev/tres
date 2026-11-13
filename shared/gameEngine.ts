import type {
  CardColor,
  CardValue,
  GameEvent,
  GameMode,
  RoundPlayerBreakdown,
  RoundSummary,
  TurnDirection,
  UnoCard,
} from './types.js';

export const CARD_COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'] as const;

export const COLOR_LABELS_DE: Record<CardColor, string> = {
  red: 'Rot',
  yellow: 'Gelb',
  green: 'Grün',
  blue: 'Blau',
};

export interface InternalPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  reconnectToken: string;
  socketId: string | null;
  hand: UnoCard[];
  score: number;
  unoCalled: boolean;
  unoVulnerable: boolean;
}

export interface InternalChallenge {
  offenderId: string;
  offenderName: string;
  targetId: string;
  targetName: string;
  previousColor: CardColor;
  chosenColor: CardColor;
  wasBluff: boolean;
}

export interface InternalGameState {
  roundNumber: number;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  currentPlayerIndex: number;
  direction: TurnDirection;
  activeColor: CardColor;
  pendingInitialColorChoice: boolean;
  drawnDecisionPlayerId: string | null;
  drawnPlayableCardId: string | null;
  pendingChallenge: InternalChallenge | null;
  roundSummary: RoundSummary | null;
  eventLog: GameEvent[];
}

export interface EngineActionResult {
  ok: boolean;
  error?: string;
  roundEnded?: boolean;
  wasJumpIn?: boolean;
}

export function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    const maxValid = Math.floor(0xffffffff / range) * range;
    let rand = 0;
    do {
      cryptoObj.getRandomValues(buf);
      rand = buf[0];
    } while (rand >= maxValid);
    return min + (rand % range);
  }
  return min + Math.floor(Math.random() * range);
}

export function createStandardDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of CARD_COLORS) {
    deck.push({ id: `${color}-0-1`, color, value: '0' });
    const doubledValues: CardValue[] = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'skip',
      'reverse',
      'draw2',
    ];
    for (const value of doubledValues) {
      deck.push({ id: `${color}-${value}-1`, color, value });
      deck.push({ id: `${color}-${value}-2`, color, value });
    }
  }
  for (let i = 1; i <= 4; i++) {
    deck.push({ id: `wild-wild-${i}`, color: 'wild', value: 'wild' });
    deck.push({ id: `wild-wild4-${i}`, color: 'wild', value: 'wild4' });
  }
  return deck;
}

export function shuffleCards<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function getCardPoints(card: UnoCard): number {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number.parseInt(card.value, 10);
}

export function calculateHandPoints(hand: readonly UnoCard[]): number {
  return hand.reduce((sum, card) => sum + getCardPoints(card), 0);
}

export function formatCardLabelDe(card: UnoCard): string {
  const valueMap: Record<CardValue, string> = {
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
  if (card.color === 'wild') return valueMap[card.value];
  return `${COLOR_LABELS_DE[card.color]} ${valueMap[card.value]}`;
}

export function isCardPlayable(
  card: UnoCard,
  topCard: UnoCard,
  activeColor: CardColor
): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function canJumpInCard(
  card: UnoCard,
  topCard: UnoCard,
  activeColor: CardColor
): boolean {
  if (card.color === 'wild' || topCard.color === 'wild') return false;
  return card.color === topCard.color && card.value === topCard.value && activeColor === topCard.color;
}

export function nextPlayerIndex(
  currentIndex: number,
  direction: TurnDirection,
  playerCount: number,
  steps = 1
): number {
  return (((currentIndex + direction * steps) % playerCount) + playerCount) % playerCount;
}

let eventCounter = 0;

export function pushEvent(
  game: InternalGameState,
  message: string,
  accent: CardColor | 'neutral' = 'neutral'
): void {
  eventCounter += 1;
  const event: GameEvent = {
    id: `evt-${Date.now()}-${eventCounter}`,
    message,
    accent,
    timestamp: Date.now(),
  };
  game.eventLog.unshift(event);
  if (game.eventLog.length > 25) {
    game.eventLog.length = 25;
  }
}

function drawFromPile(game: InternalGameState, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (game.drawPile.length === 0) {
      if (game.discardPile.length <= 1) {
        break;
      }
      const top = game.discardPile[game.discardPile.length - 1];
      const recyclable = game.discardPile.slice(0, -1);
      game.drawPile = shuffleCards(recyclable);
      game.discardPile = [top];
    }
    const card = game.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

function giveCardsToPlayer(
  game: InternalGameState,
  player: InternalPlayer,
  count: number
): UnoCard[] {
  const drawn = drawFromPile(game, count);
  player.hand.push(...drawn);
  if (player.hand.length !== 1) {
    player.unoCalled = false;
    player.unoVulnerable = false;
  }
  return drawn;
}

function clearUnoVulnerabilitiesExcept(
  players: InternalPlayer[],
  exemptPlayerId?: string
): void {
  for (const p of players) {
    if (p.id !== exemptPlayerId) {
      p.unoVulnerable = false;
    }
  }
}

export function startRound(
  players: InternalPlayer[],
  roundNumber: number
): InternalGameState {
  if (players.length < 2) {
    throw new Error('Mindestens 2 Spieler erforderlich.');
  }

  let deck = shuffleCards(createStandardDeck());

  for (const player of players) {
    player.hand = [];
    player.unoCalled = false;
    player.unoVulnerable = false;
    for (let i = 0; i < 7; i++) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  let firstCard = deck.pop()!;
  while (firstCard.value === 'wild4') {
    deck.unshift(firstCard);
    deck = shuffleCards(deck);
    firstCard = deck.pop()!;
  }

  const game: InternalGameState = {
    roundNumber,
    drawPile: deck,
    discardPile: [firstCard],
    currentPlayerIndex: 0,
    direction: 1,
    activeColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
    pendingInitialColorChoice: false,
    drawnDecisionPlayerId: null,
    drawnPlayableCardId: null,
    pendingChallenge: null,
    roundSummary: null,
    eventLog: [],
  };

  if (firstCard.value === 'wild') {
    game.pendingInitialColorChoice = true;
    game.currentPlayerIndex = 0;
    pushEvent(
      game,
      `Runde ${roundNumber}: Startkarte ist Farbwahl — ${players[0].name} wählt die Startfarbe.`
    );
  } else if (firstCard.value === 'skip') {
    game.currentPlayerIndex = nextPlayerIndex(0, 1, players.length, 1);
    pushEvent(
      game,
      `Startkarte: ${formatCardLabelDe(firstCard)} — ${players[0].name} setzt aus.`,
      firstCard.color === 'wild' ? 'neutral' : firstCard.color
    );
  } else if (firstCard.value === 'reverse') {
    game.direction = -1;
    if (players.length === 2) {
      game.currentPlayerIndex = 1;
      pushEvent(
        game,
        `Startkarte: Richtungswechsel — ${players[0].name} setzt aus (2-Spieler-Regel).`,
        firstCard.color === 'wild' ? 'neutral' : firstCard.color
      );
    } else {
      game.currentPlayerIndex = players.length - 1;
      pushEvent(
        game,
        `Startkarte: Richtungswechsel — ${players[game.currentPlayerIndex].name} beginnt.`,
        firstCard.color === 'wild' ? 'neutral' : firstCard.color
      );
    }
  } else if (firstCard.value === 'draw2') {
    giveCardsToPlayer(game, players[0], 2);
    game.currentPlayerIndex = nextPlayerIndex(0, 1, players.length, 1);
    pushEvent(
      game,
      `Startkarte: +2 — ${players[0].name} zieht 2 Karten und setzt aus.`,
      firstCard.color === 'wild' ? 'neutral' : firstCard.color
    );
  } else {
    pushEvent(
      game,
      `Runde ${roundNumber} gestartet — ${players[0].name} beginnt (${formatCardLabelDe(firstCard)}).`,
      firstCard.color === 'wild' ? 'neutral' : firstCard.color
    );
  }

  return game;
}

function finalizeRoundWin(
  game: InternalGameState,
  players: InternalPlayer[],
  winner: InternalPlayer
): void {
  let pointsEarned = 0;
  const breakdown: RoundPlayerBreakdown[] = players.map((p) => {
    const handPoints = p.id === winner.id ? 0 : calculateHandPoints(p.hand);
    pointsEarned += handPoints;
    return {
      id: p.id,
      name: p.name,
      handPoints,
      totalScore: p.score,
      remainingCards: [...p.hand],
    };
  });

  winner.score += pointsEarned;
  for (const row of breakdown) {
    if (row.id === winner.id) {
      row.totalScore = winner.score;
    }
  }

  breakdown.sort((a, b) => b.totalScore - a.totalScore);

  game.roundSummary = {
    winnerId: winner.id,
    winnerName: winner.name,
    pointsEarned,
    breakdown,
  };
  game.drawnDecisionPlayerId = null;
  game.drawnPlayableCardId = null;
  game.pendingChallenge = null;
  game.pendingInitialColorChoice = false;
  pushEvent(game, `${winner.name} gewinnt Runde ${game.roundNumber} (+${pointsEarned} Punkte)!`);
}

export function chooseInitialColor(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string,
  color: CardColor
): EngineActionResult {
  if (game.roundSummary) {
    return { ok: false, error: 'Die Runde ist bereits beendet.' };
  }
  if (!game.pendingInitialColorChoice) {
    return { ok: false, error: 'Keine Startfarbe ausstehend.' };
  }
  const current = players[game.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, error: 'Du bist nicht an der Reihe.' };
  }
  game.activeColor = color;
  game.pendingInitialColorChoice = false;
  pushEvent(
    game,
    `${current.name} wählt ${COLOR_LABELS_DE[color]} als Startfarbe und ist am Zug.`,
    color
  );
  return { ok: true };
}

export function playCard(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string,
  cardId: string,
  chosenColor?: CardColor,
  options?: { gameMode?: GameMode }
): EngineActionResult {
  return playCards(game, players, playerId, [cardId], chosenColor, options);
}

export function playCards(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string,
  cardIds: string[],
  chosenColor?: CardColor,
  options?: { gameMode?: GameMode }
): EngineActionResult {
  if (game.roundSummary) {
    return { ok: false, error: 'Die Runde ist bereits beendet.' };
  }
  if (game.pendingInitialColorChoice) {
    return { ok: false, error: 'Zuerst muss die Startfarbe gewählt werden.' };
  }
  if (game.pendingChallenge) {
    return { ok: false, error: 'Zuerst muss das +4 geklärt werden.' };
  }
  if (cardIds.length < 1 || cardIds.length > 2) {
    return { ok: false, error: 'Du kannst 1 oder 2 identische Karten legen.' };
  }

  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length) {
    return { ok: false, error: 'Doppelte Kartenauswahl ungültig.' };
  }

  const playerIndex = players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }
  const actingPlayer = players[playerIndex];
  const currentPlayer = players[game.currentPlayerIndex];
  const isTurnPlayer = currentPlayer?.id === playerId;
  const gameMode: GameMode = options?.gameMode ?? 'standard';
  const topCard = game.discardPile[game.discardPile.length - 1];

  const selectedCards: UnoCard[] = [];
  for (const id of cardIds) {
    const found = actingPlayer.hand.find((c) => c.id === id);
    if (!found) {
      return { ok: false, error: 'Karte nicht auf deiner Hand gefunden.' };
    }
    selectedCards.push(found);
  }

  const primaryCard = selectedCards[0];

  if (selectedCards.length === 2) {
    if (!isTurnPlayer) {
      return { ok: false, error: '2 Karten gleichzeitig kannst du nur in deinem Zug legen.' };
    }
    if (game.drawnDecisionPlayerId) {
      return { ok: false, error: 'Nach dem Ziehen darfst du nur die gezogene Karte legen.' };
    }
    const secondCard = selectedCards[1];
    if (
      primaryCard.color === 'wild' ||
      secondCard.color === 'wild' ||
      primaryCard.color !== secondCard.color ||
      primaryCard.value !== secondCard.value
    ) {
      return {
        ok: false,
        error: 'Gleichzeitig legen geht nur mit 2 Karten derselben Farbe und demselben Wert.',
      };
    }
    if (!isCardPlayable(primaryCard, topCard, game.activeColor)) {
      return { ok: false, error: 'Diese Karten passen nicht auf die aktuelle Ablagekarte.' };
    }
  } else {
    if (isTurnPlayer) {
      if (game.drawnDecisionPlayerId) {
        if (
          game.drawnDecisionPlayerId !== playerId ||
          game.drawnPlayableCardId !== primaryCard.id
        ) {
          return {
            ok: false,
            error: 'Nach dem Ziehen darfst du nur die gezogene Karte spielen oder behalten.',
          };
        }
      }
      if (!isCardPlayable(primaryCard, topCard, game.activeColor)) {
        return { ok: false, error: 'Diese Karte passt nicht auf die aktuelle Ablagekarte.' };
      }
    } else {
      if (gameMode !== 'jump_in') {
        return { ok: false, error: 'Du bist nicht am Zug.' };
      }
      if (!canJumpInCard(primaryCard, topCard, game.activeColor)) {
        return {
          ok: false,
          error: 'Einwerfen nur mit exakt gleicher Karte (gleiche Farbe & gleicher Wert) möglich.',
        };
      }
    }
  }

  const isJumpIn = !isTurnPlayer && gameMode === 'jump_in';
  const remainingAfterPlay = actingPlayer.hand.length - selectedCards.length;
  const isLastPlay = remainingAfterPlay === 0;

  if ((primaryCard.value === 'wild' || primaryCard.value === 'wild4') && !isLastPlay && !chosenColor) {
    return { ok: false, error: 'Bitte wähle eine Farbe aus.' };
  }

  clearUnoVulnerabilitiesExcept(players, actingPlayer.id);

  const previousActiveColor = game.activeColor;
  const wasBluff =
    primaryCard.value === 'wild4' &&
    actingPlayer.hand.some((c) => c.id !== primaryCard.id && c.color === previousActiveColor);

  actingPlayer.hand = actingPlayer.hand.filter((c) => !uniqueIds.has(c.id));
  game.discardPile.push(...selectedCards);
  game.drawnDecisionPlayerId = null;
  game.drawnPlayableCardId = null;

  if (actingPlayer.hand.length === 1) {
    if (!actingPlayer.unoCalled) {
      actingPlayer.unoVulnerable = true;
    }
  } else {
    actingPlayer.unoCalled = false;
    actingPlayer.unoVulnerable = false;
  }

  if (actingPlayer.hand.length === 0) {
    if (primaryCard.color !== 'wild') {
      game.activeColor = primaryCard.color;
    } else if (chosenColor) {
      game.activeColor = chosenColor;
    }

    if (primaryCard.value === 'draw2') {
      const drawAmount = selectedCards.length * 2;
      const victimIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
      giveCardsToPlayer(game, players[victimIndex], drawAmount);
      pushEvent(
        game,
        `${actingPlayer.name} legt ${selectedCards.length === 2 ? '2× ' : ''}${formatCardLabelDe(primaryCard)} als letzte Karte — ${players[victimIndex].name} zieht ${drawAmount}.`,
        game.activeColor
      );
    } else if (primaryCard.value === 'wild4') {
      const victimIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
      giveCardsToPlayer(game, players[victimIndex], 4);
      pushEvent(
        game,
        `${actingPlayer.name} legt +4 als letzte Karte — ${players[victimIndex].name} zieht 4.`,
        game.activeColor
      );
    }

    finalizeRoundWin(game, players, actingPlayer);
    return { ok: true, roundEnded: true, wasJumpIn: isJumpIn };
  }

  const pairCount = selectedCards.length;

  if (primaryCard.value === 'wild') {
    game.activeColor = chosenColor!;
    game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
    pushEvent(
      game,
      `${actingPlayer.name} wählt ${COLOR_LABELS_DE[game.activeColor]}.`,
      game.activeColor
    );
  } else if (primaryCard.value === 'wild4') {
    game.activeColor = chosenColor!;
    const targetIdx = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
    const target = players[targetIdx];
    game.currentPlayerIndex = targetIdx;
    game.pendingChallenge = {
      offenderId: actingPlayer.id,
      offenderName: actingPlayer.name,
      targetId: target.id,
      targetName: target.name,
      previousColor: previousActiveColor,
      chosenColor: game.activeColor,
      wasBluff,
    };
    pushEvent(
      game,
      `${actingPlayer.name} spielt +4 (Farbe: ${COLOR_LABELS_DE[game.activeColor]}) auf ${target.name}.`,
      game.activeColor
    );
  } else if (primaryCard.value === 'skip') {
    game.activeColor = primaryCard.color as CardColor;
    if (pairCount === 2) {
      if (players.length === 2) {
        game.currentPlayerIndex = playerIndex;
      } else {
        game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 3);
      }
      pushEvent(
        game,
        `${actingPlayer.name} legt 2× ${formatCardLabelDe(primaryCard)}.`,
        game.activeColor
      );
    } else {
      const skippedIdx = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
      game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 2);
      pushEvent(
        game,
        isJumpIn
          ? `${actingPlayer.name} wirft ${formatCardLabelDe(primaryCard)} ein — ${players[skippedIdx].name} setzt aus.`
          : `${actingPlayer.name} setzt ${players[skippedIdx].name} aus.`,
        game.activeColor
      );
    }
  } else if (primaryCard.value === 'reverse') {
    game.activeColor = primaryCard.color as CardColor;
    if (pairCount === 2) {
      if (players.length === 2) {
        game.currentPlayerIndex = playerIndex;
      } else {
        game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
      }
      pushEvent(
        game,
        `${actingPlayer.name} legt 2× ${formatCardLabelDe(primaryCard)}.`,
        game.activeColor
      );
    } else {
      game.direction = (game.direction * -1) as TurnDirection;
      if (players.length === 2) {
        game.currentPlayerIndex = playerIndex;
        pushEvent(
          game,
          `${actingPlayer.name} spielt Richtungswechsel und ist direkt wieder dran.`,
          game.activeColor
        );
      } else {
        game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
        pushEvent(
          game,
          isJumpIn
            ? `${actingPlayer.name} wirft Richtungswechsel ein.`
            : `${actingPlayer.name} wechselt die Spielrichtung.`,
          game.activeColor
        );
      }
    }
  } else if (primaryCard.value === 'draw2') {
    game.activeColor = primaryCard.color as CardColor;
    const drawAmount = pairCount * 2;
    const victimIdx = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
    const victim = players[victimIdx];
    giveCardsToPlayer(game, victim, drawAmount);
    game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 2);
    pushEvent(
      game,
      isJumpIn
        ? `${actingPlayer.name} wirft +2 ein — ${victim.name} zieht 2 Karten und setzt aus.`
        : `${actingPlayer.name} spielt ${pairCount === 2 ? '2× +2' : '+2'} — ${victim.name} zieht ${drawAmount} Karten und setzt aus.`,
      game.activeColor
    );
  } else {
    game.activeColor = primaryCard.color as CardColor;
    if (isJumpIn) {
      game.currentPlayerIndex = playerIndex;
      pushEvent(
        game,
        `${actingPlayer.name} wirft ${formatCardLabelDe(primaryCard)} ein und ist jetzt dran!`,
        game.activeColor
      );
    } else {
      game.currentPlayerIndex = nextPlayerIndex(playerIndex, game.direction, players.length, 1);
      pushEvent(
        game,
        pairCount === 2
          ? `${actingPlayer.name} legt 2× ${formatCardLabelDe(primaryCard)}.`
          : `${actingPlayer.name} legt ${formatCardLabelDe(primaryCard)}.`,
        game.activeColor
      );
    }
  }

  return { ok: true, wasJumpIn: isJumpIn };
}

export function drawCardAction(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string
): EngineActionResult {
  if (game.roundSummary) {
    return { ok: false, error: 'Die Runde ist bereits beendet.' };
  }
  if (game.pendingInitialColorChoice) {
    return { ok: false, error: 'Zuerst muss die Startfarbe gewählt werden.' };
  }
  if (game.pendingChallenge) {
    return { ok: false, error: 'Zuerst muss das +4 geklärt werden.' };
  }
  if (game.drawnDecisionPlayerId) {
    return { ok: false, error: 'Du hast bereits eine Karte gezogen.' };
  }

  const currentPlayer = players[game.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { ok: false, error: 'Du bist nicht am Zug.' };
  }

  clearUnoVulnerabilitiesExcept(players);

  const drawn = giveCardsToPlayer(game, currentPlayer, 1);
  if (drawn.length === 0) {
    game.currentPlayerIndex = nextPlayerIndex(
      game.currentPlayerIndex,
      game.direction,
      players.length,
      1
    );
    pushEvent(game, `Nachziehstapel leer — ${currentPlayer.name} gibt ab.`);
    return { ok: true };
  }

  const drawnCard = drawn[0];
  const topCard = game.discardPile[game.discardPile.length - 1];

  if (isCardPlayable(drawnCard, topCard, game.activeColor)) {
    game.drawnDecisionPlayerId = currentPlayer.id;
    game.drawnPlayableCardId = drawnCard.id;
    pushEvent(game, `${currentPlayer.name} zieht eine spielbare Karte.`);
  } else {
    game.currentPlayerIndex = nextPlayerIndex(
      game.currentPlayerIndex,
      game.direction,
      players.length,
      1
    );
    pushEvent(game, `${currentPlayer.name} zieht 1 Karte.`);
  }

  return { ok: true };
}

export function keepDrawnCard(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string
): EngineActionResult {
  if (game.drawnDecisionPlayerId !== playerId) {
    return { ok: false, error: 'Keine gezogene Karte zum Behalten vorhanden.' };
  }
  const currentPlayer = players[game.currentPlayerIndex];
  game.drawnDecisionPlayerId = null;
  game.drawnPlayableCardId = null;
  game.currentPlayerIndex = nextPlayerIndex(
    game.currentPlayerIndex,
    game.direction,
    players.length,
    1
  );
  pushEvent(game, `${currentPlayer.name} behält die gezogene Karte.`);
  return { ok: true };
}

export function resolveWild4Challenge(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string,
  challenge: boolean
): EngineActionResult {
  const pending = game.pendingChallenge;
  if (!pending) {
    return { ok: false, error: 'Kein offenes +4 zum Anzweifeln.' };
  }
  if (pending.targetId !== playerId) {
    return { ok: false, error: 'Nur der betroffene Spieler darf entscheiden.' };
  }

  const targetIdx = players.findIndex((p) => p.id === pending.targetId);
  const offender = players.find((p) => p.id === pending.offenderId);
  const target = players[targetIdx];
  game.pendingChallenge = null;

  if (!target || !offender) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }

  if (!challenge) {
    giveCardsToPlayer(game, target, 4);
    game.currentPlayerIndex = nextPlayerIndex(targetIdx, game.direction, players.length, 1);
    pushEvent(game, `${target.name} akzeptiert und zieht 4 Karten.`, game.activeColor);
    return { ok: true };
  }

  if (pending.wasBluff) {
    giveCardsToPlayer(game, offender, 4);
    game.currentPlayerIndex = targetIdx;
    pushEvent(
      game,
      `Bluff aufgedeckt! ${offender.name} hatte ${COLOR_LABELS_DE[pending.previousColor]} und zieht 4 Karten.`,
      game.activeColor
    );
  } else {
    giveCardsToPlayer(game, target, 6);
    game.currentPlayerIndex = nextPlayerIndex(targetIdx, game.direction, players.length, 1);
    pushEvent(
      game,
      `Anzweifeln fehlgeschlagen! ${target.name} zieht 6 Karten.`,
      game.activeColor
    );
  }

  return { ok: true };
}

function hasPlayablePair(
  hand: readonly UnoCard[],
  topCard: UnoCard,
  activeColor: CardColor
): boolean {
  const counts = new Map<string, UnoCard>();
  for (const card of hand) {
    if (card.color === 'wild') continue;
    const key = `${card.color}-${card.value}`;
    if (counts.has(key) && isCardPlayable(card, topCard, activeColor)) {
      return true;
    }
    counts.set(key, card);
  }
  return false;
}

export function callUno(
  game: InternalGameState,
  players: InternalPlayer[],
  playerId: string,
  options?: { gameMode?: GameMode }
): EngineActionResult {
  if (game.roundSummary) {
    return { ok: false, error: 'Runde bereits beendet.' };
  }
  const player = players.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }
  const topCard = game.discardPile[game.discardPile.length - 1];
  const isMyTurn = players[game.currentPlayerIndex]?.id === playerId;
  const canPreCallForPair =
    isMyTurn && player.hand.length === 3 && hasPlayablePair(player.hand, topCard, game.activeColor);
  const canPreCallForJumpIn =
    options?.gameMode === 'jump_in' &&
    player.hand.length === 2 &&
    player.hand.some((c) => canJumpInCard(c, topCard, game.activeColor));

  if (
    player.hand.length === 1 ||
    (isMyTurn && player.hand.length === 2) ||
    canPreCallForPair ||
    canPreCallForJumpIn
  ) {
    player.unoCalled = true;
    player.unoVulnerable = false;
    pushEvent(game, `${player.name} ruft UNO!`);
    return { ok: true };
  }
  return {
    ok: false,
    error: 'UNO! kannst du erst vor deiner vorletzten bzw. bei 1 Karte rufen.',
  };
}

export function catchUno(
  game: InternalGameState,
  players: InternalPlayer[],
  catcherId: string,
  targetPlayerId: string
): EngineActionResult {
  if (game.roundSummary) {
    return { ok: false, error: 'Runde bereits beendet.' };
  }
  if (catcherId === targetPlayerId) {
    return { ok: false, error: 'Du kannst dich nicht selbst erwischen.' };
  }
  const catcher = players.find((p) => p.id === catcherId);
  const target = players.find((p) => p.id === targetPlayerId);
  if (!catcher || !target) {
    return { ok: false, error: 'Spieler nicht gefunden.' };
  }
  if (!target.unoVulnerable || target.hand.length !== 1) {
    return {
      ok: false,
      error: `${target.name} hat bereits UNO gerufen oder ist nicht angreifbar.`,
    };
  }
  target.unoVulnerable = false;
  target.unoCalled = false;
  giveCardsToPlayer(game, target, 2);
  pushEvent(game, `${catcher.name} hat ${target.name} erwischt! +2 Strafkarten.`);
  return { ok: true };
}

