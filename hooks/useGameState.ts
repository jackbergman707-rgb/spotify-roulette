'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Room, Player, Round, Track, Guess, RoomEvent } from '@/types'

export interface GameState {
  room: Room | null
  players: Player[]
  currentRound: Round | null
  roundTrack: Track | null
  roundDecoys: Track[]
  guesses: Guess[]
  myGuess: Guess | null
  replaySignal: number   // increments on each replay event — AudioPlayer watches this
  isLoading: boolean
}

export function useGameState(roomCode: string, mySpotifyId: string | null) {
  const [state, setState] = useState<GameState>({
    room: null,
    players: [],
    currentRound: null,
    roundTrack: null,
    roundDecoys: [],
    guesses: [],
    myGuess: null,
    replaySignal: 0,
    isLoading: true,
  })
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadRoom = useCallback(async (attempt = 0) => {
    const { data: room } = await supabase
      .from('rooms')
      .select()
      .eq('code', roomCode)
      .single()

    if (!room) return

    // If room is playing but no round yet (server still creating it), retry a few times
    if (room.status === 'playing' && (room.current_round ?? 0) === 0 && attempt < 5) {
      setTimeout(() => loadRoom(attempt + 1), 800)
      return
    }

    const [{ data: players }, { data: rounds }] = await Promise.all([
      supabase.from('players').select().eq('room_id', room.id),
      supabase
        .from('rounds')
        .select()
        .eq('room_id', room.id)
        .eq('round_number', room.current_round)
        .single(),
    ])

    const round = rounds ?? null
    let roundTrack: Track | null = null
    let roundDecoys: Track[] = []
    let guesses: Guess[] = []

    if (round) {
      const trackIds = [round.track_id, ...(round.decoy_ids ?? [])]
      const [{ data: tracks }, { data: g }] = await Promise.all([
        supabase.from('tracks').select().in('id', trackIds),
        supabase.from('guesses').select().eq('round_id', round.id),
      ])
      roundTrack = tracks?.find((t) => t.id === round.track_id) ?? null
      roundDecoys = (tracks ?? []).filter((t) => round.decoy_ids?.includes(t.id))
      guesses = g ?? []
    }

    const myPlayer = mySpotifyId
      ? (players ?? []).find((p) => p.spotify_id === mySpotifyId)
      : null
    const myGuess = myPlayer
      ? (guesses.find((g) => g.player_id === myPlayer.id) ?? null)
      : null

    setState({
      room,
      players: players ?? [],
      currentRound: round,
      roundTrack,
      roundDecoys,
      guesses,
      myGuess,
      replaySignal: 0,
      isLoading: false,
    })
  }, [roomCode, mySpotifyId])

  useEffect(() => {
    loadRoom()
  }, [loadRoom])

  useEffect(() => {
    if (!state.room) return

    const roomId = state.room.id
    const channel = supabase
      .channel(`room:${roomId}`)
      // Room status changes
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setState((prev) => ({ ...prev, room: payload.new as Room }))
          // New round started — reload full state
          if ((payload.new as Room).current_round !== (payload.old as Room).current_round) {
            loadRoom()
          }
        },
      )
      // Player joins / updates
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          supabase
            .from('players')
            .select()
            .eq('room_id', roomId)
            .then(({ data }) => {
              if (data) setState((prev) => ({ ...prev, players: data }))
            })
        },
      )
      // New guess locked in
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guesses' },
        (payload) => {
          const guess = payload.new as Guess
          setState((prev) => {
            if (prev.currentRound?.id !== guess.round_id) return prev
            const guesses = [...prev.guesses.filter((g) => g.id !== guess.id), guess]
            const myPlayer = mySpotifyId
              ? prev.players.find((p) => p.spotify_id === mySpotifyId)
              : null
            const myGuess =
              myPlayer && guess.player_id === myPlayer.id ? guess : prev.myGuess
            return { ...prev, guesses, myGuess }
          })
        },
      )
      // Round status change (playing → revealing → done)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setState((prev) => {
            if (prev.currentRound?.id !== payload.new.id) return prev
            return { ...prev, currentRound: payload.new as Round }
          })
        },
      )
      // Host events (replay, skip)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_events', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const evt = payload.new as RoomEvent
          if (evt.type === 'replay') {
            setState((prev) => ({ ...prev, replaySignal: prev.replaySignal + 1 }))
          }
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
    }
  }, [state.room?.id, mySpotifyId, loadRoom])

  return state
}
