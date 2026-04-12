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
    <div className="space-y-3 w-full max-w-sm mx-auto">
      {sorted.map((p, i) => {
        const isFirst = i === 0
        const isHighlighted = p.id === highlightId

        return (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={[
              'flex items-center justify-between border relative overflow-hidden',
              isFirst
                ? 'p-6 rounded-3xl border-2 border-gold shadow-[0_0_20px_rgba(255,215,0,0.1)]'
                : 'p-4 rounded-2xl border-white/5 opacity-80',
              isHighlighted && !isFirst ? 'bg-spotify/10 border-spotify/30' : isFirst ? 'bg-white/5' : 'bg-white/5',
            ].join(' ')}
          >
            <div className="flex items-center gap-4">
              {/* Rank badge */}
              {isFirst ? (
                <div className="relative">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gold" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-gold" />
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-gold text-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">
                    1st
                  </div>
                </div>
              ) : (
                <span className="text-gray-500 text-sm w-5 text-right font-bold">{i + 1}</span>
              )}

              <div>
                <h3 className={[
                  'font-black uppercase',
                  isFirst ? 'text-white text-xl italic' : 'text-gray-400 font-bold',
                ].join(' ')}>
                  {p.display_name}
                </h3>
                {isFirst && (
                  <p className="text-gold text-[10px] font-bold uppercase tracking-widest">
                    Supreme Collector
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className={[
                'font-black',
                isFirst ? 'text-gold text-3xl' : 'text-gray-400 text-xl',
              ].join(' ')}>
                {p.score}
              </span>
              <span className={[
                'block font-bold uppercase tracking-tighter',
                isFirst ? 'text-gray-500 text-[10px]' : 'text-gray-600 text-[8px]',
              ].join(' ')}>
                Points
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
