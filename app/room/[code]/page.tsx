'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useGameState } from '@/hooks/useGameState'
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer'
import { supabase } from '@/lib/supabase'
import { GuessForm } from '@/components/game/GuessForm'
import { RevealAnimation } from '@/components/game/RevealAnimation'
import { PlayerStatusBar } from '@/components/game/PlayerStatusBar'
import { HostControlBar } from '@/components/game/HostControlBar'
import { Leaderboard } from '@/components/game/Leaderboard'
import type { Track, Player, Guess } from '@/types'

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = React.use(params)
  const { data: session } = useSession()
  const spotifyId = session?.spotifyId as string | undefined

  const fullState = useGameState(code, spotifyId ?? null)

  const myPlayer = fullState.players.find((p) => p.spotify_id === spotifyId) ?? null
  const myPlayerId = myPlayer?.id ?? null

  const isHost = fullState.room?.host_id === spotifyId
  const isFinished = fullState.room?.status === 'finished'

  const [revealData, setRevealData] = useState<{
    track: Track
    owner: Player
    guesses: Guess[]
    players: Player[]
    isFinale: boolean
    roundNumber: number
    totalRounds: number
  } | null>(null)

  const lastRevealedRoundId = useRef<string | null>(null)

  useEffect(() => {
    const round = fullState.currentRound
    if (
      round?.status === 'revealing' &&
      round.id !== lastRevealedRoundId.current &&
      fullState.roundTrack &&
      fullState.room
    ) {
      const owner = fullState.players.find((p) => p.id === round.owner_id)
      if (owner) {
        lastRevealedRoundId.current = round.id
        const roomId = fullState.room.id
        const roundTrack = fullState.roundTrack
        const guesses = fullState.guesses
        supabase
          .from('sr_players')
          .select()
          .eq('room_id', roomId)
          .then(({ data: freshPlayers }) => {
            const players = freshPlayers ?? fullState.players
            setRevealData({
              track: roundTrack,
              owner: players.find((p) => p.id === owner.id) ?? owner,
              guesses,
              players,
              isFinale: round.is_finale,
              roundNumber: round.round_number,
              totalRounds: fullState.room?.total_rounds ?? 0,
            })
          })
      }
    }
  }, [fullState.currentRound?.status, fullState.currentRound?.id])

  const songOptions: Track[] = useMemo(() => {
    if (!fullState.roundTrack) return []
    const options = [fullState.roundTrack, ...fullState.roundDecoys]
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return options
  }, [fullState.currentRound?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { play, isPlaying, isReady, error: playerError, isMobileDevice, needsSpotifyOpen, isConnecting, retryConnection } = useSpotifyPlayer({
    accessToken: session?.accessToken,
    spotifyTrackId: fullState.roundTrack?.spotify_track_id ?? null,
    startOffsetMs: fullState.roundTrack?.start_offset_ms ?? 0,
    clipDurationMs: 12_000,
    replaySignal: fullState.replaySignal,
  })

  async function handleLockIn(ownerId: string, trackId: string) {
    await fetch(`/api/rooms/${code}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, trackId }),
    })
  }

  function handleRevealDismiss() {
    setRevealData(null)
  }

  if (fullState.isLoading) {
    return (
      <main className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-spotify border-t-transparent animate-spin" />
      </main>
    )
  }

  const showingReveal = revealData !== null
  const isPlaying_ = fullState.currentRound?.status === 'playing'

  return (
    <main className="min-h-screen bg-night text-white">
      {isHost && fullState.currentRound && !showingReveal && (
        <HostControlBar
          roomCode={code}
          players={fullState.players}
          guesses={fullState.guesses}
          roundStatus={fullState.currentRound.status}
          isRevealing={showingReveal}
          hostPlayerId={myPlayerId}
        />
      )}

      <div className={['px-6 pb-10 flex flex-col gap-6', isHost && !showingReveal ? 'pt-16' : 'pt-10'].join(' ')}>
        {isFinished && !showingReveal ? (
          <div className="flex flex-col items-center gap-8 mt-10">
            <div className="text-center">
              <h2 className="text-5xl font-black uppercase italic tracking-tighter">Game Over</h2>
              <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-2">Final Standings</p>
            </div>
            <Leaderboard players={fullState.players} highlightId={myPlayerId ?? undefined} />
            <div className="w-full max-w-sm space-y-4 mt-4">
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-5 bg-spotify text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase shadow-[0_0_30px_rgba(29,185,84,0.3)]"
              >
                Play Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-4 text-white/40 font-bold uppercase text-xs tracking-widest active:opacity-60"
              >
                Back to Menu
              </button>
            </div>
          </div>
        ) : !showingReveal ? (
          <>
            {/* Header */}
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-white font-black italic uppercase">
                  Round {fullState.room?.current_round}{' '}
                  <span className="text-gray-600">/ {fullState.room?.total_rounds}</span>
                </span>
                {fullState.currentRound?.is_finale && (
                  <span className="text-spotify text-[10px] font-black uppercase tracking-widest">Finale</span>
                )}
                <div className="flex gap-1 mt-1">
                  {Array.from({ length: fullState.room?.total_rounds ?? 0 }).map((_, i) => (
                    <div
                      key={i}
                      className={[
                        'w-1 h-1 rounded-full',
                        i < (fullState.room?.current_round ?? 0) ? 'bg-spotify' : 'bg-white/20',
                      ].join(' ')}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Score</p>
                <p className="text-white font-black text-xl">
                  {myPlayer?.score ?? 0} <span className="text-spotify">pts</span>
                </p>
              </div>
            </div>

            {/* Player status */}
            {isPlaying_ && myPlayerId && (
              <PlayerStatusBar
                players={fullState.players}
                guesses={fullState.guesses}
                myPlayerId={myPlayerId}
              />
            )}

            {/* Spotify connection card (mobile only) */}
            {isMobileDevice && needsSpotifyOpen && (
              <div className="bg-card rounded-3xl border border-white/5 p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-spotify/10 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-spotify" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-black uppercase text-sm">Connect Spotify</h3>
                    <p className="text-gray-400 text-xs mt-0.5">Open the Spotify app on your phone to enable playback</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <a
                    href="spotify://"
                    className="w-full py-4 bg-spotify text-black font-black text-base rounded-2xl active:scale-95 transition-transform uppercase tracking-tight flex items-center justify-center gap-2"
                  >
                    Open Spotify
                  </a>
                  <button
                    onClick={retryConnection}
                    disabled={isConnecting}
                    className="w-full py-4 bg-white/5 border border-white/10 text-white font-bold text-sm rounded-2xl active:scale-95 transition-transform uppercase tracking-widest disabled:opacity-50"
                  >
                    {isConnecting ? 'Checking...' : 'I\'ve Opened It — Connect'}
                  </button>
                </div>

                <p className="text-gray-600 text-[10px] text-center uppercase tracking-widest font-bold">
                  Audio plays through your Spotify app
                </p>
              </div>
            )}

            {/* Play button */}
            {!(isMobileDevice && needsSpotifyOpen) && (
              <div className="flex flex-col items-center justify-center py-8">
                {playerError ? (
                  <div className="text-center space-y-3">
                    <p className="text-red-400 text-sm font-bold">{playerError}</p>
                    {isMobileDevice && (
                      <button
                        onClick={retryConnection}
                        disabled={isConnecting}
                        className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold text-xs rounded-2xl active:scale-95 transition-transform uppercase tracking-widest disabled:opacity-50"
                      >
                        {isConnecting ? 'Reconnecting...' : 'Reconnect Spotify'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={play}
                      disabled={!isReady}
                      className="w-24 h-24 rounded-full bg-spotify flex items-center justify-center shadow-[0_0_40px_rgba(29,185,84,0.3)] active:scale-95 transition-transform disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" fill="black" className="w-10 h-10 ml-1">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                    {isPlaying && (
                      <div className="flex items-end gap-1 mt-6 h-5">
                        {[0.1, 0.3, 0.2, 0.1].map((delay, i) => (
                          <div
                            key={i}
                            className="vis-bar w-1 bg-spotify rounded-full"
                            style={{ animationDelay: `${delay}s` }}
                          />
                        ))}
                      </div>
                    )}
                    <p className="text-gray-500 font-bold text-xs uppercase tracking-[0.2em] mt-4">
                      {!isReady ? 'Connecting...' : isPlaying ? 'Playing clip...' : 'Tap to play'}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Guess form */}
            {isPlaying_ && !fullState.myGuess && myPlayerId && (
              <GuessForm
                players={fullState.players}
                songOptions={songOptions}
                myPlayerId={myPlayerId}
                isFinale={fullState.currentRound?.is_finale ?? false}
                onLockIn={handleLockIn}
                disabled={!!fullState.myGuess}
              />
            )}

            {isPlaying_ && fullState.myGuess && (
              <p className="text-center text-gray-500 text-sm py-4 font-bold uppercase tracking-widest">
                Locked in. Waiting for others...
              </p>
            )}
          </>
        ) : null}
      </div>

      {/* Reveal overlay */}
      {showingReveal && revealData && (
        <RevealAnimation
          track={revealData.track}
          owner={revealData.owner}
          players={revealData.players}
          guesses={revealData.guesses}
          isFinale={revealData.isFinale}
          isHost={isHost}
          roomCode={code}
          currentRound={revealData.roundNumber}
          totalRounds={revealData.totalRounds}
          onDismiss={handleRevealDismiss}
        />
      )}
    </main>
  )
}
