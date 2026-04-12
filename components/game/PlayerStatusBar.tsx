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
    <div className="flex gap-2 flex-wrap">
      {players
        .filter((p) => p.is_connected)
        .map((p) => {
          const locked = lockedIds.has(p.id)
          const isMe = p.id === myPlayerId
          return (
            <div
              key={p.id}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase border transition-all duration-300',
                locked
                  ? 'bg-spotify/20 text-spotify border-spotify/40'
                  : 'bg-white/5 text-gray-400 border-white/5 opacity-50',
                isMe ? 'ring-1 ring-white/30 pulse-ring' : '',
              ].join(' ')}
            >
              <div
                className={[
                  'w-1.5 h-1.5 rounded-full',
                  locked ? 'bg-spotify' : 'bg-gray-600 animate-pulse',
                ].join(' ')}
              />
              {isMe ? 'You' : p.display_name}
            </div>
          )
        })}
    </div>
  )
}
