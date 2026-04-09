import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'i.scdn.co' },           // Spotify album art
      { hostname: 'platform-lookaside.fbsbx.com' }, // Spotify profile photos
    ],
  },
}

export default nextConfig
