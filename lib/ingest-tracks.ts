import { createAdminClient } from '@/lib/supabase'
import { getUserLibraryTracks, getArtistGenres, computeStartOffset } from '@/lib/spotify'

export async function ingestPlayerTracks(
  db: ReturnType<typeof createAdminClient>,
  roomId: string,
  playerId: string,
  accessToken: string,
) {
  const tracks = await getUserLibraryTracks(accessToken, 60)

  const rows = await Promise.all(
    tracks.map(async (t) => {
      const genres = t.artists[0]
        ? await getArtistGenres(t.artists[0].id, accessToken)
        : []
      const releaseYear = t.album.release_date
        ? parseInt(t.album.release_date.slice(0, 4), 10)
        : null
      return {
        room_id: roomId,
        player_id: playerId,
        spotify_track_id: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album.name,
        genre: genres,
        release_year: releaseYear,
        preview_url: t.preview_url,
        start_offset_ms: computeStartOffset(t.duration_ms),
      }
    }),
  )

  await db.from('sr_tracks').upsert(rows, { onConflict: 'room_id,spotify_track_id' })
}
