'use client'

import { useState } from 'react'
import type { Player, Track } from '@/types'

interface Props {
  players: Player[]
  songOptions: Track[]
  myPlayerId: string
  isFinale: boolean
  onLockIn: (ownerId: string, trackId: string) => Promise<void>
  disabled?: boolean
}

export function GuessForm({
  players,
  songOptions,
  myPlayerId,
  isFinale,
  onLockIn,
  disabled,
}: Props) {
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    !disabled && !submitting && selectedOwner !== null && selectedTrack !== null

  async function handleSubmit() {
    if (!canSubmit || !selectedOwner || !selectedTrack) return
    setSubmitting(true)
    try {
      await onLockIn(selectedOwner, selectedTrack)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Part 1 — Who owns it */}
      <section>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest ml-2 mb-3">
          Whose library?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => (
            <button
              key={p.id}
              disabled={disabled || submitting}
              onClick={() => setSelectedOwner(p.id)}
              className={[
                'p-4 rounded-xl text-sm font-bold border uppercase transition-all active:scale-95',
                selectedOwner === p.id
                  ? 'bg-spotify/10 border-spotify text-spotify'
                  : 'bg-white/5 border-white/5 text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {p.display_name}
              {p.id === myPlayerId && ' (You)'}
            </button>
          ))}
        </div>
      </section>

      {/* Part 2 — Which song */}
      <section>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest ml-2 mb-3">
          Which song?
        </p>
        <div className="space-y-2">
          {songOptions.map((t) => (
            <button
              key={t.id}
              disabled={disabled || submitting}
              onClick={() => setSelectedTrack(t.id)}
              className={[
                'w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center active:scale-[0.98]',
                selectedTrack === t.id
                  ? 'bg-spotify/10 border-spotify text-spotify'
                  : 'bg-white/5 border-white/5 text-white hover:bg-white/10',
              ].join(' ')}
            >
              <span>
                <span className="font-medium">{t.title}</span>
                <span className="text-sm opacity-40 ml-2">&#183; {t.artist}</span>
              </span>
              {selectedTrack === t.id && (
                <span className="text-spotify">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          'w-full py-5 rounded-2xl font-black text-xl uppercase transition-all active:scale-95',
          canSubmit
            ? 'bg-white text-black shadow-xl'
            : 'bg-white/10 text-white/30 cursor-not-allowed',
        ].join(' ')}
      >
        {submitting ? 'Locking in...' : 'Lock It In'}
      </button>
    </div>
  )
}
