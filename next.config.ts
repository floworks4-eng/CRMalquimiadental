import type { NextConfig } from 'next'

// Supabase se consulta desde el servidor; el navegador usa su origen para previsualizar archivos clínicos firmados.
// Sin nonces: Next necesita scripts inline para hidratar.
const isDev = process.env.NODE_ENV === 'development'
const https = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null
const supabaseRealtimeOrigin = supabaseOrigin?.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
  "font-src 'self'",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''}${supabaseRealtimeOrigin ? ` ${supabaseRealtimeOrigin}` : ''}`,
  `frame-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
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
  outputFileTracingIncludes: { '/models/*': ['./public/models/teeth.glb', './public/models/teeth.glb.br', './public/models/teeth.glb.gz'] },
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
