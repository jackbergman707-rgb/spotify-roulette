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

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
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
  const mobileRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const play = useCallback(async () => {
    if (!accessToken || !spotifyTrackId || !deviceIdRef.current) return

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
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        setError(err?.error?.message ?? 'Playback failed')
        return
      }
      setIsPlaying(true)
      setError(null)

      // Auto-stop after clip duration
      stopTimerRef.current = setTimeout(async () => {
        if (mobileRef.current && deviceIdRef.current) {
          // Mobile: pause via Connect API
          await fetch(
            `https://api.spotify.com/v1/me/player/pause?device_id=${deviceIdRef.current}`,
            {
              method: 'PUT',
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          ).catch(() => {})
        } else {
          // Desktop: pause via SDK
          await playerRef.current?.pause()
        }
        setIsPlaying(false)
      }, clipDurationMs)
    } catch {
      setError('Playback error')
    }
  }, [accessToken, spotifyTrackId, startOffsetMs, clipDurationMs])

  // Setup: desktop SDK or mobile Connect
  useEffect(() => {
    if (!accessToken) return

    const mobile = isMobile()
    mobileRef.current = mobile

    if (mobile) {
      // Mobile: find an active Spotify device
      let cancelled = false
      let pollInterval: ReturnType<typeof setInterval> | null = null

      async function findDevice() {
        try {
          const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (!res.ok) return
          const data = await res.json()
          const devices = data.devices as { id: string; is_active: boolean; type: string; name: string }[]

          // On mobile: ONLY use a smartphone device so audio plays from the phone
          const phone = devices.find((d) => d.type === 'Smartphone')

          if (phone && !cancelled) {
            deviceIdRef.current = phone.id

            // Transfer playback to the phone so it becomes the active device
            await fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ device_ids: [phone.id], play: false }),
            })

            setIsReady(true)
            setError(null)
            if (pollInterval) clearInterval(pollInterval)
          } else if (!cancelled) {
            setError('Open Spotify on your phone first')
            setIsReady(false)
          }
        } catch {
          if (!cancelled) setError('Could not reach Spotify')
        }
      }

      // Poll for devices every 3 seconds until one is found
      findDevice()
      pollInterval = setInterval(() => {
        if (!deviceIdRef.current) findDevice()
      }, 3000)

      return () => {
        cancelled = true
        if (pollInterval) clearInterval(pollInterval)
      }
    } else {
      // Desktop: Web Playback SDK
      const setup = () => {
        const player = new window.Spotify.Player({
          name: 'Spotify Roulette',
          getOAuthToken: (cb) => cb(accessToken),
          volume: 0.8,
        })

        player.addListener('ready', async (data) => {
          const { device_id } = data as { device_id: string }
          deviceIdRef.current = device_id
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

        player.addListener('not_ready', () => setIsReady(false))

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
    }
  }, [accessToken])

  // Replay signal
  useEffect(() => {
    if (replaySignal > 0 && isReady) play()
  }, [replaySignal, isReady, play])

  return { play, isPlaying, isReady, error, isMobileDevice: mobileRef.current }
}
