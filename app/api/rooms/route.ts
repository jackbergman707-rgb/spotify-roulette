import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { generateRoomCode } from '@/lib/game-engine'
import { ingestPlayerTracks } from '@/lib/ingest-tracks'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const totalRounds: number = Math.min(Math.max(body.totalRounds ?? 7, 3), 15)
  const displayName: string = body.displayName?.trim() || session.user?.name || 'Host'

  const db = createAdminClient()

  let code = generateRoomCode()
  let attempts = 0
  while (attempts < 10) {
    const { data } = await db.from('rooms').select('id').eq('code', code).single()
    if (!data) break
    code = generateRoomCode()
    attempts++
  }

  const { data: room, error: roomErr } = await db
    .from('rooms')
    .insert({ code, host_id: session.spotifyId, total_rounds: totalRounds })
    .select()
    .single()

  if (roomErr || !room) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }

  const { data: player, error: playerErr } = await db
    .from('players')
    .insert({
      room_id: room.id,
      spotify_id: session.spotifyId,
      display_name: displayName,
      avatar_url: session.user?.image ?? null,
    })
    .select()
    .single()

  if (playerErr || !player) {
    await db.from('rooms').delete().eq('id', room.id)
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  return NextResponse.json({ roomCode: code, roomId: room.id, playerId: player.id })
}
