'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
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
      <main className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 gap-10">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight">Spotify Guesser</h1>
        <p className="text-white/40 mt-2 text-sm">Whose music is this anyway?</p>
      </div>

      {!session ? (
        <button
          onClick={() => signIn('spotify')}
          className="flex items-center gap-3 bg-green-500 text-black font-semibold px-8 py-4 rounded-full hover:bg-green-400 transition-colors text-lg"
        >
          Connect Spotify
        </button>
      ) : (
        <div className="w-full max-w-sm space-y-6">
          {/* Display name */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-white/30">Your name</p>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={session.user?.name ?? 'Enter your name'}
              maxLength={24}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-white/30">Create a room</p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-white/60">Rounds</label>
              <input
                type="range"
                min={3}
                max={15}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="flex-1 accent-green-500"
              />
              <span className="w-6 text-center font-bold">{rounds}</span>
            </div>
            <button
              onClick={createRoom}
              disabled={creating}
              className="w-full py-4 bg-green-500 text-black font-semibold rounded-xl hover:bg-green-400 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Create room'}
            </button>
          </div>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-white/30">Join a room</p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room code"
                maxLength={6}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 uppercase tracking-widest font-mono focus:outline-none focus:border-white/30"
              />
              <button
                onClick={joinRoom}
                disabled={joining || !joinCode.trim()}
                className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white disabled:opacity-40 transition-colors"
              >
                {joining ? '…' : 'Join'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <div className="flex items-center justify-center gap-3">
            {session.user?.image && (
              <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
            )}
            <p className="text-white/30 text-xs">{session.user?.name}</p>
            <button
              onClick={() => signOut()}
              className="text-xs text-white/30 hover:text-white/60 underline transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
