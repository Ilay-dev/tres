import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRoomState } from '../../shared/types.js';
import { BrowserHostManager } from '../../src/p2p/hostManager.js';

describe('BrowserHostManager (Serverless P2P Host)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hosts room in browser, accepts guest join, starts on all ready, and isolates hands', () => {
    vi.useFakeTimers();

    const latestViews = new Map<string, ClientRoomState>();
    const manager = new BrowserHostManager(
      'ABC234',
      'HostUser',
      (peerId, state) => {
        latestViews.set(peerId, state);
      },
      () => {}
    );

    const joinRes = manager.joinGuest('peer-guest-1', 'GuestUser');
    expect(joinRes.ok).toBe(true);

    manager.handleAction('HOST_LOCAL', 'room:toggle_ready');
    manager.handleAction('peer-guest-1', 'room:toggle_ready');

    expect(manager.room.countdownSeconds).toBe(2);
    vi.advanceTimersByTime(2100);

    expect(manager.room.phase).toBe('playing');
    const hostView = latestViews.get('HOST_LOCAL')!;
    const guestView = latestViews.get('peer-guest-1')!;
    expect(hostView.myHand).toHaveLength(7);
    expect(guestView.myHand).toHaveLength(7);
    expect(hostView.myHand).not.toEqual(guestView.myHand);

    manager.destroy();
  });
});

