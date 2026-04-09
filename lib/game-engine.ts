/**
 * Pure game logic — no DB calls, no side effects.
 * All DB mutations happen in API routes using these helpers.
 */

import type { Track, Player, Round } from '@/types'

/** Generate a random alphanumeric room code */
export function generateRoomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/1/0 confusion
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Pick the next round's track.
 * - Filters out already-used track IDs
 * - Applies shield: if the picked track is shielded, skip it silently
 * - Picks from a random player's library weighted equally
 */
export function pickNextTrack(
  allTracks: Track[],
  players: Player[],
  usedTrackIds: Set<string>,
): { track: Track; owner: Player } | null {
  const available = allTracks.filter((t) => !usedTrackIds.has(t.id))
  if (available.length === 0) return null

  const track = available[Math.floor(Math.random() * available.length)]
  const owner = players.find((p) => p.id === track.player_id)!
  return { track, owner }
}

/**
 * Check if a picked track is shielded.
 * Returns the player whose shield was triggered, or null.
 */
export function checkShield(
  track: Track,
  players: Player[],
): Player | null {
  return (
    players.find(
      (p) =>
        p.shield_track_id === track.spotify_track_id && !p.shield_used,
    ) ?? null
  )
}

interface DecoyOptions {
  correctTrack: Track
  allTracks: Track[]
  count?: number
}

/**
 * Pick `count` decoy tracks for the song-title guess.
 * Prefers same genre/era to make decoys plausible.
 */
export function pickDecoys({ correctTrack, allTracks, count = 3 }: DecoyOptions): Track[] {
  const candidates = allTracks.filter(
    (t) => t.id !== correctTrack.id,
  )

  // Score candidates: +2 for genre match, +1 for same decade
  const correctDecade = correctTrack.release_year
    ? Math.floor(correctTrack.release_year / 10)
    : null
  const correctGenres = new Set(correctTrack.genre ?? [])

  const scored = candidates.map((t) => {
    let score = Math.random() // base randomness so ties break randomly
    if (correctGenres.size > 0 && t.genre?.some((g) => correctGenres.has(g))) {
      score += 2
    }
    if (
      correctDecade !== null &&
      t.release_year &&
      Math.floor(t.release_year / 10) === correctDecade
    ) {
      score += 1
    }
    return { t, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, count).map((s) => s.t)
}

/** Calculate points earned for a single guess */
export function calculatePoints(
  guess: { guessed_owner_id: string | null; guessed_track_id: string | null },
  round: Round & { owner_id: string; track_id: string },
): { ownerPoints: number; songPoints: number; total: number } {
  const ownerPoints = guess.guessed_owner_id === round.owner_id ? 2 : 0
  const songPoints = guess.guessed_track_id === round.track_id ? 1 : 0
  return { ownerPoints, songPoints, total: ownerPoints + songPoints }
}

/** True when every connected player has a guess row for this round */
export function allPlayersLocked(
  players: Player[],
  guessPlayerIds: Set<string>,
): boolean {
  return players
    .filter((p) => p.is_connected)
    .every((p) => guessPlayerIds.has(p.id))
}
