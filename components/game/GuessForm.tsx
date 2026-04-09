'use client'

import { useState } from 'react'
import type { Player, Track } from '@/types'

interface Props {
  players: Player[]
  songOptions: Track[]   // correct track + 3 decoys, pre-shuffled
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

  if (isFinale) return null // Finale has no guessing

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
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
          Whose library is this from?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => (
            <button
              key={p.id}
              disabled={disabled || submitting}
              onClick={() => setSelectedOwner(p.id)}
              className={[
                'px-4 py-3 rounded-xl text-sm font-medium border transition-all',
                selectedOwner === p.id
                  ? 'bg-green-500 border-green-400 text-black'
                  : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
                p.id === myPlayerId ? 'italic' : '',
              ].join(' ')}
            >
              {p.display_name}
              {p.id === myPlayerId && ' (you)'}
            </button>
          ))}
        </div>
      </section>

      {/* Part 2 — Which song */}
      <section>
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
          Which song is it?
        </p>
        <div className="space-y-2">
          {songOptions.map((t) => (
            <button
              key={t.id}
              disabled={disabled || submitting}
              onClick={() => setSelectedTrack(t.id)}
              className={[
                'w-full text-left px-4 py-3 rounded-xl border transition-all',
                selectedTrack === t.id
                  ? 'bg-green-500 border-green-400 text-black'
                  : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
              ].join(' ')}
            >
              <span className="font-medium">{t.title}</span>
              <span className="text-sm opacity-70 ml-2">— {t.artist}</span>
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          'w-full py-4 rounded-xl font-semibold text-base transition-all',
          canSubmit
            ? 'bg-green-500 text-black hover:bg-green-400 active:scale-95'
            : 'bg-white/10 text-white/30 cursor-not-allowed',
        ].join(' ')}
      >
        {submitting ? 'Locking in…' : 'Lock in'}
      </button>
    </div>
  )
}
