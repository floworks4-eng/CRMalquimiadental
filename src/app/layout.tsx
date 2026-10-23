import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', style: ['normal', 'italic'] })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'Alquimia Dental · CRM/ERP clínico (demo)',
  description: 'Demo navegable del sistema clínico propuesto por Lumen Labs para Alquimia Dental, La Paz.',
}
export const viewport: Viewport = { themeColor: '#1e1f21' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-BO" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
