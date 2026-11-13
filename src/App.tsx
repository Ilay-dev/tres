import { useEffect, useState } from 'react';
import { GameTable } from './components/GameTable.tsx';
import { HomeScreen } from './components/HomeScreen.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { useSound } from './hooks/useSound.ts';
import { useUnoSocket } from './hooks/useSocket.ts';

function readRoomParam(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room') ?? '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export default function App() {
  const [initialRoomCode] = useState<string>(() => readRoomParam());
  const {
    connected,
    roomState,
    errorBanner,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    setGameMode,
    addBot,
    removePlayer,
    skipDisconnected,
    nextRoundToLobby,
    chooseInitialColor,
    playCards,
    drawCard,
    keepDrawnCard,
    resolveChallenge,
    callUno,
    catchUno,
  } = useUnoSocket();

  const {
    soundEnabled,
    toggleSound,
    playCardSound,
    playDrawSound,
    playTurnSound,
    playRejectSound,
    playUnoSound,
    playWinSound,
  } = useSound();

  // Auto-dismiss transient error toast after 4.5s
  useEffect(() => {
    if (!errorBanner) return;
    const timer = setTimeout(() => clearError(), 4500);
    return () => clearTimeout(timer);
  }, [errorBanner, clearError]);

  // Keep URL cleanly updated with ?room=CODE when inside a room
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (roomState?.roomCode) {
      const targetUrl = `${window.location.pathname}?room=${roomState.roomCode}`;
      if (window.location.search !== `?room=${roomState.roomCode}`) {
        window.history.replaceState({}, '', targetUrl);
      }
    }
  }, [roomState?.roomCode]);

  const handleLeaveRoom = async () => {
    await leaveRoom();
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (!roomState) {
    return (
      <HomeScreen
        connected={connected}
        initialRoomCode={initialRoomCode}
        errorMessage={errorBanner}
        onCreateRoom={async (name) => {
          await createRoom(name);
        }}
        onJoinRoom={async (code, name) => {
          await joinRoom(code, name);
        }}
        onClearError={clearError}
      />
    );
  }

  return (
    <>
      {errorBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-white/25 bg-[#111113] px-4 py-2.5 text-xs text-white shadow-2xl flex items-center gap-3">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {roomState.phase === 'lobby' ? (
        <LobbyScreen
          room={roomState}
          connected={connected}
          onToggleReady={toggleReady}
          onSetGameMode={setGameMode}
          onAddBot={addBot}
          onRemovePlayer={removePlayer}
          onLeave={handleLeaveRoom}
        />
      ) : (
        <GameTable
          room={roomState}
          connected={connected}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          onPlayCards={playCards}
          onDrawCard={drawCard}
          onKeepDrawnCard={keepDrawnCard}
          onChooseInitialColor={chooseInitialColor}
          onResolveChallenge={resolveChallenge}
          onCallUno={callUno}
          onCatchUno={catchUno}
          onSkipDisconnected={skipDisconnected}
          onToggleReady={toggleReady}
          onReturnToLobby={nextRoundToLobby}
          onLeave={handleLeaveRoom}
          onPlayCardSound={playCardSound}
          onPlayDrawSound={playDrawSound}
          onPlayTurnSound={playTurnSound}
          onPlayRejectSound={playRejectSound}
          onPlayUnoSound={playUnoSound}
          onPlayWinSound={playWinSound}
        />
      )}
    </>
  );
}
