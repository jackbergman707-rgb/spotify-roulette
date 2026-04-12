'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect to onboarding if first visit
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('onboarded')) {
      router.replace('/onboarding')
    }
  }, [router])
  const [displayName, setDisplayName] = useState('')
  const [rounds, setRounds] = useState(7)
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = displayName.trim() || session?.user?.name || 'Player'

  async function createRoom() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalRounds: rounds, displayName: name }),
      })
      if (!res.ok) throw new Error('Failed to create room')
      const { roomCode } = await res.json()
      router.push(`/room/${roomCode}/lobby`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function joinRoom() {
    if (!joinCode.trim()) return
    setJoining(true)
    setError(null)
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase(), displayName: name }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to join')
      }
      router.push(`/room/${joinCode.trim().toUpperCase()}/lobby`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setJoining(false)
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
      {/* Header */}
      <div className="pt-16 px-8 mb-8">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.85]">
          Spotify<br />
          <span className="text-spotify neon-glow">Roulette</span>
        </h1>
        <p className="text-gray-500 font-medium mt-3 uppercase text-xs tracking-widest">
          Whose music is this anyway?
        </p>
      </div>

      {!session ? (
        <div className="flex-1 flex flex-col justify-end px-8 pb-12">
          <button
            onClick={() => signIn('spotify')}
            className="w-full py-5 bg-spotify text-white font-bold text-xl rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            Connect Spotify
          </button>
        </div>
      ) : (
        <>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-8 pb-32 space-y-10">
            {/* Create a room */}
            <div className="space-y-6">
              <h2 className="text-gray-400 font-bold text-sm uppercase tracking-widest">
                Create a Room
              </h2>

              {/* Name input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase px-1">Your Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={session.user?.name ?? 'Enter your name'}
                  maxLength={24}
                  className="w-full bg-card-alt border border-white/5 rounded-2xl p-5 text-white font-bold outline-none focus:border-spotify transition-colors placeholder:text-white/20"
                />
              </div>

              {/* Rounds slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Rounds</label>
                  <span className="text-spotify font-black text-2xl">{rounds}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <button
                onClick={createRoom}
                disabled={creating}
                className="w-full py-5 bg-spotify text-black font-black text-xl rounded-2xl active:scale-95 transition-transform uppercase disabled:opacity-50 shadow-[0_0_30px_rgba(29,185,84,0.3)]"
              >
                {creating ? 'Creating...' : 'Create Room'}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] flex-1 bg-white/10" />
              <span className="text-gray-600 font-black text-xs uppercase">OR</span>
              <div className="h-[1px] flex-1 bg-white/10" />
            </div>

            {/* Join a room */}
            <div className="space-y-6">
              <h2 className="text-gray-400 font-bold text-sm uppercase tracking-widest">
                Join a Room
              </h2>
              <div className="flex gap-3">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  className="flex-1 bg-card-alt border border-white/5 rounded-2xl p-5 text-white font-black text-center tracking-[0.3em] uppercase outline-none focus:border-spotify transition-colors placeholder:text-white/20"
                />
                <button
                  onClick={joinRoom}
                  disabled={joining || !joinCode.trim()}
                  className="px-8 py-5 bg-white/5 border border-white/10 text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
                >
                  {joining ? '...' : 'Join'}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center font-bold">{error}</p>
            )}
          </div>

          {/* Footer identity */}
          <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-night via-night to-transparent">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3">
                {session.user?.image && (
                  <img src={session.user.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                )}
                <div className="flex flex-col">
                  <span className="text-white font-bold text-sm">{session.user?.name}</span>
                  <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Spotify Connected</span>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="text-spotify text-xs font-black uppercase tracking-widest underline underline-offset-4"
              >
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
