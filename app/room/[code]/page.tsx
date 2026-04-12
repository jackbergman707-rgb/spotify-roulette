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

  // Track the reveal overlay independently — stays visible until dismissed
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

  // When a round enters 'revealing' status, snapshot its data for the overlay
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
        // Fetch fresh players so scores reflect points just awarded
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

  // Shuffle song options once per round
  const songOptions: Track[] = useMemo(() => {
    if (!fullState.roundTrack) return []
    const options = [fullState.roundTrack, ...fullState.roundDecoys]
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return options
  }, [fullState.currentRound?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { play, isPlaying, isReady, error: playerError } = useSpotifyPlayer({
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
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </main>
    )
  }

  const showingReveal = revealData !== null
  const isPlaying_ = fullState.currentRound?.status === 'playing'

  return (
    <main className="min-h-screen bg-black text-white">
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
              <h2 className="text-3xl font-black">Game over</h2>
              <p className="text-white/40 mt-1">Final standings</p>
            </div>
            <Leaderboard players={fullState.players} highlightId={myPlayerId ?? undefined} />
          </div>
        ) : !showingReveal ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-white/40 text-sm">
                Round {fullState.room?.current_round} of {fullState.room?.total_rounds}
                {fullState.currentRound?.is_finale && ' — finale'}
              </p>
              <p className="text-white/30 text-sm">{myPlayer?.score ?? 0} pts</p>
            </div>

            {playerError ? (
              <p className="text-red-400 text-sm">{playerError}</p>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={play}
                  disabled={!isReady}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-black font-semibold rounded-full text-sm hover:bg-green-400 active:scale-95 transition-all disabled:opacity-40"
                >
                  {!isReady ? 'Connecting…' : isPlaying ? '▶ Playing' : '▶ Play clip'}
                </button>
                {isPlaying && (
                  <span className="flex gap-0.5 items-end">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-1 bg-green-400 rounded-full animate-bounce"
                        style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            )}

            {isPlaying_ && myPlayerId && (
              <PlayerStatusBar
                players={fullState.players}
                guesses={fullState.guesses}
                myPlayerId={myPlayerId}
              />
            )}

            {isPlaying_ && !fullState.myGuess && myPlayerId && !fullState.currentRound?.is_finale && (
              <GuessForm
                players={fullState.players}
                songOptions={songOptions}
                myPlayerId={myPlayerId}
                isFinale={false}
                onLockIn={handleLockIn}
                disabled={!!fullState.myGuess}
              />
            )}

            {isPlaying_ && fullState.myGuess && !fullState.currentRound?.is_finale && (
              <p className="text-center text-white/40 text-sm py-4">
                Locked in. Waiting for others…
              </p>
            )}

            {fullState.currentRound?.is_finale && isPlaying_ && (
              <p className="text-center text-white/40 text-sm py-4">
                Final round — just listen.
              </p>
            )}
          </>
        ) : null}
      </div>

      {/* Reveal overlay — stays until host clicks Next round */}
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
