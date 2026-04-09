'use client'

import type { Player } from '@/types'
import { motion } from 'framer-motion'

interface Props {
  players: Player[]
  highlightId?: string
}

export function Leaderboard({ players, highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-2 w-full max-w-sm mx-auto">
      <p className="text-xs uppercase tracking-widest text-white/30 text-center mb-4">
        Leaderboard
      </p>
      {sorted.map((p, i) => (
        <motion.div
          key={p.id}
          layout
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className={[
            'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
            p.id === highlightId
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-white/5 border-white/5',
          ].join(' ')}
        >
          <span className="text-white/30 text-sm w-5 text-right">{i + 1}</span>
          <span
            className={[
              'flex-1 font-medium',
              p.id === highlightId ? 'text-green-300' : 'text-white',
            ].join(' ')}
          >
            {p.display_name}
          </span>
          <span className="text-white font-bold tabular-nums">{p.score}</span>
        </motion.div>
      ))}
    </div>
  )
}
