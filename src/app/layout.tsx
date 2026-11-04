import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'

// The wordmark uses only Fraunces 500 italic; UI and numbers use Inter.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: 'italic', weight: '500' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Alquimia Dental',
  description: 'Sistema clínico interno de Alquimia Dental.',
  robots: { index: false, follow: false },
}
export const viewport: Viewport = { themeColor: '#242528' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-BO" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
