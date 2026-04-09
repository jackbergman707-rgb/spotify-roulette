export type RoomStatus = 'lobby' | 'shield_pick' | 'playing' | 'finished'
export type RoundStatus = 'playing' | 'revealing' | 'done'

export interface Room {
  id: string
  code: string
  host_id: string
  status: RoomStatus
  total_rounds: number
  current_round: number
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  spotify_id: string
  display_name: string
  avatar_url: string | null
  score: number
  shield_track_id: string | null
  shield_used: boolean
  is_connected: boolean
}

export interface Track {
  id: string
  room_id: string
  player_id: string
  spotify_track_id: string
  title: string
  artist: string
  album: string | null
  genre: string[]
  release_year: number | null
  preview_url: string | null
  start_offset_ms: number
}

export interface Round {
  id: string
  room_id: string
  round_number: number
  track_id: string
  owner_id: string
  is_finale: boolean
  status: RoundStatus
  decoy_ids: string[]
  started_at: string
  revealed_at: string | null
}

export interface Guess {
  id: string
  round_id: string
  player_id: string
  guessed_owner_id: string | null
  guessed_track_id: string | null
  is_force_locked: boolean
  locked_at: string
}

export interface RoomEvent {
  id: string
  room_id: string
  type: 'replay' | 'skip_player' | 'shield_notice'
  payload: Record<string, unknown>
  created_at: string
}

// Enriched types used client-side
export interface RoundWithDetails extends Round {
  track: Track
  owner: Player
  decoys: Track[]
}

export interface ScoreEntry {
  player: Player
  score: number
  owner_correct: number
  song_correct: number
}
