'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Room, Player } from '@/types'

interface Playlist {
  id: string
  name: string
  images: { url: string }[]
  items: { total: number }
}

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = React.use(params)
  const { data: session } = useSession()
  const router = useRouter()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [playlistConfirmed, setPlaylistConfirmed] = useState(false)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [confirmingPlaylist, setConfirmingPlaylist] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const isHost = room?.host_id === session?.spotifyId
  const myPlayer = players.find((p) => p.spotify_id === session?.spotifyId)
  // We repurpose shield_track_id to track playlist selection
  const allPlayersReady = players.length > 0 && players.every((p) => p.shield_track_id !== null)

  const loadData = useCallback(async () => {
    const { data: r } = await supabase.from('sr_rooms').select().eq('code', code).single()
    if (!r) {
      router.push('/')
      return
    }
    if (r.status === 'playing' || r.status === 'finished') {
      router.push(`/room/${code}`)
      return
    }
    setRoom(r)
    const { data: p } = await supabase.from('sr_players').select().eq('room_id', r.id)
    setPlayers(p ?? [])
  }, [code, router])

  useEffect(() => { loadData() }, [loadData])

  // Load playlists once session is ready
  useEffect(() => {
    if (!session?.accessToken) return
    setLoadingPlaylists(true)
    fetch('/api/spotify/playlists')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setPlaylistError(d.error)
        setPlaylists(d.playlists ?? [])
      })
      .catch((e) => setPlaylistError(String(e)))
      .finally(() => setLoadingPlaylists(false))
  }, [session?.accessToken])

  // Check if this player already confirmed a playlist
  useEffect(() => {
    if (myPlayer?.shield_track_id) setPlaylistConfirmed(true)
  }, [myPlayer?.shield_track_id])

  // Realtime
  useEffect(() => {
    if (!room) return
    const channel = supabase
      .channel(`lobby:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sr_players', filter: `room_id=eq.${room.id}` }, loadData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sr_rooms', filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new as Room)
        if ((payload.new as Room).status === 'playing') router.push(`/room/${code}`)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room?.id, code, router, loadData])

  async function handleConfirmPlaylist() {
    if (!selectedPlaylist) return
    setConfirmingPlaylist(true)
    setPlaylistError(null)
    try {
      const res = await fetch(`/api/rooms/${code}/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: selectedPlaylist.id }),
      })
      if (res.ok) {
        setPlaylistConfirmed(true)
        loadData()
      } else {
        const d = await res.json().catch(() => ({}))
        setPlaylistError(d.error ?? `Error ${res.status}`)
      }
    } catch (e) {
      setPlaylistError(String(e))
    }
    setConfirmingPlaylist(false)
  }

  async function handleStart() {
    setStarting(true)
    setStartError(null)
    const res = await fetch(`/api/rooms/${code}/start`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setStartError(d.error ?? `Error ${res.status}`)
    }
    setStarting(false)
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 flex flex-col items-center gap-8">
      {/* Room code */}
      <div className="text-center">
        <p className="text-white/40 text-xs uppercase tracking-widest">Room code</p>
        <h1 className="text-5xl font-black tracking-widest mt-1">{code}</h1>
        <p className="text-white/30 text-sm mt-2">Share this code — no app download needed</p>
      </div>

      {/* Players list */}
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-white/30 mb-3">Players</p>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5">
              {p.avatar_url && <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full" />}
              <span className="font-medium">{p.display_name}</span>
              <span className="ml-auto text-xs">
                {p.shield_track_id
                  ? <span className="text-green-400">Ready ✓</span>
                  : <span className="text-white/30">Choosing…</span>
                }
              </span>
              {p.spotify_id === room?.host_id && (
                <span className="text-xs text-white/20">host</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Playlist picker */}
      <div className="w-full max-w-sm space-y-3">
        {!playlistConfirmed ? (
          <>
            <p className="text-xs uppercase tracking-widest text-white/30">Choose your playlist</p>
            {loadingPlaylists ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
              </div>
            ) : playlistError ? (
              <p className="text-red-400 text-sm py-4 text-center">{playlistError} — try signing out and back in</p>
            ) : playlists.length === 0 ? (
              <p className="text-white/40 text-sm py-4 text-center">No playlists found — sign out and back in to grant playlist access</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => setSelectedPlaylist(pl)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                      selectedPlaylist?.id === pl.id
                        ? 'bg-green-500/20 border-green-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10',
                    ].join(' ')}
                  >
                    {pl.images?.[0] && (
                      <img src={pl.images[0].url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{pl.name}</p>
                      <p className="text-white/40 text-xs">{pl.items?.total ?? 0} tracks</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleConfirmPlaylist}
              disabled={!selectedPlaylist || confirmingPlaylist}
              className="w-full py-3 bg-green-500 text-black font-semibold rounded-xl hover:bg-green-400 disabled:opacity-40 transition-colors"
            >
              {confirmingPlaylist ? 'Loading tracks…' : selectedPlaylist ? `Use "${selectedPlaylist.name}"` : 'Select a playlist'}
            </button>
          </>
        ) : (
          <div className="text-center py-4 space-y-1">
            <p className="text-green-400 font-semibold">Playlist ready ✓</p>
            <p className="text-white/40 text-sm">Waiting for everyone to pick…</p>
          </div>
        )}
      </div>

      {/* Host start button */}
      {isHost && (
        <div className="w-full max-w-sm space-y-2">
          {startError && (
            <p className="text-red-400 text-sm text-center">{startError}</p>
          )}
          <button
            onClick={handleStart}
            disabled={starting || !allPlayersReady}
            className="w-full py-4 bg-green-500 text-black font-semibold rounded-xl hover:bg-green-400 disabled:opacity-40 transition-colors"
          >
            {starting
              ? 'Starting…'
              : !allPlayersReady
              ? 'Waiting for all players to pick a playlist…'
              : 'Start game'}
          </button>
        </div>
      )}

      {!isHost && allPlayersReady && (
        <p className="text-white/40 text-sm">Waiting for host to start…</p>
      )}
    </main>
  )
}
