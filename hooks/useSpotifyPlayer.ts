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

interface SpotifyDevice {
  id: string
  is_active: boolean
  type: string
  name: string
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * Find a smartphone device from Spotify and transfer playback to it.
 * Returns the device ID or null if no phone found.
 */
async function acquirePhoneDevice(accessToken: string): Promise<string | null> {
  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null

  const data = await res.json()
  const devices = data.devices as SpotifyDevice[]
  const phone = devices.find((d) => d.type === 'Smartphone')
  if (!phone) return null

  // Transfer playback to the phone to wake it up
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [phone.id], play: false }),
  })

  return phone.id
}

/**
 * Attempt to play a track on a device. Returns true on success.
 */
async function tryPlay(
  deviceId: string,
  trackId: string,
  positionMs: number,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: [`spotify:track:${trackId}`],
          position_ms: positionMs,
        }),
      },
    )
    if (res.ok || res.status === 204) return { ok: true }
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err?.error?.message ?? `Error ${res.status}` }
  } catch {
    return { ok: false, error: 'Network error' }
  }
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
    if (!accessToken || !spotifyTrackId) return

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)

    if (mobileRef.current) {
      // Mobile: re-acquire the phone device every time we play
      // This handles the case where the device went idle/asleep
      setError(null)

      let deviceId = deviceIdRef.current

      // First attempt with cached device
      if (deviceId) {
        const result = await tryPlay(deviceId, spotifyTrackId, startOffsetMs, accessToken)
        if (result.ok) {
          setIsPlaying(true)
          stopTimerRef.current = setTimeout(async () => {
            await fetch(
              `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
              { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } },
            ).catch(() => {})
            setIsPlaying(false)
          }, clipDurationMs)
          return
        }
      }

      // Cached device failed or missing — re-discover and retry
      deviceId = await acquirePhoneDevice(accessToken)
      if (!deviceId) {
        setError('Open Spotify on your phone and try again')
        return
      }
      deviceIdRef.current = deviceId

      // Small delay to let the transfer settle
      await new Promise((r) => setTimeout(r, 500))

      const result = await tryPlay(deviceId, spotifyTrackId, startOffsetMs, accessToken)
      if (!result.ok) {
        setError(result.error ?? 'Playback failed — try again')
        return
      }

      setIsPlaying(true)
      stopTimerRef.current = setTimeout(async () => {
        await fetch(
          `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } },
        ).catch(() => {})
        setIsPlaying(false)
      }, clipDurationMs)
    } else {
      // Desktop: play via SDK device (existing flow)
      if (!deviceIdRef.current) return

      try {
        const result = await tryPlay(deviceIdRef.current, spotifyTrackId, startOffsetMs, accessToken)
        if (!result.ok) {
          setError(result.error ?? 'Playback failed')
          return
        }
        setIsPlaying(true)
        setError(null)
        stopTimerRef.current = setTimeout(async () => {
          await playerRef.current?.pause()
          setIsPlaying(false)
        }, clipDurationMs)
      } catch {
        setError('Playback error')
      }
    }
  }, [accessToken, spotifyTrackId, startOffsetMs, clipDurationMs])

  // Setup: desktop SDK or mobile Connect
  useEffect(() => {
    if (!accessToken) return

    const mobile = isMobile()
    mobileRef.current = mobile

    if (mobile) {
      // Mobile: find phone device on mount, but don't block on it
      // The play() function will re-acquire if needed
      let cancelled = false

      async function initialFind() {
        const deviceId = await acquirePhoneDevice(accessToken!)
        if (cancelled) return
        if (deviceId) {
          deviceIdRef.current = deviceId
          setIsReady(true)
          setError(null)
        } else {
          // Still mark as "ready" so the button is tappable —
          // play() will show the error if no device is found at play time
          setIsReady(true)
          setError('Open Spotify on your phone')
        }
      }

      initialFind()

      // Keep polling in background to update status and keep device alive
      const pollInterval = setInterval(async () => {
        if (cancelled) return
        const deviceId = await acquirePhoneDevice(accessToken!)
        if (cancelled) return
        if (deviceId) {
          deviceIdRef.current = deviceId
          setError(null)
        }
      }, 10_000)

      return () => {
        cancelled = true
        clearInterval(pollInterval)
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
