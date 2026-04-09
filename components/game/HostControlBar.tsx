'use client'

import type { Player, Guess } from '@/types'

interface Props {
  roomCode: string
  players: Player[]
  guesses: Guess[]
  roundStatus: 'playing' | 'revealing' | 'done'
  isRevealing: boolean
  hostPlayerId: string | null
}

export function HostControlBar({ roomCode, players, guesses, roundStatus, isRevealing, hostPlayerId }: Props) {
  const lockedIds = new Set(guesses.map((g) => g.player_id))
  const waitingPlayers = players.filter(
    (p) => p.is_connected && !lockedIds.has(p.id) && p.id !== hostPlayerId,
  )

  async function postHostAction(body: object) {
    await fetch(`/api/rooms/${roomCode}/host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  return (
    <div className="fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-sm border-b border-white/10">
      <span className="text-xs text-white/40 uppercase tracking-widest mr-2">
        Host
      </span>

      {/* Replay button */}
      <button
        onClick={() => postHostAction({ action: 'replay' })}
        disabled={roundStatus !== 'playing' && !isRevealing}
        className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Replay clip
      </button>

      {/* Skip player buttons — only while round is active */}
      {roundStatus === 'playing' &&
        waitingPlayers.map((p) => (
          <button
            key={p.id}
            onClick={() => postHostAction({ action: 'skip_player', playerId: p.id })}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/20 transition-colors"
          >
            Skip {p.display_name}
          </button>
        ))}

      <div className="ml-auto text-xs text-white/30">
        {lockedIds.size}/{players.filter((p) => p.is_connected).length} locked
      </div>
    </div>
  )
}
