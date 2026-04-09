import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ingestPlayerTracks } from '@/lib/ingest-tracks'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { code, displayName } = await req.json()
  if (!code) return NextResponse.json({ error: 'Room code required' }, { status: 400 })

  const db = createAdminClient()

  const { data: room } = await db
    .from('rooms')
    .select()
    .eq('code', code.toUpperCase())
    .single()

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  // Upsert player (handles reconnects)
  const { data: player, error } = await db
    .from('players')
    .upsert(
      {
        room_id: room.id,
        spotify_id: session.spotifyId,
        display_name: displayName?.trim() || session.user?.name || 'Player',
        avatar_url: session.user?.image ?? null,
        is_connected: true,
      },
      { onConflict: 'room_id,spotify_id' },
    )
    .select()
    .single()

  if (error || !player) {
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 })
  }

  return NextResponse.json({ roomId: room.id, playerId: player.id })
}
