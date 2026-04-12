/**
 * Shared reveal logic — extracted so both guess route and host skip can use it.
 * Stops at 'revealing' status and waits for host to call /next to advance.
 */

import { createAdminClient } from '@/lib/supabase'
import { calculatePoints } from '@/lib/game-engine'

export default async function revealRound(
  db: ReturnType<typeof createAdminClient>,
  roomId: string,
  round: {
    id: string
    round_number: number
    track_id: string
    owner_id: string
    is_finale: boolean
  },
) {
  // Award points first
  if (!round.is_finale) {
    const { data: guesses } = await db
      .from('sr_guesses')
      .select()
      .eq('round_id', round.id)

    if (guesses) {
      await Promise.all(
        guesses
          .filter((g) => !g.is_force_locked)
          .map(async (guess) => {
            const { total } = calculatePoints(guess, {
              owner_id: round.owner_id,
              track_id: round.track_id,
              id: round.id,
            } as Parameters<typeof calculatePoints>[1])
            if (total > 0) {
              await db.rpc('increment_score', {
                p_player_id: guess.player_id,
                p_amount: total,
              })
            }
          }),
      )
    }
  }

  // Set to 'revealing' — host must click "Next round" to advance
  await db
    .from('sr_rounds')
    .update({ status: 'revealing', revealed_at: new Date().toISOString() })
    .eq('id', round.id)
}
