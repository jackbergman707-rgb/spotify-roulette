/**
 * POST /api/rooms/[code]/guess
 * Player locks in their two-part guess.
 * Body: { ownerId: string, trackId: string }
 *
 * When all players have guessed, auto-reveals the round.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { calculatePoints, allPlayersLocked } from '@/lib/game-engine'
import { advanceToNextRound } from '@/lib/advance-round'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ownerId, trackId } = await req.json()

  const db = createAdminClient()

  const { data: room } = await db
    .from('rooms')
    .select()
    .eq('code', (await params).code)
    .single()

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Game not in progress' }, { status: 409 })
  }

  const { data: round } = await db
    .from('rounds')
    .select()
    .eq('room_id', room.id)
    .eq('round_number', room.current_round)
    .single()

  if (!round || round.status !== 'playing') {
    return NextResponse.json({ error: 'Round not active' }, { status: 409 })
  }

  const { data: player } = await db
    .from('players')
    .select()
    .eq('room_id', room.id)
    .eq('spotify_id', session.spotifyId)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in room' }, { status: 403 })

  // Idempotent — ignore if already locked
  const { data: existing } = await db
    .from('guesses')
    .select()
    .eq('round_id', round.id)
    .eq('player_id', player.id)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, alreadyLocked: true })
  }

  // Validate that ownerId and trackId are valid choices for this round
  const { data: validOwner } = await db
    .from('players')
    .select('id')
    .eq('room_id', room.id)
    .eq('id', ownerId)
    .single()

  const validTrackIds = [round.track_id, ...(round.decoy_ids ?? [])]
  if (!validOwner || !validTrackIds.includes(trackId)) {
    return NextResponse.json({ error: 'Invalid guess' }, { status: 400 })
  }

  await db.from('guesses').insert({
    round_id: round.id,
    player_id: player.id,
    guessed_owner_id: ownerId,
    guessed_track_id: trackId,
  })

  // Check if all connected players have locked in
  const { data: players } = await db
    .from('players')
    .select()
    .eq('room_id', room.id)

  const { data: guesses } = await db
    .from('guesses')
    .select('player_id')
    .eq('round_id', round.id)

  const guessedIds = new Set((guesses ?? []).map((g) => g.player_id))

  if (players && allPlayersLocked(players, guessedIds)) {
    await revealRound(db, room.id, round)
  }

  return NextResponse.json({ ok: true })
}

async function revealRound(
  db: ReturnType<typeof createAdminClient>,
  roomId: string,
  round: { id: string; round_number: number; track_id: string; owner_id: string; is_finale: boolean },
) {
  // Mark round as revealing
  await db
    .from('rounds')
    .update({ status: 'revealing', revealed_at: new Date().toISOString() })
    .eq('id', round.id)

  if (!round.is_finale) {
    // Award points for all guesses
    const { data: guesses } = await db
      .from('guesses')
      .select()
      .eq('round_id', round.id)

    if (guesses) {
      await Promise.all(
        guesses.map(async (guess) => {
          const { total } = calculatePoints(guess, {
            owner_id: round.owner_id,
            track_id: round.track_id,
            id: round.id,
          } as Parameters<typeof calculatePoints>[1])
          if (total > 0) {
            const { data: p } = await db.from('players').select('score').eq('id', guess.player_id).single()
            await db.from('players').update({ score: (p?.score ?? 0) + total }).eq('id', guess.player_id)
          }
        }),
      )
    }
  }

  // After a delay (handled client-side), host can advance.
  // Mark round done
  await db.from('rounds').update({ status: 'done' }).eq('id', round.id)

  const { data: room } = await db.from('rooms').select().eq('id', roomId).single()
  if (!room) return

  if (round.round_number >= room.total_rounds) {
    await db.from('rooms').update({ status: 'finished' }).eq('id', roomId)
  } else {
    await advanceToNextRound(db, roomId)
  }
}
