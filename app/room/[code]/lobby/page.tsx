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

  useEffect(() => {
    if (myPlayer?.shield_track_id) setPlaylistConfirmed(true)
  }, [myPlayer?.shield_track_id])

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
    <main className="min-h-screen bg-night text-white flex flex-col">
      {/* Room code header */}
      <div className="pt-16 pb-8 px-8 text-center">
        <p className="text-gray-500 text-xs font-black uppercase tracking-[0.2em] mb-2">Room Code</p>
        <h2 className="text-white text-5xl font-black tracking-[0.2em] uppercase glow-text">{code}</h2>
        <p className="text-spotify text-[10px] font-bold uppercase tracking-widest mt-3">
          Share this code with your crew
        </p>
      </div>

      {/* Main scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 space-y-8 pb-32">
        {/* Players */}
        <div className="space-y-4">
          <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-widest ml-2">Players</h3>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <div
                key={p.id}
                className={[
                  'flex items-center gap-2 p-1.5 pr-4 rounded-full border',
                  p.spotify_id === room?.host_id
                    ? 'bg-card border-spotify/30'
                    : 'bg-card border-white/5',
                ].join(' ')}
              >
                {p.avatar_url && (
                  <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                )}
                {!p.avatar_url && (
                  <div className="w-8 h-8 rounded-full bg-white/10" />
                )}
                <span className={p.shield_track_id ? 'text-white font-bold text-xs' : 'text-gray-400 font-bold text-xs'}>
                  {p.display_name}
                </span>
                {p.spotify_id === room?.host_id && (
                  <span className="text-spotify text-[10px] font-black">HOST</span>
                )}
                {p.shield_track_id ? (
                  <span className="text-spotify text-[10px]">&#10003;</span>
                ) : (
                  <span className="text-gray-600 text-xs animate-spin inline-block">&#9696;</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Playlist picker */}
        <div className="space-y-4">
          {!playlistConfirmed ? (
            <>
              <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-widest ml-2">
                Stake a Playlist
              </h3>
              {loadingPlaylists ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 rounded-full border-2 border-spotify border-t-transparent animate-spin" />
                </div>
              ) : playlistError ? (
                <p className="text-red-400 text-sm py-4 text-center font-bold">{playlistError}</p>
              ) : playlists.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No playlists found</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => setSelectedPlaylist(pl)}
                      className={[
                        'w-full flex items-center gap-4 p-3 rounded-2xl border transition-all text-left',
                        selectedPlaylist?.id === pl.id
                          ? 'bg-card-alt border-2 border-spotify shadow-[0_0_15px_rgba(29,185,84,0.2)]'
                          : 'bg-card-alt border border-white/5 opacity-60 hover:opacity-100',
                      ].join(' ')}
                    >
                      {pl.images?.[0] && (
                        <img src={pl.images[0].url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-bold truncate">{pl.name}</h4>
                        <p className="text-gray-500 text-xs">{pl.items?.total ?? 0} tracks</p>
                      </div>
                      {selectedPlaylist?.id === pl.id && (
                        <span className="text-spotify text-2xl">&#10003;</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleConfirmPlaylist}
                disabled={!selectedPlaylist || confirmingPlaylist}
                className="w-full py-5 bg-spotify text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase disabled:opacity-40 shadow-[0_0_30px_rgba(29,185,84,0.3)]"
              >
                {confirmingPlaylist ? 'Loading tracks...' : selectedPlaylist ? `Use "${selectedPlaylist.name}"` : 'Select a playlist'}
              </button>
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <p className="text-spotify font-black text-xl uppercase">Playlist Ready</p>
              <p className="text-gray-500 text-sm font-bold">Waiting for everyone to pick...</p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed footer */}
      {isHost && (
        <div className="fixed bottom-0 left-0 right-0 p-8 bg-night border-t border-white/5 z-20 text-center">
          {startError && (
            <p className="text-red-400 text-sm text-center mb-4 font-bold">{startError}</p>
          )}
          {!allPlayersReady && (
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-4">
              Waiting for all players to pick...
            </p>
          )}
          <button
            onClick={handleStart}
            disabled={starting || !allPlayersReady}
            className={[
              'w-full py-5 font-black text-xl rounded-2xl uppercase transition-all',
              allPlayersReady
                ? 'bg-spotify text-black active:scale-95 shadow-[0_0_30px_rgba(29,185,84,0.3)]'
                : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {starting ? 'Starting...' : 'Start Game'}
          </button>
        </div>
      )}

      {!isHost && allPlayersReady && (
        <div className="fixed bottom-0 left-0 right-0 p-8 bg-night border-t border-white/5 z-20 text-center">
          <p className="text-gray-500 text-sm font-bold">Waiting for host to start...</p>
        </div>
      )}
    </main>
  )
}
