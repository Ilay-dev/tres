import { describe, expect, it } from 'vitest';
import type { UnoCard } from '../../shared/types.js';
import {
  chooseInitialColor,
  createStandardDeck,
  drawCardAction,
  keepDrawnCard,
  playCard,
  playCards,
  startRound,
  type InternalGameState,
  type InternalPlayer,
} from '../../shared/gameEngine.js';

function makePlayers(count: number): InternalPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Spieler ${i + 1}`,
    isHost: i === 0,
    isBot: false,
    isReady: true,
    connected: true,
    disconnectedAt: null,
    reconnectToken: `tok-${i + 1}`,
    socketId: `sock-${i + 1}`,
    hand: [],
    score: 0,
    unoCalled: false,
    unoVulnerable: false,
  }));
}

function makeControlledGame(
  players: InternalPlayer[],
  topCard: UnoCard,
  drawPile: UnoCard[] = []
): InternalGameState {
  return {
    roundNumber: 1,
    drawPile,
    discardPile: [topCard],
    currentPlayerIndex: 0,
    direction: 1,
    activeColor: topCard.color === 'wild' ? 'red' : topCard.color,
    pendingInitialColorChoice: false,
    drawnDecisionPlayerId: null,
    drawnPlayableCardId: null,
    pendingChallenge: null,
    roundSummary: null,
    eventLog: [],
  };
}

describe('Official Standard UNO Rules Engine', () => {
  it('creates an exact 108-card standard UNO deck', () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(108);

    const zeros = deck.filter((c) => c.value === '0');
    const wilds = deck.filter((c) => c.value === 'wild');
    const wild4s = deck.filter((c) => c.value === 'wild4');
    const skips = deck.filter((c) => c.value === 'skip');
    const reverses = deck.filter((c) => c.value === 'reverse');
    const draw2s = deck.filter((c) => c.value === 'draw2');

    expect(zeros).toHaveLength(4);
    expect(wilds).toHaveLength(4);
    expect(wild4s).toHaveLength(4);
    expect(skips).toHaveLength(8);
    expect(reverses).toHaveLength(8);
    expect(draw2s).toHaveLength(8);
  });

  it('deals 7 cards each and never leaves wild4 as initial discard card', () => {
    for (let trial = 0; trial < 25; trial++) {
      const players = makePlayers(4);
      const game = startRound(players, 1);
      const firstCard = game.discardPile[0];
      expect(firstCard.value).not.toBe('wild4');
      players.forEach((p, idx) => {
        if (idx === 0 && firstCard.value === 'draw2') {
          expect(p.hand).toHaveLength(9);
        } else {
          expect(p.hand).toHaveLength(7);
        }
      });
      const totalCards =
        players.reduce((sum, p) => sum + p.hand.length, 0) +
        game.drawPile.length +
        game.discardPile.length;
      expect(totalCards).toBe(108);
    }
  });

  it('treats Reverse as Skip in 2-player games', () => {
    const players = makePlayers(2);
    players[0].hand = [
      { id: 'r-rev', color: 'red', value: 'reverse' },
      { id: 'r-5', color: 'red', value: '5' },
    ];
    players[1].hand = [{ id: 'b-2', color: 'blue', value: '2' }];

    const game = makeControlledGame(players, { id: 'r-1', color: 'red', value: '1' });
    const res = playCard(game, players, 'p1', 'r-rev');
    expect(res.ok).toBe(true);
    // p1 plays again immediately in 2-player mode!
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.direction).toBe(-1);
  });

  it('flips direction normally in 3+ player games', () => {
    const players = makePlayers(3);
    players[0].hand = [
      { id: 'r-rev', color: 'red', value: 'reverse' },
      { id: 'r-5', color: 'red', value: '5' },
    ];
    players[1].hand = [{ id: 'b-2', color: 'blue', value: '2' }];
    players[2].hand = [{ id: 'g-3', color: 'green', value: '3' }];

    const game = makeControlledGame(players, { id: 'r-1', color: 'red', value: '1' });
    playCard(game, players, 'p1', 'r-rev');
    expect(game.direction).toBe(-1);
    expect(game.currentPlayerIndex).toBe(2); // p3 is next counter-clockwise
  });

  it('makes next player draw 2 and skips them on +2', () => {
    const players = makePlayers(3);
    players[0].hand = [
      { id: 'r-d2', color: 'red', value: 'draw2' },
      { id: 'r-4', color: 'red', value: '4' },
    ];
    players[1].hand = [{ id: 'b-2', color: 'blue', value: '2' }];
    players[2].hand = [{ id: 'g-3', color: 'green', value: '3' }];

    const game = makeControlledGame(
      players,
      { id: 'r-1', color: 'red', value: '1' },
      [
        { id: 'd1', color: 'yellow', value: '7' },
        { id: 'd2', color: 'green', value: '8' },
      ]
    );

    playCard(game, players, 'p1', 'r-d2');
    expect(players[1].hand).toHaveLength(3);
    expect(game.currentPlayerIndex).toBe(2); // p2 skipped, p3's turn
  });

  it('allows immediate play or keeping a playable drawn card', () => {
    const players = makePlayers(2);
    players[0].hand = [{ id: 'b-9', color: 'blue', value: '9' }];
    players[1].hand = [{ id: 'g-3', color: 'green', value: '3' }];

    const game = makeControlledGame(
      players,
      { id: 'r-1', color: 'red', value: '1' },
      [{ id: 'r-7', color: 'red', value: '7' }] // top of drawPile is last element
    );

    const drawRes = drawCardAction(game, players, 'p1');
    expect(drawRes.ok).toBe(true);
    expect(game.drawnDecisionPlayerId).toBe('p1');
    expect(game.drawnPlayableCardId).toBe('r-7');
    expect(game.currentPlayerIndex).toBe(0);

    // Cannot play a different card from hand while in drawnDecision
    const wrongPlay = playCard(game, players, 'p1', 'b-9');
    expect(wrongPlay.ok).toBe(false);

    // Can keep it and pass turn
    const keepRes = keepDrawnCard(game, players, 'p1');
    expect(keepRes.ok).toBe(true);
    expect(game.drawnDecisionPlayerId).toBeNull();
    expect(game.currentPlayerIndex).toBe(1);
    expect(players[0].hand).toHaveLength(2);
  });

  it('Wild+4 chooses color, immediately makes next player draw 4 cards, and skips them', () => {
    const players = makePlayers(3);
    players[0].hand = [
      { id: 'w4', color: 'wild', value: 'wild4' },
      { id: 'r-5', color: 'red', value: '5' },
    ];
    players[1].hand = [{ id: 'g-3', color: 'green', value: '3' }];
    players[2].hand = [{ id: 'b-7', color: 'blue', value: '7' }];

    const game = makeControlledGame(players, { id: 'r-1', color: 'red', value: '1' }, [
      { id: 'x1', color: 'blue', value: '1' },
      { id: 'x2', color: 'blue', value: '2' },
      { id: 'x3', color: 'blue', value: '3' },
      { id: 'x4', color: 'blue', value: '4' },
    ]);

    const res = playCard(game, players, 'p1', 'w4', 'blue');
    expect(res.ok).toBe(true);
    expect(game.activeColor).toBe('blue');
    expect(players[1].hand).toHaveLength(5); // 1 + 4 drawn immediately
    expect(game.currentPlayerIndex).toBe(2); // p2 skipped, turn goes to p3
  });

  it('recycles discard pile when draw pile runs out and scores round accurately', () => {
    const players = makePlayers(2);
    players[0].hand = [{ id: 'r-d2', color: 'red', value: 'draw2' }];
    players[1].hand = [{ id: 'y-5', color: 'yellow', value: '5' }];

    const game = makeControlledGame(players, { id: 'r-rev', color: 'red', value: 'reverse' }, []);
    // Only 2 cards beneath r-d2 once r-d2 is played: g-skip (20) and r-rev (20)
    game.discardPile.unshift({ id: 'g-skip', color: 'green', value: 'skip' });

    const res = playCard(game, players, 'p1', 'r-d2');
    expect(res.ok).toBe(true);
    expect(res.roundEnded).toBe(true);
    // p2 had y-5 (5 pts) + drew g-skip (20 pts) + r-rev (20 pts) = 45 pts!
    expect(game.roundSummary?.winnerId).toBe('p1');
    expect(game.roundSummary?.pointsEarned).toBe(45);
  });

  it('handles initial wild card color selection', () => {
    const players = makePlayers(2);
    const game = makeControlledGame(players, { id: 'w-init', color: 'wild', value: 'wild' });
    game.pendingInitialColorChoice = true;

    const blockedPlay = drawCardAction(game, players, 'p1');
    expect(blockedPlay.ok).toBe(false);

    const pickRes = chooseInitialColor(game, players, 'p1', 'blue');
    expect(pickRes.ok).toBe(true);
    expect(game.activeColor).toBe('blue');
    expect(game.pendingInitialColorChoice).toBe(false);
    expect(game.currentPlayerIndex).toBe(0);
  });

  it('allows playing 2 identical colored cards at once and rejects mismatched pairs', () => {
    const players = makePlayers(2);
    players[0].hand = [
      { id: 'r-7-1', color: 'red', value: '7' },
      { id: 'r-7-2', color: 'red', value: '7' },
      { id: 'b-7-1', color: 'blue', value: '7' },
    ];
    players[1].hand = [{ id: 'g-3', color: 'green', value: '3' }];

    const game = makeControlledGame(players, { id: 'r-1', color: 'red', value: '1' });

    // Mismatched color pair (red 7 + blue 7) must fail
    const badPair = playCards(game, players, 'p1', ['r-7-1', 'b-7-1']);
    expect(badPair.ok).toBe(false);
    expect(players[0].hand).toHaveLength(3);

    // Identical pair (red 7 + red 7) succeeds
    const goodPair = playCards(game, players, 'p1', ['r-7-1', 'r-7-2']);
    expect(goodPair.ok).toBe(true);
    expect(players[0].hand).toHaveLength(1);
    expect(game.discardPile.slice(-2).map((c) => c.id)).toEqual(['r-7-1', 'r-7-2']);
    expect(game.currentPlayerIndex).toBe(1);
  });

  it('supports Einwerfen (jump_in) mode: out-of-turn exact match jumps turn to that player', () => {
    const players = makePlayers(3);
    players[0].hand = [{ id: 'y-9', color: 'yellow', value: '9' }];
    players[1].hand = [{ id: 'g-2', color: 'green', value: '2' }]; // p2 is currentPlayerIndex = 1
    players[2].hand = [
      { id: 'b-5-2', color: 'blue', value: '5' },
      { id: 'b-9-1', color: 'blue', value: '9' },
      { id: 'r-5-1', color: 'red', value: '5' },
    ];

    const game = makeControlledGame(players, { id: 'b-5-1', color: 'blue', value: '5' });
    game.currentPlayerIndex = 1; // p2's turn

    // In standard mode, p3 cannot jump in
    const stdDenied = playCards(game, players, 'p3', ['b-5-2'], undefined, {
      gameMode: 'standard',
    });
    expect(stdDenied.ok).toBe(false);

    // In jump_in mode, wrong color same number (red 5) is denied
    const wrongColor = playCards(game, players, 'p3', ['r-5-1'], undefined, {
      gameMode: 'jump_in',
    });
    expect(wrongColor.ok).toBe(false);

    // Exact match (blue 5) succeeds out of turn and makes p3 the active player!
    const jumpInOk = playCards(game, players, 'p3', ['b-5-2'], undefined, {
      gameMode: 'jump_in',
    });
    expect(jumpInOk.ok).toBe(true);
    expect(jumpInOk.wasJumpIn).toBe(true);
    expect(game.currentPlayerIndex).toBe(2); // p3 is now active!
    expect(game.discardPile[game.discardPile.length - 1].id).toBe('b-5-2');
  });
});
