import { createAdminClient } from '@/lib/supabase'
import { pickNextTrack, pickDecoys } from '@/lib/game-engine'

export async function advanceToNextRound(
  db: ReturnType<typeof createAdminClient>,
  roomId: string,
) {
  const { data: room } = await db.from('rooms').select().eq('id', roomId).single()
  if (!room) return

  const { data: players } = await db.from('players').select().eq('room_id', roomId)
  const { data: allTracks } = await db.from('tracks').select().eq('room_id', roomId)
  const { data: existingRounds } = await db
    .from('rounds')
    .select('track_id')
    .eq('room_id', roomId)

  if (!players || !allTracks || !room) return

  const usedIds = new Set((existingRounds ?? []).map((r) => r.track_id))
  const nextRound = (room.current_round ?? 0) + 1
  const isFinale = nextRound === room.total_rounds

  const picked = pickNextTrack(allTracks, players, usedIds)
  if (!picked) return

  const ownerTracks = allTracks.filter((t) => t.player_id === picked.owner.id)
  const decoys = pickDecoys({ correctTrack: picked.track, allTracks: ownerTracks })

  await db.from('rounds').insert({
    room_id: roomId,
    round_number: nextRound,
    track_id: picked.track.id,
    owner_id: picked.owner.id,
    is_finale: isFinale,
    decoy_ids: decoys.map((d) => d.id),
  })

  await db.from('rooms').update({ current_round: nextRound }).eq('id', roomId)
}
