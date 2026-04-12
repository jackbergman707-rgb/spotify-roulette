import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Spotify Roulette',
  description: 'Whose music is this anyway?',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-night antialiased">
        <Providers>{children}</Providers>
        <a
          href="https://docs.google.com/forms/d/e/1FAIpQLSedzfWDfCoA2lNRPDewjqu9s2Yc4a88mZ132jEsp1wfMuSZoA/viewform"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-4 left-4 z-50 bg-white/10 backdrop-blur-sm text-white/70 text-xs font-bold px-3 py-2 rounded-full shadow-lg border border-white/10 hover:bg-white/20 transition-colors"
        >
          Feedback
        </a>
      </body>
    </html>
  )
}
