import { randomInt, randomUUID } from 'node:crypto';
import type {
  CardColor,
  ClientRoomState,
  GameMode,
  PublicPlayer,
  RoomActionResponse,
  RoomPhase,
  SessionCredentials,
} from '../shared/types.js';
import {
  CARD_COLORS,
  type InternalGameState,
  type InternalPlayer,
  chooseInitialColor,
  drawCardAction,
  isCardPlayable,
  nextPlayerIndex,
  passTurnAction,
  playCards,
  pushEvent,
  startRound,
} from '../shared/gameEngine.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Nova (Bot)', 'Kairo (Bot)', 'Vega (Bot)', 'Echo (Bot)', 'Atlas (Bot)', 'Lyra (Bot)'];

export interface Room {
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
  createdAt: number;
  lastActivityAt: number;
}

export type StateBroadcastFn = (room: Room) => void;
export type KickedNotifyFn = (socketId: string, reason: string) => void;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToSession = new Map<string, { roomCode: string; playerId: string }>();
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private onBroadcast: StateBroadcastFn;
  private onKicked: KickedNotifyFn;

  constructor(onBroadcast: StateBroadcastFn, onKicked: KickedNotifyFn) {
    this.onBroadcast = onBroadcast;
    this.onKicked = onKicked;
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 30; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return randomUUID().slice(0, 6).toUpperCase();
  }

  private sanitizeName(rawName: string): string {
    const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
    return cleaned || 'Spieler';
  }

  private uniqueName(room: Room, baseName: string): string {
    const existing = new Set(room.players.map((p) => p.name.toLowerCase()));
    if (!existing.has(baseName.toLowerCase())) return baseName;
    for (let i = 2; i <= 20; i++) {
      const candidate = `${baseName.slice(0, 16)} (${i})`;
      if (!existing.has(candidate.toLowerCase())) return candidate;
    }
    return `${baseName.slice(0, 14)}-${randomInt(10, 99)}`;
  }

  private clearCountdown(room: Room): void {
    if (room.countdownTimer) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
    }
    room.countdownSeconds = null;
  }

  private clearBotTimer(room: Room): void {
    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
  }

  private clearDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  private reassignHostIfNeeded(room: Room): void {
    const currentHost = room.players.find((p) => p.id === room.hostId && !p.isBot);
    if (currentHost && currentHost.connected) return;

    const nextHuman =
      room.players.find((p) => !p.isBot && p.connected) ??
      room.players.find((p) => !p.isBot);

    if (!nextHuman) return;

    for (const p of room.players) {
      p.isHost = p.id === nextHuman.id;
    }
    room.hostId = nextHuman.id;
    if (room.game) {
      pushEvent(room.game, `${nextHuman.name} ist jetzt der Host.`);
    }
  }

  private cleanupEmptyRoom(room: Room): boolean {
    const hasHumans = room.players.some((p) => !p.isBot);
    const hasConnectedHumans = room.players.some((p) => !p.isBot && p.connected);
    if (!hasHumans || (room.phase === 'lobby' && !hasConnectedHumans && room.players.every((p) => p.isBot || !p.connected))) {
      // Wait for disconnect grace timers before removing lobby rooms with disconnected humans
      if (!hasHumans) {
        this.destroyRoom(room.code);
        return true;
      }
    }
    return false;
  }

  public destroyRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.clearCountdown(room);
    this.clearBotTimer(room);
    for (const p of room.players) {
      this.clearDisconnectTimer(p.id);
      if (p.socketId) {
        this.socketToSession.delete(p.socketId);
      }
    }
    this.rooms.delete(roomCode);
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  public getSession(socketId: string): { room: Room; player: InternalPlayer } | null {
    const ref = this.socketToSession.get(socketId);
    if (!ref) return null;
    const room = this.rooms.get(ref.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.id === ref.playerId);
    if (!player) return null;
    return { room, player };
  }

  public serializeForPlayer(room: Room, playerId: string): ClientRoomState {
    const me = room.players.find((p) => p.id === playerId);
    const game = room.game;

    const publicPlayers: PublicPlayer[] = room.players.map((p) => ({
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
      game && room.players[game.currentPlayerIndex]
        ? room.players[game.currentPlayerIndex]
        : null;

    return {
      roomCode: room.code,
      phase: room.phase,
      gameMode: room.gameMode,
      myPlayerId: playerId,
      hostId: room.hostId,
      players: publicPlayers,
      myHand: me ? [...me.hand] : [],
      countdownSeconds: room.countdownSeconds,
      roundNumber: game?.roundNumber ?? room.roundNumber,
      currentPlayerId: currentPlayer?.id ?? null,
      direction: game?.direction ?? 1,
      activeColor: game?.activeColor ?? null,
      topCard: game ? game.discardPile[game.discardPile.length - 1] ?? null : null,
      recentDiscardCards: game ? game.discardPile.slice(-4) : [],
      drawPileCount: game?.drawPile.length ?? 0,
      discardPileCount: game?.discardPile.length ?? 0,
      pendingInitialColorChoice: game?.pendingInitialColorChoice ?? false,
      pendingDrawCount: game?.pendingDrawCount ?? 0,
      hasDrawnThisTurn: game?.hasDrawnThisTurn ?? false,
      lastEvent: game?.eventLog[0] ?? null,
      eventLog: game?.eventLog ?? [],
      roundSummary: game?.roundSummary ?? null,
    };
  }

  public createRoom(socketId: string, rawName: string): RoomActionResponse {
    this.detachSocketIfNeeded(socketId);

    const code = this.generateRoomCode();
    const playerId = randomUUID();
    const reconnectToken = randomUUID();

    const host: InternalPlayer = {
      id: playerId,
      name: this.sanitizeName(rawName),
      isHost: true,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken,
      socketId,
      hand: [],
      score: 0,
    };

    const room: Room = {
      code,
      phase: 'lobby',
      gameMode: 'standard',
      hostId: playerId,
      players: [host],
      roundNumber: 0,
      countdownSeconds: null,
      countdownTimer: null,
      botTimer: null,
      game: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.socketToSession.set(socketId, { roomCode: code, playerId });
    this.onBroadcast(room);

    return {
      ok: true,
      credentials: { roomCode: code, playerId, reconnectToken },
    };
  }

  public joinRoom(socketId: string, rawCode: string, rawName: string): RoomActionResponse {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Room nicht gefunden. Bitte prüfe den Room-Code.' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'In diesem Room läuft bereits eine Runde.' };
    }
    if (room.players.length >= 10) {
      return { ok: false, error: 'Dieser Room ist voll (maximal 10 Spieler).' };
    }

    this.detachSocketIfNeeded(socketId);

    const playerId = randomUUID();
    const reconnectToken = randomUUID();
    const name = this.uniqueName(room, this.sanitizeName(rawName));

    const player: InternalPlayer = {
      id: playerId,
      name,
      isHost: false,
      isBot: false,
      isReady: false,
      connected: true,
      disconnectedAt: null,
      reconnectToken,
      socketId,
      hand: [],
      score: 0,
    };

    room.players.push(player);
    room.lastActivityAt = Date.now();
    this.clearCountdown(room);
    this.socketToSession.set(socketId, { roomCode: code, playerId });
    this.onBroadcast(room);

    return {
      ok: true,
      credentials: { roomCode: code, playerId, reconnectToken },
    };
  }

  public rejoinRoom(socketId: string, credentials: SessionCredentials): RoomActionResponse {
    const code = credentials.roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: 'Der Room existiert nicht mehr.' };
    }
    const player = room.players.find(
      (p) => p.id === credentials.playerId && p.reconnectToken === credentials.reconnectToken
    );
    if (!player) {
      return { ok: false, error: 'Sitzung abgelaufen.' };
    }

    // If an old socket was still attached, clean up mapping
    if (player.socketId && player.socketId !== socketId) {
      this.socketToSession.delete(player.socketId);
    }

    this.clearDisconnectTimer(player.id);
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    room.lastActivityAt = Date.now();
    this.socketToSession.set(socketId, { roomCode: code, playerId: player.id });
    this.onBroadcast(room);

    return { ok: true, credentials };
  }

  private detachSocketIfNeeded(socketId: string): void {
    const existing = this.getSession(socketId);
    if (existing) {
      this.leaveRoom(socketId);
    }
  }

  public leaveRoom(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: true };

    const { room, player } = session;
    this.socketToSession.delete(socketId);
    this.clearDisconnectTimer(player.id);

    this.removePlayerFromRoom(room, player.id, `${player.name} hat den Room verlassen.`);
    return { ok: true };
  }

  public handleDisconnect(socketId: string): void {
    const session = this.getSession(socketId);
    if (!session) return;
    const { room, player } = session;
    this.socketToSession.delete(socketId);

    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = Date.now();

    if (room.phase === 'lobby') {
      this.clearCountdown(room);
    }

    this.reassignHostIfNeeded(room);
    this.onBroadcast(room);

    // Grace period before auto-removing a disconnected lobby player (or empty room cleanup)
    const graceMs = room.phase === 'lobby' ? 35_000 : 120_000;
    this.clearDisconnectTimer(player.id);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(player.id);
      const currentRoom = this.rooms.get(room.code);
      if (!currentRoom) return;
      const target = currentRoom.players.find((p) => p.id === player.id);
      if (!target || target.connected) return;

      if (currentRoom.phase === 'lobby') {
        this.removePlayerFromRoom(
          currentRoom,
          player.id,
          `${player.name} wurde nach Verbindungsabbruch entfernt.`
        );
      } else {
        // Check if all human players have been disconnected
        const anyConnectedHuman = currentRoom.players.some((p) => !p.isBot && p.connected);
        if (!anyConnectedHuman) {
          this.destroyRoom(currentRoom.code);
        }
      }
    }, graceMs);
    this.disconnectTimers.set(player.id, timer);
  }

  private removePlayerFromRoom(room: Room, playerId: string, reasonMessage: string): void {
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const [removed] = room.players.splice(idx, 1);

    if (removed.socketId) {
      this.socketToSession.delete(removed.socketId);
    }
    this.clearDisconnectTimer(removed.id);

    if (this.cleanupEmptyRoom(room)) return;

    this.reassignHostIfNeeded(room);

    if (room.phase === 'lobby') {
      this.clearCountdown(room);
      this.evaluateAutoStart(room);
      this.onBroadcast(room);
      return;
    }

    if (room.phase === 'round_over') {
      if (room.players.length < 2) {
        room.phase = 'lobby';
        room.game = null;
        for (const p of room.players) {
          p.isReady = p.isBot;
          p.hand = [];
        }
      } else {
        this.evaluateAutoStart(room);
      }
      this.onBroadcast(room);
      return;
    }

    // Active game handling when a player is removed
    const game = room.game;
    if (!game) return;

    // Return removed player's hand cards back to bottom of drawPile so no cards vanish
    if (removed.hand.length > 0) {
      game.drawPile.unshift(...removed.hand);
    }

    if (room.players.length < 2) {
      this.clearBotTimer(room);
      room.phase = 'lobby';
      room.game = null;
      for (const p of room.players) {
        p.hand = [];
        p.isReady = p.isBot;
      }
      this.onBroadcast(room);
      return;
    }

    if (idx < game.currentPlayerIndex) {
      game.currentPlayerIndex -= 1;
    } else if (idx === game.currentPlayerIndex) {
      game.pendingInitialColorChoice = false;
      game.currentPlayerIndex =
        ((game.currentPlayerIndex % room.players.length) + room.players.length) %
        room.players.length;
    }

    pushEvent(game, reasonMessage);
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  public toggleReady(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;

    if (room.phase === 'playing') {
      return { ok: false, error: 'Während der Runde nicht verfügbar.' };
    }

    player.isReady = !player.isReady;
    room.lastActivityAt = Date.now();
    this.evaluateAutoStart(room);
    this.onBroadcast(room);
    return { ok: true };
  }

  public setGameMode(socketId: string, gameMode: GameMode): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;

    if (room.hostId !== player.id) {
      return { ok: false, error: 'Nur der Host kann den Spielmodus ändern.' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'Der Spielmodus kann nur in der Lobby geändert werden.' };
    }

    room.gameMode = gameMode;
    room.lastActivityAt = Date.now();
    this.onBroadcast(room);
    return { ok: true };
  }

  public addBot(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;

    if (room.hostId !== player.id) {
      return { ok: false, error: 'Nur der Host kann Bots hinzufügen.' };
    }
    if (room.phase !== 'lobby') {
      return { ok: false, error: 'Bots können nur in der Lobby hinzugefügt werden.' };
    }
    if (room.players.length >= 10) {
      return { ok: false, error: 'Maximal 10 Spieler im Room.' };
    }

    const usedNames = new Set(room.players.map((p) => p.name));
    const botName =
      BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${room.players.length + 1}`;

    const bot: InternalPlayer = {
      id: `bot-${randomUUID()}`,
      name: botName,
      isHost: false,
      isBot: true,
      isReady: true,
      connected: true,
      disconnectedAt: null,
      reconnectToken: randomUUID(),
      socketId: null,
      hand: [],
      score: 0,
    };

    room.players.push(bot);
    room.lastActivityAt = Date.now();
    this.evaluateAutoStart(room);
    this.onBroadcast(room);
    return { ok: true };
  }

  public removePlayerByHost(socketId: string, targetPlayerId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;

    if (room.hostId !== player.id) {
      return { ok: false, error: 'Nur der Host darf Spieler entfernen.' };
    }
    if (targetPlayerId === player.id) {
      return { ok: false, error: 'Du kannst dich nicht selbst entfernen.' };
    }
    const target = room.players.find((p) => p.id === targetPlayerId);
    if (!target) return { ok: false, error: 'Spieler nicht gefunden.' };

    if (target.socketId) {
      this.onKicked(target.socketId, 'Du wurdest vom Host aus dem Room entfernt.');
    }
    this.removePlayerFromRoom(room, target.id, `${target.name} wurde vom Host entfernt.`);
    return { ok: true };
  }

  public skipDisconnectedTurn(socketId: string, targetPlayerId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;
    if (room.hostId !== player.id) {
      return { ok: false, error: 'Nur der Host kann getrennte Spieler überspringen.' };
    }
    if (room.phase !== 'playing' || !room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const target = room.players.find((p) => p.id === targetPlayerId);
    if (!target || target.connected || target.isBot) {
      return { ok: false, error: 'Spieler ist verbunden.' };
    }
    const game = room.game;
    const current = room.players[game.currentPlayerIndex];
    if (current?.id !== target.id) {
      return { ok: false, error: 'Dieser Spieler ist gerade nicht am Zug.' };
    }

    if (game.pendingInitialColorChoice) {
      game.pendingInitialColorChoice = false;
      game.activeColor = 'red';
    }
    game.hasDrawnThisTurn = false;
    game.currentPlayerIndex = nextPlayerIndex(
      game.currentPlayerIndex,
      game.direction,
      room.players.length,
      1
    );
    pushEvent(game, `${target.name} ist getrennt — Zug übersprungen.`);

    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
    return { ok: true };
  }

  public returnToLobby(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;

    if (room.hostId !== player.id) {
      return { ok: false, error: 'Nur der Host kann in die Lobby zurückkehren.' };
    }
    if (room.phase !== 'round_over') {
      return { ok: false, error: 'Nur nach Rundenende möglich.' };
    }

    this.clearCountdown(room);
    this.clearBotTimer(room);
    room.phase = 'lobby';
    room.game = null;
    for (const p of room.players) {
      p.hand = [];
      p.isReady = p.isBot;
    }
    this.onBroadcast(room);
    return { ok: true };
  }

  private evaluateAutoStart(room: Room): void {
    if (room.phase !== 'lobby' && room.phase !== 'round_over') return;

    const allReady =
      room.players.length >= 2 &&
      room.players.every((p) => p.isReady && (p.isBot || p.connected));

    if (!allReady) {
      this.clearCountdown(room);
      return;
    }

    if (room.countdownTimer) return;

    room.countdownSeconds = 2;
    room.countdownTimer = setInterval(() => {
      const stillReady =
        room.players.length >= 2 &&
        room.players.every((p) => p.isReady && (p.isBot || p.connected));
      if (!stillReady) {
        this.clearCountdown(room);
        this.onBroadcast(room);
        return;
      }
      if (room.countdownSeconds !== null && room.countdownSeconds > 1) {
        room.countdownSeconds -= 1;
        this.onBroadcast(room);
      } else {
        this.clearCountdown(room);
        this.launchRound(room);
      }
    }, 1000);
  }

  private launchRound(room: Room): void {
    this.clearBotTimer(room);
    room.roundNumber += 1;
    room.phase = 'playing';
    for (const p of room.players) {
      p.isReady = p.isBot;
    }
    room.game = startRound(room.players, room.roundNumber);
    room.lastActivityAt = Date.now();
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  // --- Game Actions ---

  public handleChooseInitialColor(socketId: string, color: CardColor): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;
    if (room.phase !== 'playing' || !room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const res = chooseInitialColor(room.game, room.players, player.id, color);
    if (!res.ok) return res;
    room.lastActivityAt = Date.now();
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
    return res;
  }

  public handlePlayCard(
    socketId: string,
    cardId: string,
    chosenColor?: CardColor
  ): RoomActionResponse {
    return this.handlePlayCards(socketId, [cardId], chosenColor);
  }

  public handlePlayCards(
    socketId: string,
    cardIds: string[],
    chosenColor?: CardColor
  ): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;
    if (room.phase !== 'playing' || !room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const res = playCards(room.game, room.players, player.id, cardIds, chosenColor, {
      gameMode: room.gameMode,
    });
    if (!res.ok) return res;

    room.lastActivityAt = Date.now();
    if (res.roundEnded) {
      this.finishRound(room);
    } else {
      this.onBroadcast(room);
      this.scheduleBotTurnIfNeeded(room);
    }
    return res;
  }

  public handleDrawCard(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;
    if (room.phase !== 'playing' || !room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const res = drawCardAction(room.game, room.players, player.id);
    if (!res.ok) return res;

    room.lastActivityAt = Date.now();
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
    return res;
  }

  public handlePassTurn(socketId: string): RoomActionResponse {
    const session = this.getSession(socketId);
    if (!session) return { ok: false, error: 'Nicht in einem Room.' };
    const { room, player } = session;
    if (room.phase !== 'playing' || !room.game) {
      return { ok: false, error: 'Keine aktive Runde.' };
    }
    const res = passTurnAction(room.game, room.players, player.id);
    if (!res.ok) return res;

    room.lastActivityAt = Date.now();
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
    return res;
  }

  private finishRound(room: Room): void {
    this.clearBotTimer(room);
    room.phase = 'round_over';
    for (const p of room.players) {
      p.isReady = p.isBot;
    }
    this.onBroadcast(room);
  }

  // --- Bot AI ---

  private scheduleBotTurnIfNeeded(room: Room): void {
    this.clearBotTimer(room);
    if (room.phase !== 'playing' || !room.game) return;
    const current = room.players[room.game.currentPlayerIndex];
    if (!current || !current.isBot) return;

    room.botTimer = setTimeout(() => {
      this.executeBotStep(room.code);
    }, 850);
  }

  private pickBestColorForBot(bot: InternalPlayer): CardColor {
    const counts: Record<CardColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of bot.hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    let best: CardColor = CARD_COLORS[randomInt(0, CARD_COLORS.length)];
    let bestCount = -1;
    for (const color of CARD_COLORS) {
      if (counts[color] > bestCount) {
        bestCount = counts[color];
        best = color;
      }
    }
    return best;
  }

  private executeBotStep(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'playing' || !room.game) return;
    const game = room.game;
    const bot = room.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    // 1. Initial Wild color pick
    if (game.pendingInitialColorChoice) {
      chooseInitialColor(game, room.players, bot.id, this.pickBestColorForBot(bot));
      this.onBroadcast(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    // 4. Normal turn: choose a legal card (prefer non-wild4 if holding activeColor)
    const topCard = game.discardPile[game.discardPile.length - 1];
    const playable = bot.hand.filter((c) =>
      isCardPlayable(c, topCard, game.activeColor, game.pendingDrawCount)
    );

    if (playable.length > 0) {
      const nonWild4 = playable.filter((c) => c.value !== 'wild4');
      const nonWild = nonWild4.filter((c) => c.value !== 'wild');
      const chosen = nonWild[0] ?? nonWild4[0] ?? playable[0];

      // Check if bot holds an identical twin to play together
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
      const res = playCards(game, room.players, bot.id, cardIds, chosenColor, {
        gameMode: room.gameMode,
      });
      if (res.roundEnded) {
        this.finishRound(room);
        return;
      }
      this.onBroadcast(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    // 5. Draw card or pass if already drawn
    if (game.hasDrawnThisTurn && game.pendingDrawCount === 0) {
      passTurnAction(game, room.players, bot.id);
    } else {
      drawCardAction(game, room.players, bot.id);
    }
    this.onBroadcast(room);
    this.scheduleBotTurnIfNeeded(room);
  }
}

