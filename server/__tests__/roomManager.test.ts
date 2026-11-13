import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../roomManager.js';

describe('RoomManager Multiplayer Lobby & Sessions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a room with Host, allows joining, auto-starts when all Ready, and keeps hands secret', () => {
    vi.useFakeTimers();

    const manager = new RoomManager(
      () => {},
      () => {}
    );

    const hostRes = manager.createRoom('sock-host', 'Alice');
    expect(hostRes.ok).toBe(true);
    const roomCode = hostRes.credentials!.roomCode;

    const joinRes = manager.joinRoom('sock-bob', roomCode, 'Bob');
    expect(joinRes.ok).toBe(true);

    const room = manager.getRoom(roomCode)!;
    expect(room.players).toHaveLength(2);
    expect(room.phase).toBe('lobby');

    // Only Bob readies up -> should NOT start yet
    manager.toggleReady('sock-bob');
    expect(room.countdownSeconds).toBeNull();
    expect(room.phase).toBe('lobby');

    // Alice (Host) readies up -> countdown starts (2s)
    manager.toggleReady('sock-host');
    expect(room.countdownSeconds).toBe(2);

    vi.advanceTimersByTime(2100);
    expect(room.phase).toBe('playing');
    expect(room.game).not.toBeNull();

    // Verify hands are strictly private per player
    const aliceView = manager.serializeForPlayer(room, hostRes.credentials!.playerId);
    const bobView = manager.serializeForPlayer(room, joinRes.credentials!.playerId);
    expect(aliceView.myHand).toHaveLength(7);
    expect(bobView.myHand).toHaveLength(7);
    expect(aliceView.myHand).not.toEqual(bobView.myHand);
    expect(aliceView.players.find((p) => p.name === 'Bob')?.cardCount).toBe(7);

    manager.destroyRoom(roomCode);
  });

  it('restores disconnected player seamlessly via rejoin credentials and migrates host on leave', () => {
    const manager = new RoomManager(
      () => {},
      () => {}
    );

    const hostRes = manager.createRoom('sock-1', 'Alice');
    const roomCode = hostRes.credentials!.roomCode;
    const bobRes = manager.joinRoom('sock-2', roomCode, 'Bob');

    const room = manager.getRoom(roomCode)!;

    // Simulate Bob losing connection and reconnecting on a new socket
    manager.handleDisconnect('sock-2');
    expect(room.players[1].connected).toBe(false);

    const rejoinRes = manager.rejoinRoom('sock-2-new', bobRes.credentials!);
    expect(rejoinRes.ok).toBe(true);
    expect(room.players[1].connected).toBe(true);
    expect(room.players[1].socketId).toBe('sock-2-new');

    // Host leaves explicitly -> Bob becomes Host
    manager.leaveRoom('sock-1');
    expect(room.players).toHaveLength(1);
    expect(room.hostId).toBe(bobRes.credentials!.playerId);
    expect(room.players[0].isHost).toBe(true);

    manager.destroyRoom(roomCode);
  });

  it('cancels countdown if a new player joins during ready countdown', () => {
    vi.useFakeTimers();
    const manager = new RoomManager(
      () => {},
      () => {}
    );

    const p1 = manager.createRoom('s1', 'Host');
    const code = p1.credentials!.roomCode;
    manager.joinRoom('s2', code, 'P2');

    manager.toggleReady('s1');
    manager.toggleReady('s2');

    const room = manager.getRoom(code)!;
    expect(room.countdownSeconds).toBe(2);

    // 3rd player joins mid-countdown -> cancels start
    manager.joinRoom('s3', code, 'P3');
    expect(room.countdownSeconds).toBeNull();
    expect(room.phase).toBe('lobby');

    vi.advanceTimersByTime(3000);
    expect(room.phase).toBe('lobby');

    manager.destroyRoom(code);
  });

  it('allows host to switch gameMode to jump_in and exposes recentDiscardCards', () => {
    const manager = new RoomManager(
      () => {},
      () => {}
    );

    const p1 = manager.createRoom('s1', 'Host');
    const code = p1.credentials!.roomCode;
    const p2 = manager.joinRoom('s2', code, 'Guest');

    // Non-host cannot switch mode
    const guestAttempt = manager.setGameMode('s2', 'jump_in');
    expect(guestAttempt.ok).toBe(false);

    // Host switches mode cleanly
    const hostAttempt = manager.setGameMode('s1', 'jump_in');
    expect(hostAttempt.ok).toBe(true);

    const room = manager.getRoom(code)!;
    const view = manager.serializeForPlayer(room, p2.credentials!.playerId);
    expect(view.gameMode).toBe('jump_in');
    expect(view.recentDiscardCards).toEqual([]);

    manager.destroyRoom(code);
  });
});

