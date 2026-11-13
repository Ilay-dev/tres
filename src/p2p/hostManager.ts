import type {
  CardColor,
  ClientRoomState,
  GameMode,
  PublicPlayer,
  RoomActionResponse,
  RoomPhase,
  SessionCredentials,
} from '../../shared/types.js';
import {
  CARD_COLORS,
  type InternalGameState,
  type InternalPlayer,
  chooseInitialColor,
  drawCardAction,
  isCardPlayable,
  keepDrawnCard,
  nextPlayerIndex,
  playCards,
  pushEvent,
  secureRandomInt,
  startRound,
} from '../../shared/gameEngine.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Nova (Bot)', 'Kairo (Bot)', 'Vega (Bot)', 'Echo (Bot)', 'Atlas (Bot)', 'Lyra (Bot)'];

export interface BrowserRoom {
  code: string;
  phase: RoomPhase;
  gameMode: GameMode;
  hostId: string;
  players: InternalPlayer[];
  roundNumber: number;
  countdownSeconds: number | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  game: InternalGameState | null;
}

export type PeerSendFn = (peerId: string, state: ClientRoomState) => void;
export type PeerKickFn = (peerId: string, reason: string) => void;

export function generateBrowserRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_ALPHABET[secureRandomInt(0, ROOM_ALPHABET.length)];
  }
  return code;
}

export class BrowserHostManager {
  public readonly room: BrowserRoom;
  private onBroadcast: PeerSendFn;
  private onKicked: PeerKickFn;

  constructor(
    roomCode: string,
    hostName: string,
    onBroadcast: PeerSendFn,
    onKicked: PeerKickFn
  ) {
    this.onBroadcast = onBroadcast;
    this.onKicked = onKicked;

    const hostId = globalThis.crypto.randomUUID();
    const host: InternalPlayer = {
      id: hostId,
      name: this.sanitizeName(hostName),
      isHost: true,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken: globalThis.crypto.randomUUID(),
      socketId: 'HOST_LOCAL',
      hand: [],
      score: 0,
    };

    this.room = {
      code: roomCode,
      phase: 'lobby',
      gameMode: 'standard',
      hostId,
      players: [host],
      roundNumber: 0,
      countdownSeconds: null,
      countdownTimer: null,
      botTimer: null,
      game: null,
    };
  }

  public getHostPlayerId(): string {
    return this.room.hostId;
  }

  public destroy(): void {
    this.clearCountdown();
    this.clearBotTimer();
  }

  private sanitizeName(rawName: string): string {
    const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
    return cleaned || 'Spieler';
  }

  private uniqueName(baseName: string): string {
    const existing = new Set(this.room.players.map((p) => p.name.toLowerCase()));
    if (!existing.has(baseName.toLowerCase())) return baseName;
    for (let i = 2; i <= 20; i++) {
      const candidate = `${baseName.slice(0, 16)} (${i})`;
      if (!existing.has(candidate.toLowerCase())) return candidate;
    }
    return `${baseName.slice(0, 14)}-${secureRandomInt(10, 99)}`;
  }

  private clearCountdown(): void {
    if (this.room.countdownTimer) {
      clearInterval(this.room.countdownTimer);
      this.room.countdownTimer = null;
    }
    this.room.countdownSeconds = null;
  }

  private clearBotTimer(): void {
    if (this.room.botTimer) {
      clearTimeout(this.room.botTimer);
      this.room.botTimer = null;
    }
  }

  public broadcast(): void {
    for (const player of this.room.players) {
      if (player.socketId && player.connected) {
        this.onBroadcast(player.socketId, this.serializeForPlayer(player.id));
      }
    }
  }

