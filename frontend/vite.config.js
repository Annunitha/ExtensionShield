import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const isReportOnly = process.env.VITE_CSP_REPORT_ONLY === 'true';

  // Generate CSP based on environment
  const generateCSP = (dev) => {
    if (dev) {
      // Dev CSP: Permissive for Vite HMR
      return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for Vite
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // unsafe-inline for React
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.supabase.co https://*.supabase.io http://localhost:* ws://localhost:* wss://localhost:*",
        "frame-src 'self' https://*.supabase.co",
        // Vite creates workers from blob: URLs in dev
        "worker-src 'self' blob:",
        "manifest-src 'self'",
      ].join('; ');
    } else {
      // Prod CSP: Strict (no unsafe-eval, no unsafe-inline for scripts)
      return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
        "script-src 'self' https://static.cloudflareinsights.com", // No unsafe-eval or unsafe-inline in production
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // unsafe-inline needed for React inline styles
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.supabase.co https://*.supabase.io",
        "frame-src 'self' https://*.supabase.co",
        "worker-src 'self'",
        "manifest-src 'self'",
      ].join('; ');
    }
  };

  return {
    plugins: [
      react(),
      // Plugin to inject CSP meta tag
      {
        name: 'inject-csp-meta',
        transformIndexHtml(html) {
          const csp = generateCSP(isDev);
          const headerName = isReportOnly
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';
          
          const cspMetaTag = `    <meta http-equiv="${headerName}" content="${csp}">`;
          
          // Remove any existing CSP meta tags
          html = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy[^"']*["'][^>]*>/gi, '');
          
          // Insert CSP meta tag - look for the comment marker
          const commentMarker = '<!-- CSP meta tag will be injected here by Vite build plugin -->';
          if (html.includes(commentMarker)) {
            html = html.replace(commentMarker, cspMetaTag);
          } else {
            // Fallback: insert before </head> or before title
            if (html.includes('</head>')) {
              html = html.replace('</head>', `${cspMetaTag}\n  </head>`);
            } else if (html.includes('<title>')) {
              html = html.replace('<title>', `${cspMetaTag}\n    <title>`);
            }
          }
          
          return html;
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8007',
          changeOrigin: true,
        },
      },
    },
  };
})
