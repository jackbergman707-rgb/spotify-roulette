/**
 * POST /api/rooms/[code]/playlist
 * Player selects a playlist — ingests its tracks into the room pool.
 * Body: { playlistId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getPlaylistTracks, computeStartOffset } from '@/lib/spotify'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.spotifyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { playlistId } = await req.json()
  if (!playlistId) return NextResponse.json({ error: 'playlistId required' }, { status: 400 })

  const { code } = await params
  const db = createAdminClient()

  const { data: room } = await db.from('rooms').select().eq('code', code).single()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  const { data: player } = await db
    .from('players')
    .select()
    .eq('room_id', room.id)
    .eq('spotify_id', session.spotifyId)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in room' }, { status: 403 })

  // Delete existing tracks for this player in this room (re-pick)
  await db.from('tracks').delete().eq('room_id', room.id).eq('player_id', player.id)

  let tracks
  try {
    tracks = await getPlaylistTracks(playlistId, session.accessToken as string, 60)
  } catch (e) {
    console.error('getPlaylistTracks failed:', e)
    return NextResponse.json({ error: `Spotify fetch failed: ${(e as Error).message}` }, { status: 500 })
  }

  console.log(`getPlaylistTracks returned ${tracks.length} tracks for playlist ${playlistId}`)

  if (tracks.length === 0) {
    return NextResponse.json({ error: 'No playable tracks found in that playlist (it may contain only local files or podcast episodes)' }, { status: 400 })
  }

  const rows = tracks.map((t) => {
    const releaseYear = t.album?.release_date
      ? parseInt(t.album.release_date.slice(0, 4), 10)
      : null
    return {
      room_id: room.id,
      player_id: player.id,
      spotify_track_id: t.id,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') ?? 'Unknown',
      album: t.album?.name ?? '',
      genre: [],
      release_year: releaseYear,
      preview_url: t.preview_url ?? null,
      start_offset_ms: computeStartOffset(t.duration_ms ?? 180000),
    }
  })

  const { error: upsertError } = await db.from('tracks').upsert(rows, { onConflict: 'room_id,spotify_track_id' })
  if (upsertError) {
    console.error('tracks upsert failed:', upsertError)
    return NextResponse.json({ error: `DB error: ${upsertError.message}` }, { status: 500 })
  }

  const { error: playerError } = await db.from('players').update({ shield_track_id: `playlist:${playlistId}` }).eq('id', player.id)
  if (playerError) {
    console.error('player update failed:', playerError)
    return NextResponse.json({ error: `Player update failed: ${playerError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, trackCount: rows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('playlist route unhandled error:', e)
    return NextResponse.json({ error: `Unhandled: ${msg}` }, { status: 500 })
  }
}
