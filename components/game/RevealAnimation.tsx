'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Track, Player, Guess } from '@/types'

interface Props {
  track: Track
  owner: Player
  players: Player[]
  guesses: Guess[]
  isFinale: boolean
  isHost: boolean
  roomCode: string
  currentRound: number
  totalRounds: number
  onDismiss: () => void
}

type Phase = 'song' | 'owner' | 'scores' | 'leaderboard'

function useCountUp(target: number, enabled: boolean, duration = 600) {
  const [value, setValue] = useState(target)
  const startRef = useRef<number | null>(null)
  const startValueRef = useRef(target)

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    startValueRef.current = value
    startRef.current = null
    let raf: number

    function tick(now: number) {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(startValueRef.current + (target - startValueRef.current) * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return value
}

function AnimatedScore({ target, enabled }: { target: number; enabled: boolean }) {
  const value = useCountUp(target, enabled)
  return <>{value}</>
}

export function RevealAnimation({
  track,
  owner,
  players,
  guesses,
  isFinale,
  isHost,
  roomCode,
  currentRound,
  totalRounds,
  onDismiss,
}: Props) {
  const [phase, setPhase] = useState<Phase>('song')
  const [advancing, setAdvancing] = useState(false)
  const [countingUp, setCountingUp] = useState(false)
  const [flyingPts, setFlyingPts] = useState<Record<string, boolean>>({})

  const roundPts: Record<string, number> = {}
  guesses.forEach((g) => {
    const ownerRight = g.guessed_owner_id === owner.id
    const songRight = g.guessed_track_id === track.id
    roundPts[g.player_id] = (ownerRight ? 2 : 0) + (songRight ? 1 : 0)
  })

  const prevScore = (p: Player) => p.score - (roundPts[p.id] ?? 0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('owner'), 2500)
    const t2 = setTimeout(() => setPhase('scores'), 4500)
    const t3 = setTimeout(() => setPhase('leaderboard'), 7000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  useEffect(() => {
    if (phase === 'leaderboard') {
      const flying: Record<string, boolean> = {}
      players.forEach((p) => { if ((roundPts[p.id] ?? 0) > 0) flying[p.id] = true })
      setFlyingPts(flying)
      setTimeout(() => setCountingUp(true), 400)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNext() {
    setAdvancing(true)
    await fetch(`/api/rooms/${roomCode}/next`, { method: 'POST' })
    onDismiss()
  }

  const isLastRound = currentRound >= totalRounds
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="fixed inset-0 z-50 bg-night flex flex-col items-center justify-center px-6 text-center overflow-y-auto py-10">
      <AnimatePresence mode="wait">

        {phase === 'song' && (
          <motion.div
            key="song"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-3"
          >
            <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em]">The song was</p>
            <h2 className="text-5xl font-black text-white tracking-tighter">{track.title}</h2>
            <p className="text-spotify text-xl font-bold">{track.artist}</p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="text-gray-500 text-xs font-black uppercase tracking-[0.3em] pt-8"
            >
              And it belongs to...
            </motion.p>
          </motion.div>
        )}

        {phase === 'owner' && (
          <motion.div
            key="owner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.45, ease: 'backOut' }}
            className="space-y-6"
          >
            <div className="space-y-1">
              <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em]">The song was</p>
              <h2 className="text-2xl font-bold text-white">{track.title}</h2>
              <p className="text-spotify font-bold">{track.artist}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em] mb-3">
                {isFinale ? 'Owned by' : 'From the library of'}
              </p>
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="text-6xl font-black uppercase italic text-spotify tracking-tighter"
              >
                {owner.display_name}
              </motion.h3>
            </div>
          </motion.div>
        )}

        {phase === 'scores' && (
          <motion.div
            key="scores"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm space-y-6"
          >
            <h4 className="text-gray-600 text-[10px] font-black uppercase tracking-widest text-center">Results</h4>

            <div className="space-y-2">
              {guesses.map((guess, i) => {
                const player = players.find((p) => p.id === guess.player_id)
                if (!player) return null
                const ownerRight = guess.guessed_owner_id === owner.id
                const songRight = guess.guessed_track_id === track.id
                const pts = (ownerRight ? 2 : 0) + (songRight ? 1 : 0)
                const hasCorrect = ownerRight || songRight
                return (
                  <motion.div
                    key={guess.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={[
                      'flex items-center justify-between p-4 rounded-2xl border',
                      hasCorrect
                        ? 'bg-white/5 border-spotify'
                        : 'bg-white/5 border-red-500/20',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold">{player.display_name}</span>
                      <div className="flex gap-1">
                        <span className={ownerRight ? 'text-spotify' : 'text-red-500'}>
                          {ownerRight ? '\u2713' : '\u2717'}
                        </span>
                        <span className={songRight ? 'text-spotify' : 'text-red-500'}>
                          {songRight ? '\u2713' : '\u2717'}
                        </span>
                      </div>
                    </div>
                    <span className={[
                      'font-black text-xl',
                      pts > 0 ? 'text-spotify' : 'text-gray-600',
                    ].join(' ')}>
                      +{pts} <span className="text-[8px] uppercase tracking-widest opacity-60">pts</span>
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {phase === 'leaderboard' && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-sm space-y-6"
          >
            <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest text-center">Standings</p>

            <div className="space-y-2">
              {sortedPlayers.map((p, i) => {
                const pts = roundPts[p.id] ?? 0
                const isFly = flyingPts[p.id]
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
                    className={[
                      'relative flex items-center gap-3 px-4 py-3 rounded-2xl border',
                      i === 0 ? 'bg-spotify/10 border-spotify/30' : 'bg-white/5 border-white/5',
                    ].join(' ')}
                  >
                    <span className="text-white/40 text-sm w-4">{i + 1}</span>
                    <span className={['flex-1 font-bold text-sm uppercase', i === 0 ? 'text-spotify' : 'text-white'].join(' ')}>
                      {p.display_name}
                    </span>

                    <div className="relative flex items-center gap-1.5">
                      {pts > 0 && isFly && (
                        <motion.span
                          initial={{ opacity: 1, y: 0, x: 0 }}
                          animate={{ opacity: 0, y: -24, x: 8 }}
                          transition={{ duration: 0.5, delay: i * 0.08 + 0.1 }}
                          onAnimationComplete={() =>
                            setFlyingPts((prev) => ({ ...prev, [p.id]: false }))
                          }
                          className="absolute right-10 text-spotify font-black text-sm pointer-events-none"
                        >
                          +{pts}
                        </motion.span>
                      )}

                      <motion.span
                        className="font-black text-white tabular-nums text-xl"
                        animate={countingUp && pts > 0 ? { scale: [1, 1.3, 1] } : {}}
                        transition={{ delay: i * 0.08 + 0.3, duration: 0.4 }}
                      >
                        <AnimatedScore target={p.score} enabled={countingUp} />
                      </motion.span>
                      <span className="text-gray-500 text-[8px] font-bold uppercase">pts</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {isHost && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + sortedPlayers.length * 0.08 }}
                onClick={handleNext}
                disabled={advancing}
                className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl active:scale-95 disabled:opacity-50 transition-all uppercase shadow-2xl"
              >
                {advancing ? '...' : isLastRound ? 'See Final Results' : 'Next Round \u2192'}
              </motion.button>
            )}

            {!isHost && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-gray-500 text-sm font-bold"
              >
                Waiting for host to continue...
              </motion.p>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
