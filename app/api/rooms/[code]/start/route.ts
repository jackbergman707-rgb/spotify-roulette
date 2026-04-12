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
    return NextResponse.json({ error: 'Only the host can start' }, { status: 403 })
  }
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'Already started' }, { status: 409 })
  }

  const { data: players } = await db.from('sr_players').select().eq('room_id', room.id)
  if (!players || players.length < 1) {
    return NextResponse.json({ error: 'Need at least 1 player' }, { status: 400 })
  }

  // Ensure all players have tracks loaded
  const { data: tracks } = await db.from('sr_tracks').select('id, player_id').eq('room_id', room.id)
  if (!tracks || tracks.length === 0) {
    return NextResponse.json({ error: 'No tracks found — make sure all players have confirmed their playlist' }, { status: 400 })
  }

  await db.from('sr_rooms').update({ status: 'playing' }).eq('id', room.id)

  try {
    await advanceToNextRound(db, room.id)
  } catch (e) {
    // Revert room status if round creation failed
    await db.from('sr_rooms').update({ status: 'lobby' }).eq('id', room.id)
    const msg = e instanceof Error ? e.message : String(e)
    console.error('advanceToNextRound failed:', e)
    return NextResponse.json({ error: `Failed to create first round: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
