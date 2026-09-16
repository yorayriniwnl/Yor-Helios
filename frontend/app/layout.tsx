import './globals.css'
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import React from 'react'
import type { Viewport } from 'next'
import OfflineBanner from '../components/ui/OfflineBanner'

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Helios // Energy Intelligence',
  description: 'A YOR-styled command surface for meter telemetry, anomaly triage, and field response.',
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'Helios // Energy Intelligence',
    description: 'Meter telemetry, anomaly triage, and field response in one command surface.',
    type: 'website',
    images: ['/icon.svg'],
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased min-h-screen">
        <div className="min-h-screen flex flex-col">
          <OfflineBanner />
          <div className="flex-1 w-full transition-colors duration-300">
            <div className="container mx-auto py-6">
              {children}
            </div>
          </div>
          <footer className="technical py-4 text-center text-[10px]" style={{ color: 'var(--muted)' }}>
            HELIOS // YOR VISUAL SYSTEM // DEMO SURFACE // © {new Date().getFullYear()}
          </footer>
        </div>
      </body>
    </html>
  )
}