  public serializeForPlayer(playerId: string): ClientRoomState {
    const me = this.room.players.find((p) => p.id === playerId);
    const game = this.room.game;

    const publicPlayers: PublicPlayer[] = this.room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isBot: p.isBot,
      isReady: p.isReady,
      connected: p.connected,
      disconnectedAt: p.disconnectedAt,
      cardCount: p.hand.length,
      score: p.score,
    }));

    const currentPlayer =
      game && this.room.players[game.currentPlayerIndex]
        ? this.room.players[game.currentPlayerIndex]
        : null;

    return {
      roomCode: this.room.code,
      phase: this.room.phase,
      gameMode: this.room.gameMode,
      myPlayerId: playerId,
      hostId: this.room.hostId,
      players: publicPlayers,
      myHand: me ? [...me.hand] : [],
      countdownSeconds: this.room.countdownSeconds,
      roundNumber: game?.roundNumber ?? this.room.roundNumber,
      currentPlayerId: currentPlayer?.id ?? null,
      direction: game?.direction ?? 1,
      activeColor: game?.activeColor ?? null,
      topCard: game ? game.discardPile[game.discardPile.length - 1] ?? null : null,
      recentDiscardCards: game ? game.discardPile.slice(-4) : [],
      drawPileCount: game?.drawPile.length ?? 0,
      discardPileCount: game?.discardPile.length ?? 0,
      pendingInitialColorChoice: game?.pendingInitialColorChoice ?? false,
      drawnDecisionPlayerId: game?.drawnDecisionPlayerId ?? null,
      drawnPlayableCardId:
        game && game.drawnDecisionPlayerId === playerId ? game.drawnPlayableCardId : null,
      lastEvent: game?.eventLog[0] ?? null,
      eventLog: game?.eventLog ?? [],
      roundSummary: game?.roundSummary ?? null,
    };
  }

  private findPlayerByPeer(peerId: string): InternalPlayer | undefined {
    return this.room.players.find((p) => p.socketId === peerId);
  }

  public joinGuest(peerId: string, rawName: string): RoomActionResponse {
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'In diesem Room läuft bereits eine Runde.' };
    }
    if (this.room.players.length >= 10) {
      return { ok: false, error: 'Dieser Room ist voll (maximal 10 Spieler).' };
    }

    const existing = this.findPlayerByPeer(peerId);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      this.broadcast();
      return {
        ok: true,
        credentials: {
          roomCode: this.room.code,
          playerId: existing.id,
          reconnectToken: existing.reconnectToken,
        },
      };
    }

    const playerId = globalThis.crypto.randomUUID();
    const reconnectToken = globalThis.crypto.randomUUID();
    const name = this.uniqueName(this.sanitizeName(rawName));

    const player: InternalPlayer = {
      id: playerId,
      name,
      isHost: false,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken,
      socketId: peerId,
      hand: [],
      score: 0,
    };

    this.room.players.push(player);
    this.clearCountdown();
    this.broadcast();

    return {
      ok: true,
      credentials: { roomCode: this.room.code, playerId, reconnectToken },
    };
  }

  public rejoinGuest(peerId: string, creds: SessionCredentials): RoomActionResponse {
    if (creds.roomCode.trim().toUpperCase() !== this.room.code) {
      return { ok: false, error: 'Falscher Room-Code.' };
    }
    const player = this.room.players.find(
      (p) => p.id === creds.playerId && p.reconnectToken === creds.reconnectToken
    );
    if (!player) {
      return { ok: false, error: 'Sitzung abgelaufen.' };
    }
    player.socketId = peerId;
    player.connected = true;
    player.disconnectedAt = null;
    this.broadcast();
    return { ok: true, credentials: creds };
  }

  public handlePeerDisconnect(peerId: string): void {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return;

    if (this.room.phase === 'lobby') {
      this.removePlayerInternal(player.id, `${player.name} hat die Lobby verlassen.`);
      return;
    }

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.broadcast();
  }

  public leaveGuest(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: true };
    this.removePlayerInternal(player.id, `${player.name} hat den Room verlassen.`);
    return { ok: true };
  }

  private removePlayerInternal(playerId: string, reasonMessage: string): void {
    const idx = this.room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const [removed] = this.room.players.splice(idx, 1);

    if (this.room.phase === 'lobby') {
      this.clearCountdown();
      this.evaluateAutoStart();
      this.broadcast();
      return;
    }

    if (this.room.phase === 'round_over') {
      if (this.room.players.length < 2) {
        this.room.phase = 'lobby';
        this.room.game = null;
        for (const p of this.room.players) {
          p.isReady = p.isBot;
          p.hand = [];
        }
      } else {
        this.evaluateAutoStart();
      }
      this.broadcast();
      return;
    }

    const game = this.room.game;
    if (!game) return;

    if (removed.hand.length > 0) {
      game.drawPile.unshift(...removed.hand);
    }

    if (this.room.players.length < 2) {
      this.clearBotTimer();
      this.room.phase = 'lobby';
      this.room.game = null;
      for (const p of this.room.players) {
        p.hand = [];
        p.isReady = p.isBot;
      }
      this.broadcast();
      return;
    }

    if (game.drawnDecisionPlayerId === removed.id) {
      game.drawnDecisionPlayerId = null;
      game.drawnPlayableCardId = null;
    }

    if (idx < game.currentPlayerIndex) {
      game.currentPlayerIndex -= 1;
    } else if (idx === game.currentPlayerIndex) {
      game.pendingInitialColorChoice = false;
      game.currentPlayerIndex =
        ((game.currentPlayerIndex % this.room.players.length) + this.room.players.length) %
        this.room.players.length;
    }

    pushEvent(game, reasonMessage);
    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  public toggleReady(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player) return { ok: false, error: 'Nicht im Room.' };
    if (this.room.phase === 'playing') {
      return { ok: false, error: 'Während der Runde nicht verfügbar.' };
    }
    player.isReady = !player.isReady;
    this.evaluateAutoStart();
    this.broadcast();
    return { ok: true };
  }

  public setGameMode(peerId: string, gameMode: GameMode): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann den Spielmodus ändern.' };
    }
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'Nur in der Lobby möglich.' };
    }
    this.room.gameMode = gameMode;
    this.broadcast();
    return { ok: true };
  }

  public addBot(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann Bots hinzufügen.' };
    }
    if (this.room.phase !== 'lobby') {
      return { ok: false, error: 'Bots können nur in der Lobby hinzugefügt werden.' };
    }
    if (this.room.players.length >= 10) {
      return { ok: false, error: 'Maximal 10 Spieler.' };
    }

    const usedNames = new Set(this.room.players.map((p) => p.name));
    const botName =
      BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${this.room.players.length + 1}`;

    const bot: InternalPlayer = {
      id: `bot-${globalThis.crypto.randomUUID()}`,
      name: botName,
      isHost: false,
      isBot: true,
      isReady: true,
      connected: true,
      disconnectedAt: null,
      reconnectToken: globalThis.crypto.randomUUID(),
      socketId: null,
      hand: [],
      score: 0,
    };

    this.room.players.push(bot);
    this.evaluateAutoStart();
    this.broadcast();
    return { ok: true };
  }

  public removePlayerByHost(peerId: string, targetPlayerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host darf Spieler entfernen.' };
    }
    if (targetPlayerId === player.id) {
      return { ok: false, error: 'Du kannst dich nicht selbst entfernen.' };
    }
    const target = this.room.players.find((p) => p.id === targetPlayerId);
    if (!target) return { ok: false, error: 'Spieler nicht gefunden.' };
    if (target.socketId) {
      this.onKicked(target.socketId, 'Du wurdest vom Host aus dem Room entfernt.');
    }
    this.removePlayerInternal(target.id, `${target.name} wurde vom Host entfernt.`);
    return { ok: true };
  }

  public skipDisconnectedTurn(peerId: string, targetPlayerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host darf überspringen.' };
    }
    if (this.room.phase !== 'playing' || !this.room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const target = this.room.players.find((p) => p.id === targetPlayerId);
    if (!target || target.connected || target.isBot) {
      return { ok: false, error: 'Spieler ist verbunden.' };
    }
    const game = this.room.game;
    const current = this.room.players[game.currentPlayerIndex];
    if (current?.id !== target.id) {
      return { ok: false, error: 'Dieser Spieler ist nicht am Zug.' };
    }

    if (game.pendingInitialColorChoice) {
      game.pendingInitialColorChoice = false;
      game.activeColor = 'red';
    }
    game.drawnDecisionPlayerId = null;
    game.drawnPlayableCardId = null;
    game.currentPlayerIndex = nextPlayerIndex(
      game.currentPlayerIndex,
      game.direction,
      this.room.players.length,
      1
    );
    pushEvent(game, `${target.name} ist getrennt — Zug übersprungen.`);

    this.broadcast();
    this.scheduleBotTurnIfNeeded();
    return { ok: true };
  }

  public returnToLobby(peerId: string): RoomActionResponse {
    const player = this.findPlayerByPeer(peerId);
    if (!player || player.id !== this.room.hostId) {
      return { ok: false, error: 'Nur der Host kann in die Lobby zurückkehren.' };
    }
    if (this.room.phase !== 'round_over') {
      return { ok: false, error: 'Nur nach Rundenende möglich.' };
    }
    this.clearCountdown();
    this.clearBotTimer();
    this.room.phase = 'lobby';
    this.room.game = null;
    for (const p of this.room.players) {
      p.hand = [];
      p.isReady = p.isBot;
    }
    this.broadcast();
    return { ok: true };
  }

  private evaluateAutoStart(): void {
    if (this.room.phase !== 'lobby' && this.room.phase !== 'round_over') return;

    const allReady =
      this.room.players.length >= 2 &&
      this.room.players.every((p) => p.isReady && (p.isBot || p.connected));

    if (!allReady) {
      this.clearCountdown();
      return;
    }
    if (this.room.countdownTimer) return;

    this.room.countdownSeconds = 2;
    this.room.countdownTimer = setInterval(() => {
      const stillReady =
        this.room.players.length >= 2 &&
        this.room.players.every((p) => p.isReady && (p.isBot || p.connected));
      if (!stillReady) {
        this.clearCountdown();
        this.broadcast();
        return;
      }
      if (this.room.countdownSeconds !== null && this.room.countdownSeconds > 1) {
        this.room.countdownSeconds -= 1;
        this.broadcast();
      } else {
        this.clearCountdown();
        this.launchRound();
      }
    }, 1000);
  }

  private launchRound(): void {
    this.clearBotTimer();
    this.room.roundNumber += 1;
    this.room.phase = 'playing';
    for (const p of this.room.players) {
      p.isReady = p.isBot;
    }
    this.room.game = startRound(this.room.players, this.room.roundNumber);
    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }

  public handleAction(
    peerId: string,
    action: string,
    payload?: Record<string, unknown>
  ): RoomActionResponse {
    switch (action) {
      case 'room:toggle_ready':
        return this.toggleReady(peerId);
      case 'room:set_game_mode':
        return this.setGameMode(
          peerId,
          payload?.gameMode === 'jump_in' ? 'jump_in' : 'standard'
        );
      case 'room:add_bot':
        return this.addBot(peerId);
      case 'room:remove_player':
        return this.removePlayerByHost(
          peerId,
          typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : ''
        );
      case 'room:skip_disconnected':
        return this.skipDisconnectedTurn(
          peerId,
          typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId : ''
        );
      case 'room:next_round':
        return this.returnToLobby(peerId);
      case 'room:leave':
        return this.leaveGuest(peerId);
      case 'game:choose_initial_color': {
        const player = this.findPlayerByPeer(peerId);
        if (!player || this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Keine aktive Runde.' };
        }
        const color = payload?.color as CardColor;
        const res = chooseInitialColor(this.room.game, this.room.players, player.id, color);
        if (res.ok) {
          this.broadcast();
          this.scheduleBotTurnIfNeeded();
        }
        return res;
      }
      case 'game:play_cards': {
        const player = this.findPlayerByPeer(peerId);
        if (!player || this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Keine aktive Runde.' };
        }
        const cardIds = Array.isArray(payload?.cardIds)
          ? payload.cardIds.filter((x): x is string => typeof x === 'string')
          : [];
        const chosenColor =
          typeof payload?.chosenColor === 'string'
            ? (payload.chosenColor as CardColor)
            : undefined;
        const res = playCards(
          this.room.game,
          this.room.players,
          player.id,
          cardIds,
          chosenColor,
          { gameMode: this.room.gameMode }
        );
        if (!res.ok) return res;
        if (res.roundEnded) {
          this.finishRound();
        } else {
          this.broadcast();
          this.scheduleBotTurnIfNeeded();
        }
        return res;
      }
      case 'game:draw_card': {
        const player = this.findPlayerByPeer(peerId);
        if (!player || this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Keine aktive Runde.' };
        }
        const res = drawCardAction(this.room.game, this.room.players, player.id);
        if (res.ok) {
          this.broadcast();
          this.scheduleBotTurnIfNeeded();
        }
        return res;
      }
      case 'game:keep_drawn_card': {
        const player = this.findPlayerByPeer(peerId);
        if (!player || this.room.phase !== 'playing' || !this.room.game) {
          return { ok: false, error: 'Keine aktive Runde.' };
        }
        const res = keepDrawnCard(this.room.game, this.room.players, player.id);
        if (res.ok) {
          this.broadcast();
          this.scheduleBotTurnIfNeeded();
        }
        return res;
      }
      default:
        return { ok: false, error: 'Unbekannte Aktion.' };
    }
  }

  private finishRound(): void {
    this.clearBotTimer();
    this.room.phase = 'round_over';
    for (const p of this.room.players) {
      p.isReady = p.isBot;
    }
    this.broadcast();
  }

  private scheduleBotTurnIfNeeded(): void {
    this.clearBotTimer();
    if (this.room.phase !== 'playing' || !this.room.game) return;
    const current = this.room.players[this.room.game.currentPlayerIndex];
    if (!current || !current.isBot) return;

    this.room.botTimer = setTimeout(() => {
      this.executeBotStep();
    }, 850);
  }

  private pickBestColorForBot(bot: InternalPlayer): CardColor {
    const counts: Record<CardColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of bot.hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    let best: CardColor = CARD_COLORS[secureRandomInt(0, CARD_COLORS.length)];
    let bestCount = -1;
    for (const color of CARD_COLORS) {
      if (counts[color] > bestCount) {
        bestCount = counts[color];
        best = color;
      }
    }
    return best;
  }

  private executeBotStep(): void {
    if (this.room.phase !== 'playing' || !this.room.game) return;
    const game = this.room.game;
    const bot = this.room.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    if (game.pendingInitialColorChoice) {
      chooseInitialColor(game, this.room.players, bot.id, this.pickBestColorForBot(bot));
      this.broadcast();
      this.scheduleBotTurnIfNeeded();
      return;
    }

    if (game.drawnDecisionPlayerId === bot.id && game.drawnPlayableCardId) {
      const drawnCard = bot.hand.find((c) => c.id === game.drawnPlayableCardId);
      if (drawnCard) {
        const chosenColor =
          drawnCard.color === 'wild' ? this.pickBestColorForBot(bot) : undefined;
        const res = playCards(game, this.room.players, bot.id, [drawnCard.id], chosenColor, {
          gameMode: this.room.gameMode,
        });
        if (res.roundEnded) {
          this.finishRound();
          return;
        }
      } else {
        keepDrawnCard(game, this.room.players, bot.id);
      }
      this.broadcast();
      this.scheduleBotTurnIfNeeded();
      return;
    }

    const topCard = game.discardPile[game.discardPile.length - 1];
    const playable = bot.hand.filter((c) => isCardPlayable(c, topCard, game.activeColor));

    if (playable.length > 0) {
      const nonWild4 = playable.filter((c) => c.value !== 'wild4');
      const nonWild = nonWild4.filter((c) => c.value !== 'wild');
      const chosen = nonWild[0] ?? nonWild4[0] ?? playable[0];

      const twin =
        chosen.color !== 'wild'
          ? bot.hand.find(
              (c) =>
                c.id !== chosen.id &&
                c.color === chosen.color &&
                c.value === chosen.value
            )
          : undefined;
      const cardIds = twin ? [chosen.id, twin.id] : [chosen.id];

      const chosenColor = chosen.color === 'wild' ? this.pickBestColorForBot(bot) : undefined;
      const res = playCards(game, this.room.players, bot.id, cardIds, chosenColor, {
        gameMode: this.room.gameMode,
      });
      if (res.roundEnded) {
        this.finishRound();
        return;
      }
      this.broadcast();
      this.scheduleBotTurnIfNeeded();
      return;
    }

    drawCardAction(game, this.room.players, bot.id);
    this.broadcast();
    this.scheduleBotTurnIfNeeded();
  }
}

