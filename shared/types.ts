export type CardColor = 'red' | 'yellow' | 'green' | 'blue';
export type CardColorOrWild = CardColor | 'wild';

export type NumberCardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type ActionCardValue = 'skip' | 'reverse' | 'draw2';
export type WildCardValue = 'wild' | 'wild4';
export type CardValue = NumberCardValue | ActionCardValue | WildCardValue;

export interface UnoCard {
  id: string;
  color: CardColorOrWild;
  value: CardValue;
}

export type RoomPhase = 'lobby' | 'playing' | 'round_over';
export type GameMode = 'standard' | 'jump_in';
export type TurnDirection = 1 | -1;

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  isReady: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  cardCount: number;
  score: number;
  unoCalled: boolean;
  unoVulnerable: boolean;
}

export interface PendingChallenge {
  offenderId: string;
  offenderName: string;
  targetId: string;
  targetName: string;
  chosenColor: CardColor;
}

export interface GameEvent {
  id: string;
  message: string;
  accent?: CardColor | 'neutral';
  timestamp: number;
}

export interface RoundPlayerBreakdown {
  id: string;
  name: string;
  handPoints: number;
  totalScore: number;
  remainingCards: UnoCard[];
}

export interface RoundSummary {
  winnerId: string;
  winnerName: string;
  pointsEarned: number;
  breakdown: RoundPlayerBreakdown[];
}

export interface ClientRoomState {
  roomCode: string;
  phase: RoomPhase;
  gameMode: GameMode;
  myPlayerId: string;
  hostId: string;
  players: PublicPlayer[];
  myHand: UnoCard[];
  countdownSeconds: number | null;
  roundNumber: number;
  currentPlayerId: string | null;
  direction: TurnDirection;
  activeColor: CardColor | null;
  topCard: UnoCard | null;
  recentDiscardCards: UnoCard[];
  drawPileCount: number;
  discardPileCount: number;
  pendingInitialColorChoice: boolean;
  drawnDecisionPlayerId: string | null;
  drawnPlayableCardId: string | null;
  pendingChallenge: PendingChallenge | null;
  lastEvent: GameEvent | null;
  eventLog: GameEvent[];
  roundSummary: RoundSummary | null;
}

export interface SessionCredentials {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface RoomActionResponse {
  ok: boolean;
  error?: string;
  credentials?: SessionCredentials;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { playerName: string },
    ack: (res: RoomActionResponse) => void
  ) => void;
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: (res: RoomActionResponse) => void
  ) => void;
  'room:rejoin': (
    payload: SessionCredentials,
    ack: (res: RoomActionResponse) => void
  ) => void;
  'room:leave': (ack?: (res: RoomActionResponse) => void) => void;
  'room:toggle_ready': (ack?: (res: RoomActionResponse) => void) => void;
  'room:set_game_mode': (
    payload: { gameMode: GameMode },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'room:add_bot': (ack?: (res: RoomActionResponse) => void) => void;
  'room:remove_player': (
    payload: { targetPlayerId: string },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'room:skip_disconnected': (
    payload: { targetPlayerId: string },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'room:next_round': (ack?: (res: RoomActionResponse) => void) => void;
  'game:choose_initial_color': (
    payload: { color: CardColor },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'game:play_card': (
    payload: { cardId: string; chosenColor?: CardColor },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'game:play_cards': (
    payload: { cardIds: string[]; chosenColor?: CardColor },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'game:draw_card': (ack?: (res: RoomActionResponse) => void) => void;
  'game:keep_drawn_card': (ack?: (res: RoomActionResponse) => void) => void;
  'game:resolve_challenge': (
    payload: { challenge: boolean },
    ack?: (res: RoomActionResponse) => void
  ) => void;
  'game:call_uno': (ack?: (res: RoomActionResponse) => void) => void;
  'game:catch_uno': (
    payload: { targetPlayerId: string },
    ack?: (res: RoomActionResponse) => void
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: ClientRoomState) => void;
  'room:kicked': (payload: { reason: string }) => void;
}
