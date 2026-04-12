/**
 * POST /api/rooms/[code]/next
 * Host advances from reveal screen to the next round (or finishes game).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { advanceToNextRound } from '@/lib/advance-round'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { code } = await params
  const db = createAdminClient()

  const { data: room } = await db.from('sr_rooms').select().eq('code', code).single()
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (room.host_id !== session.spotifyId) {
    return NextResponse.json({ error: 'Host only' }, { status: 403 })
  }

  const { data: round } = await db
    .from('sr_rounds')
    .select()
    .eq('room_id', room.id)
    .eq('round_number', room.current_round)
    .single()

  if (!round || round.status !== 'revealing') {
    return NextResponse.json({ error: 'Not in reveal phase' }, { status: 409 })
  }

  // Mark round done
  await db.from('sr_rounds').update({ status: 'done' }).eq('id', round.id)

  if (round.round_number >= room.total_rounds) {
    await db.from('sr_rooms').update({ status: 'finished' }).eq('id', room.id)
  } else {
    await advanceToNextRound(db, room.id)
  }

  return NextResponse.json({ ok: true })
}
