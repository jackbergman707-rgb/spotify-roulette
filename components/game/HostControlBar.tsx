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
    <div className="fixed top-0 inset-x-0 z-40 bg-night/90 backdrop-blur-md border-b border-white/5 px-4 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest shrink-0">Host</span>

        <button
          onClick={() => postHostAction({ action: 'replay' })}
          disabled={roundStatus !== 'playing' && !isRevealing}
          className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs font-bold text-white disabled:opacity-30 active:scale-95 transition-all shrink-0"
        >
          Replay
        </button>

        {roundStatus === 'playing' &&
          waitingPlayers.map((p) => (
            <button
              key={p.id}
              onClick={() => postHostAction({ action: 'skip_player', playerId: p.id })}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-xs font-bold text-red-300 active:scale-95 transition-all shrink-0 hover:bg-red-500/20"
            >
              Skip {p.display_name}
            </button>
          ))}

        <span className="ml-auto text-[10px] font-black text-gray-500 uppercase tracking-widest shrink-0">
          {lockedIds.size}/{players.filter((p) => p.is_connected).length} locked
        </span>
      </div>
    </div>
  )
}
