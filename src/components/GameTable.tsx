import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Bot,
  HelpCircle,
  Layers,
  LogOut,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import type {
  CardColor,
  ClientRoomState,
  RoomActionResponse,
  UnoCard as UnoCardType,
} from '../../shared/types.ts';
import {
  canJumpInClient,
  COLOR_META,
  findTwinCard,
  isPlayableClient,
  sortHand,
} from '../utils/cardLabels.ts';
import { CardBack } from './CardBack.tsx';
import { ColorPickerModal } from './ColorPickerModal.tsx';
import { RoundOverModal } from './RoundOverModal.tsx';
import { UnoCard } from './UnoCard.tsx';

interface GameTableProps {
  room: ClientRoomState;
  connected: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onPlayCards: (cardIds: string[], chosenColor?: CardColor) => Promise<RoomActionResponse>;
  onDrawCard: () => void;
  onChooseInitialColor: (color: CardColor) => void;
  onSkipDisconnected: (targetPlayerId: string) => void;
  onToggleReady: () => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
  onPlayCardSound: () => void;
  onPlayDrawSound: () => void;
  onPlayTurnSound: () => void;
  onPlayRejectSound: () => void;
  onPlayWinSound: () => void;
}

function hashCardOffset(cardId: string): { rot: number; x: number; y: number } {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) {
    h = (h * 31 + cardId.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(h);
  const rot = (abs % 15) - 7; // -7 to +7 deg
  const x = ((abs >> 3) % 19) - 9; // -9 to +9 px
  const y = ((abs >> 6) % 13) - 6; // -6 to +6 px
  return { rot, x, y };
}

export function GameTable({
  room,
  connected,
  soundEnabled,
  onToggleSound,
  onPlayCards,
  onDrawCard,
  onChooseInitialColor,
  onSkipDisconnected,
  onToggleReady,
  onReturnToLobby,
  onLeave,
  onPlayCardSound,
  onPlayDrawSound,
  onPlayTurnSound,
  onPlayRejectSound,
  onPlayWinSound,
}: GameTableProps) {
  const [sorted, setSorted] = useState(true);
  const [pairMode, setPairMode] = useState(false);
  const [pendingWildCardIds, setPendingWildCardIds] = useState<string[] | null>(null);
  const [rejectedCardId, setRejectedCardId] = useState<string | null>(null);
  const [rejectNotice, setRejectNotice] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [fanWidth, setFanWidth] = useState<number>(800);
  const fanContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = fanContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    setFanWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFanWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isHost = room.hostId === room.myPlayerId;
  const isMyTurn = room.phase === 'playing' && room.currentPlayerId === room.myPlayerId;
  const isInitialColorTurn =
    room.phase === 'playing' && room.pendingInitialColorChoice && isMyTurn;

  useEffect(() => {
    if (!isMyTurn || room.phase !== 'playing') {
      setPendingWildCardIds(null);
      setPairMode(false);
    }
  }, [isMyTurn, room.phase]);

  // Clear reject notice smoothly
  useEffect(() => {
    if (!rejectNotice) return;
    const t = setTimeout(() => setRejectNotice(null), 1900);
    return () => clearTimeout(t);
  }, [rejectNotice]);

  // Order opponents starting from player after me
  const opponents = useMemo(() => {
    const myIdx = room.players.findIndex((p) => p.id === room.myPlayerId);
    if (myIdx === -1) return room.players;
    const ordered = [];
    for (let i = 1; i < room.players.length; i++) {
      ordered.push(room.players[(myIdx + i) % room.players.length]);
    }
    return ordered;
  }, [room.players, room.myPlayerId]);

  const displayedHand = useMemo(
    () => (sorted ? sortHand(room.myHand) : room.myHand),
    [room.myHand, sorted]
  );

  const hasAnyPlayablePair = useMemo(() => {
    if (!isMyTurn || isInitialColorTurn) {
      return false;
    }
    return room.myHand.some(
      (card) =>
        card.color !== 'wild' &&
        isPlayableClient(card, room.topCard, room.activeColor, room.pendingDrawCount) &&
        Boolean(findTwinCard(card, room.myHand))
    );
  }, [
    isMyTurn,
    isInitialColorTurn,
    room.myHand,
    room.topCard,
    room.activeColor,
    room.pendingDrawCount,
  ]);

  // Subtle sound cues on state changes
  const prevTurnRef = useRef<string | null>(null);
  const prevDiscardIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(room.phase);

  useEffect(() => {
    if (room.phase === 'round_over' && prevPhaseRef.current !== 'round_over') {
      onPlayWinSound();
    }
    prevPhaseRef.current = room.phase;
  }, [room.phase, onPlayWinSound]);

  useEffect(() => {
    if (
      room.phase === 'playing' &&
      room.currentPlayerId === room.myPlayerId &&
      prevTurnRef.current !== room.myPlayerId
    ) {
      onPlayTurnSound();
    }
    prevTurnRef.current = room.currentPlayerId;
  }, [room.phase, room.currentPlayerId, room.myPlayerId, onPlayTurnSound]);

  useEffect(() => {
    if (room.topCard && prevDiscardIdRef.current && prevDiscardIdRef.current !== room.topCard.id) {
      onPlayCardSound();
    }
    prevDiscardIdRef.current = room.topCard?.id ?? null;
  }, [room.topCard, onPlayCardSound]);

  const canDraw = isMyTurn && !isInitialColorTurn;

  const triggerReject = (cardId: string, reason: string) => {
    setRejectedCardId(cardId);
    setRejectNotice(reason);
    onPlayRejectSound();
    setTimeout(() => {
      setRejectedCardId((prev) => (prev === cardId ? null : prev));
    }, 360);
  };

  const submitPlay = async (cardIds: string[], primaryCard: UnoCardType) => {
    const isEmptyingHand = room.myHand.length === cardIds.length;
    if ((primaryCard.value === 'wild' || primaryCard.value === 'wild4') && !isEmptyingHand) {
      setPendingWildCardIds(cardIds);
      return;
    }
    const res = await onPlayCards(cardIds);
    if (!res.ok) {
      triggerReject(primaryCard.id, res.error ?? 'Aktion abgebrochen.');
    } else {
      setPairMode(false);
    }
  };

  const handleCardClick = async (card: UnoCardType, forcePair = false) => {
    if (room.phase !== 'playing') return;

    if (room.pendingInitialColorChoice) {
      triggerReject(card.id, 'Zuerst Startfarbe wählen.');
      return;
    }

    // Jump-In mode out of turn
    if (!isMyTurn) {
      if (room.gameMode === 'jump_in') {
        if (room.pendingDrawCount > 0) {
          triggerReject(card.id, 'Bei aktivem Strafstapel kann nicht eingeworfen werden.');
          return;
        }
        if (!canJumpInClient(card, room.topCard, room.activeColor)) {
          triggerReject(
            card.id,
            'Einwerfen nur mit derselben Karte in derselben Farbe möglich.'
          );
          return;
        }
        await submitPlay([card.id], card);
        return;
      }
      triggerReject(card.id, 'Du bist nicht am Zug.');
      return;
    }

    // Normal turn playability check
    if (!isPlayableClient(card, room.topCard, room.activeColor, room.pendingDrawCount)) {
      triggerReject(
        card.id,
        room.pendingDrawCount > 0
          ? `Aktuell liegt +${room.pendingDrawCount} — lege eine passende Strafkarte oder ziehe.`
          : 'Diese Karte passt nicht auf die Ablagekarte.'
      );
      return;
    }

    const twin = findTwinCard(card, room.myHand);
    if ((forcePair || pairMode) && twin) {
      await submitPlay([card.id, twin.id], card);
      return;
    }

    await submitPlay([card.id], card);
  };

  const handleDrawClick = () => {
    if (!canDraw) return;
    onPlayDrawSound();
    onDrawCard();
  };

  const currentPlayer = room.players.find((p) => p.id === room.currentPlayerId);
  const activeColorMeta = room.activeColor ? COLOR_META[room.activeColor] : null;
  const pendingWildCard =
    pendingWildCardIds && pendingWildCardIds.length > 0
      ? room.myHand.find((c) => c.id === pendingWildCardIds[0]) ?? null
      : null;

  // Semicircle / Arc fan layout calculations
  const cardWidthPx = fanWidth < 640 ? 84 : 96;
  const cardCount = displayedHand.length;
  const availableSpread = Math.max(220, Math.min(720, fanWidth - cardWidthPx - 24));
  const stepPx =
    cardCount <= 1
      ? 0
      : Math.min(fanWidth < 640 ? 48 : 66, availableSpread / (cardCount - 1));
  const maxAngle = Math.min(24, Math.max(0, (cardCount - 1) * 2.7));
  const arcDepth = Math.min(42, Math.max(0, (cardCount - 1) * 3.8));

  const recentDiscard =
    room.recentDiscardCards.length > 0
      ? room.recentDiscardCards
      : room.topCard
        ? [room.topCard]
        : [];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between overflow-x-hidden relative">
      {/* Top Bar */}
      <header className="border-b border-white/[0.08] px-4 py-3 sm:px-6 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="font-bold tracking-[-0.03em] text-base">UNO</span>
            <span className="text-zinc-700">|</span>
            <span className="font-mono-code text-xs text-zinc-400">
              {room.roomCode}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-600">•</span>
            <span className="hidden sm:inline text-xs text-zinc-400">
              Runde {room.roundNumber}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                room.gameMode === 'jump_in'
                  ? 'border-white/30 bg-white/[0.08] text-white'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              {room.gameMode === 'jump_in' && <Zap className="w-2.5 h-2.5" />}
              <span>{room.gameMode === 'jump_in' ? 'Einwerfen' : 'Standard'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 px-2 py-1 rounded-md border border-white/10"
              title={connected ? 'Verbunden' : 'Verbindung unterbrochen'}
            >
              {connected ? (
                <Wifi className="w-3 h-3 text-white" />
              ) : (
                <WifiOff className="w-3 h-3 text-zinc-500" />
              )}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </span>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Ton aus' : 'Ton an'}
              className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              title="Regeln"
              className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLeave}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-lg px-2.5 py-1.5 hover:border-white/25 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verlassen</span>
            </button>
          </div>
        </div>
      </header>

      {/* Optional Rules Drawer */}
      {showRules && (
        <div className="border-b border-white/10 bg-[#08080A] px-4 py-3 text-xs text-zinc-300 z-20">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="text-zinc-400">
              Standardregeln • 2 Karten derselben Farbe &amp; Zahl können gemeinsam gelegt werden (×2).
              {room.gameMode === 'jump_in' &&
                ' • Einwerfen aktiv: Gleiche Karte jederzeit reinwerfen, um direkt dran zu sein.'}
            </span>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              className="text-white underline underline-offset-4 cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* Opponents Strip */}
      <section className="px-4 pt-4 sm:px-6 z-10">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {opponents.map((opp) => {
            const isTurn = room.phase === 'playing' && room.currentPlayerId === opp.id;
            const miniStacks = Math.min(opp.cardCount, 5);
            return (
              <div
                key={opp.id}
                className={`relative rounded-xl border px-3.5 py-2 min-w-[136px] sm:min-w-[158px] transition-all ${
                  isTurn
                    ? 'border-white bg-white/[0.07] shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                    : 'border-white/10 bg-[#09090B]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {opp.isBot ? (
                      <Bot className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    ) : (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          !opp.connected
                            ? 'bg-zinc-600'
                            : isTurn
                              ? 'bg-white animate-pulse'
                              : 'bg-zinc-500'
                        }`}
                      />
                    )}
                    <span className="text-xs font-medium text-white truncate">
                      {opp.name}
                    </span>
                  </div>

                  <span className="font-mono-code text-xs font-semibold text-zinc-300 shrink-0">
                    {opp.cardCount}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 min-h-[18px]">
                  <div className="flex items-center gap-0.5" aria-hidden="true">
                    {Array.from({ length: miniStacks }).map((_, i) => (
                      <span
                        key={i}
                        className="w-2 h-3 rounded-[2px] border border-white/25 bg-zinc-900"
                      />
                    ))}
                    {opp.cardCount > 5 && (
                      <span className="text-[10px] text-zinc-500 ml-1">+{opp.cardCount - 5}</span>
                    )}
                  </div>

                  {!opp.connected && !opp.isBot ? (
                    <span className="text-[10px] text-zinc-500">Getrennt</span>
                  ) : null}
                </div>

                {isHost && isTurn && !opp.connected && !opp.isBot && (
                  <button
                    type="button"
                    onClick={() => onSkipDisconnected(opp.id)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 py-1 text-[10px] text-zinc-300 hover:bg-white hover:text-black transition-colors cursor-pointer"
                  >
                    <SkipForward className="w-3 h-3" />
                    <span>Zug überspringen</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Center Stage: Large Layered Discard Stack */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">
        <div className="relative flex items-center justify-center w-[220px] h-[245px] sm:w-[270px] sm:h-[296px]">
          {recentDiscard.map((card, idx) => {
            const offsetFromTop = recentDiscard.length - 1 - idx;
            const isTop = offsetFromTop === 0;
            const { rot, x, y } = isTop
              ? { rot: 0, x: 0, y: 0 }
              : hashCardOffset(card.id);

            const opacity = isTop
              ? 1
              : offsetFromTop === 1
                ? 0.85
                : offsetFromTop === 2
                  ? 0.62
                  : 0.42;

            const scale = isTop ? 1 : 1 - offsetFromTop * 0.025;

            return (
              <div
                key={card.id}
                style={{
                  transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
                  opacity,
                  zIndex: idx + 1,
                }}
                className="absolute transition-all duration-300 ease-out"
              >
                <UnoCard card={card} size="xl" />
              </div>
            );
          })}
        </div>

        {/* Active Color + Direction + Last Event / Reject Notice */}
        <div className="mt-3 flex flex-col items-center gap-2 max-w-md text-center z-10">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-[#09090B] px-4 py-1.5 text-xs">
            {activeColorMeta && (
              <span className="inline-flex items-center gap-1.5 text-white font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: activeColorMeta.hex }}
                />
                <span>{activeColorMeta.label}</span>
              </span>
            )}

            <span className="text-zinc-700">•</span>

            <span className="inline-flex items-center gap-1 text-zinc-400">
              {room.direction === 1 ? (
                <>
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Uhrzeigersinn</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Gegen Uhrzeigersinn</span>
                </>
              )}
            </span>

            {room.pendingDrawCount > 0 && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="font-mono-code font-bold text-white">
                  +{room.pendingDrawCount} aktiv
                </span>
              </>
            )}
          </div>

          {rejectNotice ? (
            <p className="text-xs font-medium text-white bg-white/[0.1] border border-white/25 rounded-full px-3.5 py-1 animate-card-pop">
              {rejectNotice}
            </p>
          ) : (
            room.lastEvent && (
              <p className="text-xs text-zinc-400 px-3 leading-relaxed">
                {room.lastEvent.message}
              </p>
            )
          )}
        </div>

        {/* Draw Pile docked cleanly bottom-right on mobile/tablet inside arena, fixed bottom-right on larger screens */}
        <div className="self-end mt-3 mr-1 md:fixed md:bottom-7 md:right-8 md:m-0 z-20">
          <CardBack
            count={room.drawPileCount}
            canDraw={canDraw}
            pendingDrawCount={room.pendingDrawCount}
            onClick={handleDrawClick}
          />
        </div>
      </main>

      {/* Bottom Controls + Semicircle Fan Hand */}
      <footer className="px-3 pb-4 pt-2 sm:px-6 md:pr-36 lg:pr-40 z-10">
        <div className="max-w-4xl mx-auto space-y-2.5">
          {/* Centered Turn Indicator & Controls Bar */}
          <div className="flex flex-col items-center gap-2.5 px-1">
            <div
              className={`inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-2 text-sm sm:text-base font-semibold tracking-tight transition-all ${
                isMyTurn
                  ? 'bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.2)]'
                  : 'border border-white/15 bg-[#09090B] text-zinc-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isMyTurn ? 'bg-black animate-pulse' : 'bg-zinc-400'
                }`}
              />
              <span>
                {isMyTurn
                  ? 'Du bist am Zug'
                  : `${currentPlayer?.name ?? '…'} ist am Zug`}
              </span>
            </div>

            <div className="w-full flex items-center justify-between gap-2">
              <span className="font-mono-code text-xs text-zinc-500">
                {room.myHand.length} {room.myHand.length === 1 ? 'Karte' : 'Karten'}
              </span>

              <div className="flex items-center gap-2">
                {hasAnyPlayablePair && (
                  <button
                    type="button"
                    onClick={() => setPairMode((p) => !p)}
                    title="2 identische Karten gleichzeitig legen"
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      pairMode
                        ? 'border-white bg-white text-black font-semibold'
                        : 'border-white/20 text-zinc-300 hover:text-white hover:border-white/40'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>2× Paar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSorted((s) => !s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    sorted
                      ? 'border-white/25 text-white bg-white/[0.06]'
                      : 'border-white/12 text-zinc-400 hover:text-white'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Sortiert</span>
                </button>
              </div>
            </div>
          </div>

          {/* Semicircle / Arc Fan Hand */}
          <div
            ref={fanContainerRef}
            className="relative w-full h-[175px] sm:h-[205px] flex items-end justify-center pt-4"
          >
            {displayedHand.map((card, i) => {
              const t = cardCount <= 1 ? 0 : (i / (cardCount - 1)) * 2 - 1;
              const xOffset = (i - (cardCount - 1) / 2) * stepPx;
              const rotateDeg = t * maxAngle;
              const arcDropPx = t * t * arcDepth;

              const twin =
                isMyTurn &&
                !isInitialColorTurn &&
                isPlayableClient(card, room.topCard, room.activeColor, room.pendingDrawCount)
                  ? findTwinCard(card, room.myHand)
                  : undefined;

              const isHighlighted = pairMode && Boolean(twin);

              return (
                <div
                  key={card.id}
                  style={{
                    left: '50%',
                    marginLeft: `${xOffset - cardWidthPx / 2}px`,
                    bottom: `${Math.max(4, arcDepth - arcDropPx + 4)}px`,
                    transform: `rotate(${rotateDeg}deg)`,
                    transformOrigin: 'bottom center',
                    zIndex: i + 1,
                  }}
                  className="group absolute transition-all duration-200 ease-out hover:-translate-y-7 hover:scale-[1.06] hover:z-40"
                >
                  {twin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCardClick(card, true);
                      }}
                      title="Beide identischen Karten gleichzeitig legen"
                      className="absolute -top-2.5 right-1 z-30 rounded-full bg-white text-black px-1.5 py-0.5 text-[10px] font-bold shadow-md hover:scale-110 transition-transform cursor-pointer"
                    >
                      ×2
                    </button>
                  )}

                  <UnoCard
                    card={card}
                    size="md"
                    interactive
                    highlighted={isHighlighted}
                    rejected={rejectedCardId === card.id}
                    onClick={() => void handleCardClick(card)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </footer>

      {/* Modals */}
      {isInitialColorTurn && (
        <ColorPickerModal
          title="Startfarbe wählen"
          subtitle="Die erste Karte ist eine Farbwahl-Karte. Wähle die Startfarbe."
          onSelect={onChooseInitialColor}
        />
      )}

      {pendingWildCard && pendingWildCardIds && (
        <ColorPickerModal
          title="Farbe wählen"
          onSelect={async (color) => {
            const ids = pendingWildCardIds;
            setPendingWildCardIds(null);
            const res = await onPlayCards(ids, color);
            if (!res.ok) {
              triggerReject(ids[0], res.error ?? 'Aktion abgebrochen.');
            }
          }}
          onCancel={() => setPendingWildCardIds(null)}
        />
      )}

      {room.phase === 'round_over' && (
        <RoundOverModal
          room={room}
          onToggleReady={onToggleReady}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
