import { describe, expect, it } from 'vitest';
import type { UnoCard } from '../../shared/types.js';
import {
  chooseInitialColor,
  createStandardDeck,
  drawCardAction,
  passTurnAction,
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
    pendingDrawCount: 0,
    hasDrawnThisTurn: false,
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
      if (firstCard.value === 'draw2') {
        expect(game.pendingDrawCount).toBe(2);
      }
      players.forEach((p) => {
        expect(p.hand).toHaveLength(7);
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

  it('on +2, next player can draw 2 and still take their turn (not skipped)', () => {
    const players = makePlayers(3);
    players[0].hand = [
      { id: 'r-d2', color: 'red', value: 'draw2' },
      { id: 'r-4', color: 'red', value: '4' },
    ];
    players[1].hand = [{ id: 'r-9', color: 'red', value: '9' }];
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
    expect(game.pendingDrawCount).toBe(2);
    expect(game.currentPlayerIndex).toBe(1); // p2's turn

    // p2 cannot play a normal red card before drawing the +2 penalty
    const blocked = playCard(game, players, 'p2', 'r-9');
    expect(blocked.ok).toBe(false);

    // p2 draws the 2 penalty cards and is STILL on their turn!
    const drawRes = drawCardAction(game, players, 'p2');
    expect(drawRes.ok).toBe(true);
    expect(players[1].hand).toHaveLength(3);
    expect(game.pendingDrawCount).toBe(0);
    expect(game.currentPlayerIndex).toBe(1); // p2 is NOT skipped!

    // Now p2 can play their matching red 9
    const playRes = playCard(game, players, 'p2', 'r-9');
    expect(playRes.ok).toBe(true);
    expect(game.currentPlayerIndex).toBe(2);
  });

  it('allows drawing once per turn without ending turn, then playing or passing turn', () => {
    const players = makePlayers(2);
    players[0].hand = [{ id: 'b-9', color: 'blue', value: '9' }];
    players[1].hand = [{ id: 'g-3', color: 'green', value: '3' }];

    const game = makeControlledGame(
      players,
      { id: 'r-1', color: 'red', value: '1' },
      [
        { id: 'y-5', color: 'yellow', value: '5' },
        { id: 'r-2', color: 'red', value: '2' },
        { id: 'r-7', color: 'red', value: '7' },
      ]
    );

    // Draw 1 card (r-7, playable): goes straight to hand, player keeps turn
    const drawRes = drawCardAction(game, players, 'p1');
    expect(drawRes.ok).toBe(true);
    expect(players[0].hand).toHaveLength(2);
    expect(players[0].hand.some((c) => c.id === 'r-7')).toBe(true);
    expect(game.hasDrawnThisTurn).toBe(true);
    expect(game.currentPlayerIndex).toBe(0);

    // Drawing a second card in the same turn is blocked
    const secondDraw = drawCardAction(game, players, 'p1');
    expect(secondDraw.ok).toBe(false);

    // Player can play the newly drawn playable card directly
    const playRes = playCard(game, players, 'p1', 'r-7');
    expect(playRes.ok).toBe(true);
    expect(game.hasDrawnThisTurn).toBe(false);
    expect(game.currentPlayerIndex).toBe(1);

    // p2 draws a playable card (r-2) and chooses to pass turn
    expect(drawCardAction(game, players, 'p2').ok).toBe(true);
    expect(game.hasDrawnThisTurn).toBe(true);
    expect(game.currentPlayerIndex).toBe(1);
    expect(passTurnAction(game, players, 'p2').ok).toBe(true);
    expect(game.hasDrawnThisTurn).toBe(false);
    expect(game.currentPlayerIndex).toBe(0);

    // p1 draws an unplayable card (y-5 on r-7 while holding b-9) -> turn ends automatically!
    expect(drawCardAction(game, players, 'p1').ok).toBe(true);
    expect(game.hasDrawnThisTurn).toBe(false);
    expect(game.currentPlayerIndex).toBe(1);
  });

  it('stacks +2 only on +2 and +4 only on +4', () => {
    const players = makePlayers(3);
    players[0].hand = [
      { id: 'r-d2', color: 'red', value: 'draw2' },
      { id: 'w4-1', color: 'wild', value: 'wild4' },
      { id: 'r-9', color: 'red', value: '9' },
    ];
    players[1].hand = [
      { id: 'b-d2', color: 'blue', value: 'draw2' },
      { id: 'w4-2', color: 'wild', value: 'wild4' },
    ];
    players[2].hand = [
      { id: 'w4-3', color: 'wild', value: 'wild4' },
      { id: 'g-d2', color: 'green', value: 'draw2' },
    ];

    const drawPile = Array.from({ length: 12 }, (_, i) => ({
      id: `x-${i}`,
      color: 'yellow' as const,
      value: '1' as const,
    }));

    const game = makeControlledGame(players, { id: 'r-1', color: 'red', value: '1' }, drawPile);

    // p1 plays +2 -> pendingDrawCount = 2
    expect(playCard(game, players, 'p1', 'r-d2').ok).toBe(true);
    expect(game.pendingDrawCount).toBe(2);
    expect(game.currentPlayerIndex).toBe(1);

    // p2 CANNOT stack +4 on +2
    expect(playCard(game, players, 'p2', 'w4-2', 'blue').ok).toBe(false);

    // p2 stacks blue +2 on +2 -> pendingDrawCount = 4
    expect(playCard(game, players, 'p2', 'b-d2').ok).toBe(true);
    expect(game.pendingDrawCount).toBe(4);
    expect(game.currentPlayerIndex).toBe(2);

    // p3 draws the 4 cards and keeps turn, then plays +4
    expect(drawCardAction(game, players, 'p3').ok).toBe(true);
    expect(players[2].hand).toHaveLength(6); // 2 + 4 drawn
    expect(game.pendingDrawCount).toBe(0);
    expect(game.currentPlayerIndex).toBe(2);

    expect(playCard(game, players, 'p3', 'w4-3', 'red').ok).toBe(true);
    expect(game.pendingDrawCount).toBe(4);
    expect(game.currentPlayerIndex).toBe(0);

    // p1 stacks +4 on +4 -> pendingDrawCount = 8
    expect(playCard(game, players, 'p1', 'w4-1', 'green').ok).toBe(true);
    expect(game.pendingDrawCount).toBe(8);
    expect(game.currentPlayerIndex).toBe(1);

    // p2 CANNOT stack +2 on +4
    expect(playCard(game, players, 'p2', 'b-d2').ok).toBe(false);
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
