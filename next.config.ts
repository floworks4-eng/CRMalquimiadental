import type { NextConfig } from 'next'

// Cabeceras de seguridad (F1-070). El navegador nunca habla con Supabase: todo pasa por el servidor de Next,
// por eso connect-src es solo 'self'. Sin nonces: Next necesita scripts inline para hidratar.
const isDev = process.env.NODE_ENV === 'development'
const https = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(https ? ['upgrade-insecure-requests'] : []),
].join('; ')

const nextConfig: NextConfig = {
  experimental: { proxyClientMaxBodySize: '21mb' },
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          ...(https ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
        ],
      },
    ]
  },
}

export default nextConfig
