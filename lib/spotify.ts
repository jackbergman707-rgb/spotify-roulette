/**
 * Thin wrapper around the Spotify Web API.
 * All calls use the user's OAuth access token from NextAuth.
 */

const BASE = 'https://api.spotify.com/v1'

async function spotifyFetch<T>(
  path: string,
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Spotify API ${res.status}: ${err}`)
  }
  return res.json()
}

export interface SpotifyPlaylist {
  id: string
  name: string
  images: { url: string }[]
  items: { total: number }
}

export async function getUserPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const all: SpotifyPlaylist[] = []
  let offset = 0
  while (offset < 200) {
    const data = await spotifyFetch<{ items: SpotifyPlaylist[]; total: number }>(
      `/me/playlists?limit=50&offset=${offset}`,
      accessToken,
    )
    all.push(...data.items.filter((p) => p != null))
    if (data.items.length < 50) break
    offset += 50
  }
  return all
}

export async function getPlaylistTracks(
  playlistId: string,
  accessToken: string,
  sampleSize = 60,
): Promise<SpotifyTrack[]> {
  const all: SpotifyTrack[] = []
  let offset = 0
  while (offset < 500) {
    const data = await spotifyFetch<{ items: Record<string, unknown>[]; total: number }>(
      `/playlists/${playlistId}/items?limit=50&offset=${offset}`,
      accessToken,
    )
    console.log(`[spotify] /items offset=${offset} → ${data.items.length} items total=${data.total}`)
    if (offset === 0 && data.items.length > 0) {
      const sample = data.items.slice(0, 2)
      console.log('[spotify] sample items:', JSON.stringify(sample).slice(0, 800))
    }
    const valid = data.items
      .filter((i): i is NonNullable<typeof i> => i != null)
      .map((i) => (i as Record<string, unknown>).item ?? (i as Record<string, unknown>).track)
      .filter((t): t is SpotifyTrack => t != null && typeof t === 'object' && 'id' in (t as object) && !!(t as SpotifyTrack).id)
    console.log(`[spotify] valid tracks after filter: ${valid.length}`)
    all.push(...valid)
    if (data.items.length < 50 || all.length >= sampleSize * 2) break
    offset += 50
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, sampleSize)
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string; id: string }[]
  album: { name: string; release_date: string }
  preview_url: string | null
  duration_ms: number
}

interface SavedTrackItem {
  track: SpotifyTrack
}

/**
 * Fetch up to `limit` saved tracks from the user's library.
 * Filters out tracks with no preview URL (can't be played).
 * Returns a random sample of `sampleSize` tracks.
 */
export async function getUserLibraryTracks(
  accessToken: string,
  sampleSize = 50,
): Promise<SpotifyTrack[]> {
  const allTracks: SpotifyTrack[] = []
  let offset = 0
  const pageSize = 50
  // Fetch up to 500 tracks then sample — avoids massive API calls
  const maxFetch = 500

  while (offset < maxFetch) {
    const data = await spotifyFetch<{ items: SavedTrackItem[]; total: number }>(
      `/me/tracks?limit=${pageSize}&offset=${offset}`,
      accessToken,
    )
    const valid = data.items
      .map((i) => i.track)
    allTracks.push(...valid)
    if (data.items.length < pageSize || allTracks.length >= maxFetch) break
    offset += pageSize
  }

  // Fisher-Yates shuffle then take sampleSize
  for (let i = allTracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allTracks[i], allTracks[j]] = [allTracks[j], allTracks[i]]
  }
  return allTracks.slice(0, sampleSize)
}

export interface AudioFeatures {
  energy: number
  loudness: number
  tempo: number
}

/**
 * Get audio features for a batch of track IDs.
 * Used to find the "most recognisable" segment of a track.
 */
export async function getAudioFeatures(
  trackIds: string[],
  accessToken: string,
): Promise<Record<string, AudioFeatures>> {
  if (trackIds.length === 0) return {}
  const ids = trackIds.slice(0, 100).join(',')
  const data = await spotifyFetch<{ audio_features: (AudioFeatures & { id: string })[] }>(
    `/audio-features?ids=${ids}`,
    accessToken,
  )
  return Object.fromEntries(data.audio_features.map((f) => [f.id, f]))
}

/**
 * Get artist genres for enriching track data.
 */
export async function getArtistGenres(
  artistId: string,
  accessToken: string,
): Promise<string[]> {
  try {
    const data = await spotifyFetch<{ genres: string[] }>(
      `/artists/${artistId}`,
      accessToken,
    )
    return data.genres
  } catch {
    return []
  }
}

/**
 * Compute a good start offset for the clip.
 * Strategy: use the 30s Spotify preview (which Spotify already picks from
 * the most recognisable part). We add a small random jitter of 0-5s so
 * repeating a room doesn't always sound identical.
 * If we have audio analysis we could be smarter, but preview_url is enough.
 */
export function computeStartOffset(durationMs: number): number {
  // Spotify previews are already from the "hook" — start at 0 with small jitter
  const jitter = Math.floor(Math.random() * 5000)
  return Math.min(jitter, Math.max(0, durationMs - 15000))
}
