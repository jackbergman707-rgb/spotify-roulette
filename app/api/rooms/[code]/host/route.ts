/**
 * POST /api/rooms/[code]/host
 * Host-only actions: replay, skip_player
 * Body: { action: 'replay' | 'skip_player', playerId?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: room } = await db
    .from('sr_rooms')
    .select()
    .eq('code', (await params).code)
    .single()

  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (room.host_id !== session.spotifyId) {
    return NextResponse.json({ error: 'Host only' }, { status: 403 })
  }

  const body = await req.json()
  const { action, playerId } = body

  if (action === 'replay') {
    // Log event — clients subscribed to room_events will trigger replay
    await db.from('sr_room_events').insert({
      room_id: room.id,
      type: 'replay',
      payload: { round: room.current_round },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'skip_player') {
    if (!playerId) {
      return NextResponse.json({ error: 'playerId required' }, { status: 400 })
    }

    const { data: round } = await db
      .from('sr_rounds')
      .select()
      .eq('room_id', room.id)
      .eq('round_number', room.current_round)
      .single()

    if (!round || round.status !== 'playing') {
      return NextResponse.json({ error: 'No active round' }, { status: 409 })
    }

    // Insert a force-locked guess with nulls (0 points)
    const { data: existing } = await db
      .from('sr_guesses')
      .select('id')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .single()

    if (!existing) {
      await db.from('sr_guesses').insert({
        round_id: round.id,
        player_id: playerId,
        guessed_owner_id: null,
        guessed_track_id: null,
        is_force_locked: true,
      })
    }

    // Check if all locked now
    const { data: players } = await db
      .from('sr_players')
      .select()
      .eq('room_id', room.id)
    const { data: guesses } = await db
      .from('sr_guesses')
      .select('player_id')
      .eq('round_id', round.id)

    const { allPlayersLocked } = await import('@/lib/game-engine')
    const guessedIds = new Set((guesses ?? []).map((g) => g.player_id))

    if (players && allPlayersLocked(players, guessedIds)) {
      // Trigger reveal via guess route logic — re-import to avoid circular
      const { default: revealFn } = await import('../guess/reveal')
      await revealFn(db, room.id, round)
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
