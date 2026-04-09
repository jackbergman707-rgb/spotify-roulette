'use client'

import type { Player, Guess } from '@/types'

interface Props {
  players: Player[]
  guesses: Guess[]
  myPlayerId: string
}

export function PlayerStatusBar({ players, guesses, myPlayerId }: Props) {
  const lockedIds = new Set(guesses.map((g) => g.player_id))

  return (
    <div className="flex flex-wrap gap-2 justify-center py-3">
      {players
        .filter((p) => p.is_connected)
        .map((p) => {
          const locked = lockedIds.has(p.id)
          const isMe = p.id === myPlayerId
          return (
            <div
              key={p.id}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300',
                locked
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-white/5 text-white/50 border border-white/10',
                isMe ? 'ring-1 ring-white/30' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'w-2 h-2 rounded-full',
                  locked ? 'bg-green-400' : 'bg-white/20 animate-pulse',
                ].join(' ')}
              />
              {p.display_name}
              {isMe && <span className="text-white/40 text-xs">(you)</span>}
            </div>
          )
        })}
    </div>
  )
}
