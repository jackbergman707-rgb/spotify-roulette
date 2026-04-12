'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume: number
      }) => SpotifyPlayer
    }
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>
  disconnect: () => void
  addListener: (event: string, cb: (data: unknown) => void) => void
  removeListener: (event: string) => void
  getCurrentState: () => Promise<unknown>
  pause: () => Promise<void>
  resume: () => Promise<void>
}

interface UseSpotifyPlayerOptions {
  accessToken: string | undefined
  spotifyTrackId: string | null
  startOffsetMs: number
  clipDurationMs?: number
  replaySignal: number
}

export function useSpotifyPlayer({
  accessToken,
  spotifyTrackId,
  startOffsetMs,
  clipDurationMs = 12_000,
  replaySignal,
}: UseSpotifyPlayerOptions) {
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const play = useCallback(async () => {
    console.log('[SpotifyPlayer] play() called', { accessToken: !!accessToken, spotifyTrackId, deviceId: deviceIdRef.current })
    if (!accessToken || !spotifyTrackId || !deviceIdRef.current) {
      console.warn('[SpotifyPlayer] play() aborted — missing:', { accessToken: !!accessToken, spotifyTrackId, deviceId: deviceIdRef.current })
      return
    }

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)

    try {
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uris: [`spotify:track:${spotifyTrackId}`],
            position_ms: startOffsetMs,
          }),
        },
      )
      console.log('[SpotifyPlayer] play response:', res.status)
      if (!res.ok && res.status !== 204) {
        const err = await res.json()
        console.error('[SpotifyPlayer] play error:', err)
        setError(err?.error?.message ?? 'Playback failed')
        return
      }
      setIsPlaying(true)
      setError(null)
      stopTimerRef.current = setTimeout(async () => {
        await playerRef.current?.pause()
        setIsPlaying(false)
      }, clipDurationMs)
    } catch (e) {
      setError('Playback error')
    }
  }, [accessToken, spotifyTrackId, startOffsetMs, clipDurationMs])

  // Load SDK script once
  useEffect(() => {
    if (!accessToken) return

    const setup = () => {
      const player = new window.Spotify.Player({
        name: 'Spotify Roulette',
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.8,
      })

      player.addListener('ready', async (data) => {
        const { device_id } = data as { device_id: string }
        console.log('[SpotifyPlayer] device ready:', device_id)
        deviceIdRef.current = device_id
        // Transfer playback to this device so commands aren't restricted
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [device_id], play: false }),
        })
        setIsReady(true)
      })

      player.addListener('not_ready', () => {
        setIsReady(false)
      })

      player.addListener('initialization_error', (data) => {
        setError(`Init error: ${(data as { message: string }).message}`)
      })

      player.addListener('authentication_error', (data) => {
        setError(`Auth error: ${(data as { message: string }).message}`)
      })

      player.addListener('account_error', (data) => {
        setError(`Account error: ${(data as { message: string }).message} — Spotify Premium required`)
      })

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) {
      setup()
    } else if (!document.getElementById('spotify-sdk')) {
      window.onSpotifyWebPlaybackSDKReady = setup
      const script = document.createElement('script')
      script.id = 'spotify-sdk'
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    } else {
      window.onSpotifyWebPlaybackSDKReady = setup
    }

    return () => {
      playerRef.current?.disconnect()
    }
  }, [accessToken])

  // Replay signal
  useEffect(() => {
    if (replaySignal > 0 && isReady) play()
  }, [replaySignal, isReady, play])

  return { play, isPlaying, isReady, error }
}
