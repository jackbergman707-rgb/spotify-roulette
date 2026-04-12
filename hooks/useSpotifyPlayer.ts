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

async function acquirePhoneDevice(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null

    const data = await res.json()
    const devices = data.devices as SpotifyDevice[]
    const phone = devices.find((d) => d.type === 'Smartphone')
    if (!phone) return null

    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [phone.id], play: false }),
    })

    return phone.id
  } catch {
    return null
  }
}

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

/**
 * Poll Spotify's player state until playback is confirmed active.
 * Returns the actual progress_ms when playback started, or null on timeout.
 */
async function waitForPlaybackStarted(
  accessToken: string,
  timeoutMs = 5000,
): Promise<number | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const state = await res.json()
        if (state.is_playing && state.progress_ms > 0) {
          return state.progress_ms
        }
      }
    } catch {
      // ignore polling errors
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
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
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mobileRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsSpotifyOpen, setNeedsSpotifyOpen] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  function clearTimers() {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
  }

  const play = useCallback(async () => {
    if (!accessToken || !spotifyTrackId) return

    clearTimers()

    if (mobileRef.current) {
      setError(null)

      // Re-acquire device each time to handle idle/sleep
      let deviceId = await acquirePhoneDevice(accessToken)

      if (!deviceId && deviceIdRef.current) {
        deviceId = deviceIdRef.current
      }

      if (!deviceId) {
        setNeedsSpotifyOpen(true)
        return
      }

      deviceIdRef.current = deviceId
      setNeedsSpotifyOpen(false)

      // Try to play — retry once if first attempt fails
      let result = await tryPlay(deviceId, spotifyTrackId, startOffsetMs, accessToken)

      if (!result.ok) {
        await new Promise((r) => setTimeout(r, 800))
        result = await tryPlay(deviceId, spotifyTrackId, startOffsetMs, accessToken)
      }

      if (!result.ok) {
        setError('Tap to retry — make sure Spotify is open')
        return
      }

      setIsPlaying(true)

      // Wait until Spotify confirms audio is actually playing
      const confirmedProgress = await waitForPlaybackStarted(accessToken)

      if (confirmedProgress === null) {
        // Playback didn't start — but don't give up, still set a timer
        // It may have started but the poll missed it
        stopTimerRef.current = setTimeout(async () => {
          await fetch(
            `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
            { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } },
          ).catch(() => {})
          setIsPlaying(false)
        }, clipDurationMs + 2000)
        return
      }

      // Audio confirmed playing — schedule pause based on actual progress
      // Calculate remaining time: we want clipDurationMs of audio from startOffsetMs
      const targetStopMs = startOffsetMs + clipDurationMs
      const remainingMs = Math.max(targetStopMs - confirmedProgress, 1000)

      stopTimerRef.current = setTimeout(async () => {
        await fetch(
          `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } },
        ).catch(() => {})
        setIsPlaying(false)
      }, remainingMs)

    } else {
      // Desktop: Web Playback SDK
      if (!deviceIdRef.current) return

      try {
        const result = await tryPlay(deviceIdRef.current, spotifyTrackId, startOffsetMs, accessToken)
        if (!result.ok) {
          setError(result.error ?? 'Playback failed')
          return
        }
        setIsPlaying(true)
        setError(null)

        // Desktop SDK is more reliable — use player state events
        // But still add a small buffer for safety
        stopTimerRef.current = setTimeout(async () => {
          await playerRef.current?.pause()
          setIsPlaying(false)
        }, clipDurationMs + 500)
      } catch {
        setError('Playback error')
      }
    }
  }, [accessToken, spotifyTrackId, startOffsetMs, clipDurationMs])

  // Setup
  useEffect(() => {
    if (!accessToken) return

    const mobile = isMobile()
    mobileRef.current = mobile

    if (mobile) {
      let cancelled = false

      async function initialFind() {
        const deviceId = await acquirePhoneDevice(accessToken!)
        if (cancelled) return
        if (deviceId) {
          deviceIdRef.current = deviceId
          setIsReady(true)
          setNeedsSpotifyOpen(false)
          setError(null)
        } else {
          setIsReady(true)
          setNeedsSpotifyOpen(true)
        }
      }

      initialFind()

      const pollInterval = setInterval(async () => {
        if (cancelled) return
        const deviceId = await acquirePhoneDevice(accessToken!)
        if (cancelled) return
        if (deviceId) {
          deviceIdRef.current = deviceId
          setNeedsSpotifyOpen(false)
          setError(null)
        }
      }, 10_000)

      return () => {
        cancelled = true
        clearInterval(pollInterval)
      }
    } else {
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

  const retryConnection = useCallback(async () => {
    if (!accessToken) return
    setIsConnecting(true)
    setError(null)
    const deviceId = await acquirePhoneDevice(accessToken)
    if (deviceId) {
      deviceIdRef.current = deviceId
      setNeedsSpotifyOpen(false)
      setIsReady(true)
    } else {
      setNeedsSpotifyOpen(true)
    }
    setIsConnecting(false)
  }, [accessToken])

  return { play, isPlaying, isReady, error, isMobileDevice: mobileRef.current, needsSpotifyOpen, isConnecting, retryConnection }
}
