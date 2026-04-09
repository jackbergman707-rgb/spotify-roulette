'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface UseAudioPlayerOptions {
  previewUrl: string | null
  startOffsetMs: number
  clipDurationMs?: number
  replaySignal: number
}

export function useAudioPlayer({
  previewUrl,
  startOffsetMs,
  clipDurationMs = 12_000,
  replaySignal,
}: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [needsInteraction, setNeedsInteraction] = useState(false)

  const play = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !previewUrl) return

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)

    audio.currentTime = startOffsetMs / 1000
    audio.play().then(() => {
      setIsPlaying(true)
      setNeedsInteraction(false)
      stopTimerRef.current = setTimeout(() => {
        audio.pause()
        setIsPlaying(false)
      }, clipDurationMs)
    }).catch(() => {
      setNeedsInteraction(true)
    })
  }, [previewUrl, startOffsetMs, clipDurationMs])

  useEffect(() => {
    if (!previewUrl) return
    const audio = new Audio(previewUrl)
    audio.preload = 'auto'
    audioRef.current = audio
    setIsPlaying(false)
    play()
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      audio.pause()
      audioRef.current = null
      setIsPlaying(false)
    }
  }, [previewUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (replaySignal > 0) play()
  }, [replaySignal, play])

  return { play, isPlaying, needsInteraction }
}
