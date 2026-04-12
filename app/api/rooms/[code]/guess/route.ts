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
import { allPlayersLocked } from '@/lib/game-engine'
import revealRound from './reveal'

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
    .from('sr_rooms')
    .select()
    .eq('code', (await params).code)
    .single()

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Game not in progress' }, { status: 409 })
  }

  const { data: round } = await db
    .from('sr_rounds')
    .select()
    .eq('room_id', room.id)
    .eq('round_number', room.current_round)
    .single()

  if (!round || round.status !== 'playing') {
    return NextResponse.json({ error: 'Round not active' }, { status: 409 })
  }

  const { data: player } = await db
    .from('sr_players')
    .select()
    .eq('room_id', room.id)
    .eq('spotify_id', session.spotifyId)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in room' }, { status: 403 })

  // Idempotent — ignore if already locked
  const { data: existing } = await db
    .from('sr_guesses')
    .select()
    .eq('round_id', round.id)
    .eq('player_id', player.id)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, alreadyLocked: true })
  }

  // Validate that ownerId and trackId are valid choices for this round
  const { data: validOwner } = await db
    .from('sr_players')
    .select('id')
    .eq('room_id', room.id)
    .eq('id', ownerId)
    .single()

  const validTrackIds = [round.track_id, ...(round.decoy_ids ?? [])]
  if (!validOwner || !validTrackIds.includes(trackId)) {
    return NextResponse.json({ error: 'Invalid guess' }, { status: 400 })
  }

  await db.from('sr_guesses').insert({
    round_id: round.id,
    player_id: player.id,
    guessed_owner_id: ownerId,
    guessed_track_id: trackId,
  })

  // Check if all connected players have locked in
  const { data: players } = await db
    .from('sr_players')
    .select()
    .eq('room_id', room.id)

  const { data: guesses } = await db
    .from('sr_guesses')
    .select('player_id')
    .eq('round_id', round.id)

  const guessedIds = new Set((guesses ?? []).map((g) => g.player_id))

  if (players && allPlayersLocked(players, guessedIds)) {
    await revealRound(db, room.id, round)
  }

  return NextResponse.json({ ok: true })
}
