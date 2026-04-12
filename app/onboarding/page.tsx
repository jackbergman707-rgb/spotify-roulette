'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type Step = 'welcome' | 'connect' | 'howto' | 'invite'

export default function OnboardingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [copied, setCopied] = useState(false)

  // If already onboarded, skip to home
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('onboarded')) {
      router.replace('/')
    }
  }, [router])

  // After Spotify auth completes, advance past connect step
  useEffect(() => {
    if (session && step === 'connect') {
      setStep('howto')
    }
  }, [session, step])

  function finishOnboarding() {
    localStorage.setItem('onboarded', 'true')
    router.push('/')
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText('https://spotify-roulette-game.vercel.app')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-spotify border-t-transparent animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-night text-white flex flex-col">

      {/* Step 1: Welcome */}
      {step === 'welcome' && (
        <div className="flex-1 flex flex-col relative">
          {/* Background image overlay */}
          <div className="absolute inset-0 z-0 opacity-40">
            <div className="w-full h-full bg-gradient-to-t from-night via-night/60 to-night/20" />
          </div>

          <div className="relative z-10 flex-1 flex flex-col justify-end p-8 pb-12">
            <h1 className="text-6xl font-black italic uppercase leading-[0.85] tracking-tighter mb-6">
              Spotify<br />
              <span className="text-spotify neon-glow">Roulette</span>
            </h1>
            <p className="text-gray-400 text-lg font-medium">
              Whose music is this anyway?
            </p>
          </div>

          <div className="relative z-10 p-8 pt-0">
            <button
              onClick={() => setStep('connect')}
              className="w-full py-5 bg-spotify text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase tracking-tight shadow-[0_0_30px_rgba(29,185,84,0.3)]"
            >
              Start Playing
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Connect Spotify */}
      {step === 'connect' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-8 pt-20 flex flex-col items-center">
            {/* Spotify icon */}
            <div className="w-32 h-32 mb-12 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-24 h-24 text-spotify" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>

            {/* Header */}
            <div className="text-center space-y-4 mb-12">
              <h2 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
                Stake Your <span className="text-spotify">Library</span>
              </h2>
              <p className="text-gray-400 text-lg">
                Connect your Spotify account to bring your top tracks to the roulette table. We only read your playlists to play the game.
              </p>
            </div>

            {/* Feature bullets */}
            <div className="w-full space-y-4">
              <div className="flex items-center gap-4 p-5 bg-card rounded-2xl border border-white/5">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-spotify shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <span className="text-white font-bold uppercase text-xs tracking-widest">Secure OAuth connection</span>
              </div>
              <div className="flex items-center gap-4 p-5 bg-card rounded-2xl border border-white/5">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-spotify shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15V6M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 12H3M16 6H3M12 18H3" />
                </svg>
                <span className="text-white font-bold uppercase text-xs tracking-widest">Import your top 50 playlists</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 flex flex-col gap-4">
            <button
              onClick={() => signIn('spotify', { callbackUrl: '/onboarding' })}
              className="w-full py-5 bg-spotify text-white font-black text-xl rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform uppercase"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              Connect Spotify
            </button>
            <p className="text-center text-gray-600 text-[10px] uppercase font-bold tracking-widest px-4">
              By connecting, you agree to our privacy policy regarding music data usage.
            </p>
          </div>
        </div>
      )}

      {/* Step 3: How to Play */}
      {step === 'howto' && (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-8 pt-16">
            <span className="text-spotify font-bold uppercase tracking-[0.2em] text-xs mb-2 block">How it works</span>
            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
              The Game <span className="text-spotify">Rules</span>
            </h2>
          </div>

          {/* Rule cards */}
          <div className="flex-1 overflow-y-auto px-8 space-y-6">
            <div className="bg-card-alt p-6 rounded-3xl border border-white/5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-spotify text-black flex items-center justify-center font-black text-xl shrink-0 italic">
                  1
                </div>
                <div>
                  <h4 className="text-white font-black italic uppercase text-lg mb-2">Spin & Listen</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    A random 12-second snippet from a player&apos;s secret stash will play for everyone.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card-alt p-6 rounded-3xl border border-white/5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-white/10 text-white/40 flex items-center justify-center font-black text-xl shrink-0 italic">
                  2
                </div>
                <div>
                  <h4 className="text-white font-black italic uppercase text-lg mb-2">Guess the Owner</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Guess whose music it is to win points and climb the rankings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8">
            {/* Step dots */}
            <div className="flex justify-center gap-1.5 mb-6">
              <div className="h-1 w-4 bg-white/20 rounded-full" />
              <div className="h-1 w-8 bg-spotify rounded-full" />
              <div className="h-1 w-4 bg-white/20 rounded-full" />
            </div>
            <button
              onClick={() => setStep('invite')}
              className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase tracking-tight"
            >
              Let&apos;s Go
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Invite Your Crew */}
      {step === 'invite' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-8 pt-20 flex flex-col items-center">
            {/* Avatar placeholders */}
            <div className="flex -space-x-4 mb-12">
              <div className="w-20 h-20 rounded-full border-4 border-night bg-white/10" />
              <div className="w-24 h-24 rounded-full border-4 border-night bg-white/15 relative z-10" />
              <div className="w-20 h-20 rounded-full border-4 border-night bg-white/10" />
            </div>

            {/* Text */}
            <div className="text-center space-y-4 mb-10">
              <h2 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
                Assemble Your <span className="text-spotify">Crew</span>
              </h2>
              <p className="text-gray-400 text-lg">
                The bigger the table, the better the game. Invite your friends to reveal their secret music taste.
              </p>
            </div>

            {/* Copy link box */}
            <div className="w-full bg-card-alt p-5 rounded-2xl border border-white/5 flex items-center justify-between">
              <span className="text-gray-500 font-bold truncate pr-4 text-xs tracking-widest">
                SPOTIFY-ROULETTE-GAME.VERCEL.APP
              </span>
              <button
                onClick={handleCopyLink}
                className="text-spotify font-black uppercase text-xs tracking-[0.2em] whitespace-nowrap active:opacity-50"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 flex flex-col gap-3">
            <button
              onClick={finishOnboarding}
              className="w-full py-5 bg-spotify text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase tracking-tight shadow-[0_0_30px_rgba(29,185,84,0.3)]"
            >
              Join the Game
            </button>
            <button
              onClick={finishOnboarding}
              className="w-full py-2 text-gray-600 font-bold uppercase tracking-[0.2em] text-[10px] active:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
