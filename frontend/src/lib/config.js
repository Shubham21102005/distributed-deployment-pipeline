// Constants the developer may edit.

// Proxied by vite.config.js to http://localhost:5000/project (the API has no CORS).
export const API_PATH = '/api/project'
export const SOCKET_URL = 'http://localhost:5001'
export const PROXY_PORT = 8000

// A public Vite repository verified to build to dist/ with `npm install && npm run build`.
// Set this to one you have deployed successfully.
export const SAMPLE_REPO_URL = 'https://github.com/SafdarJamal/vite-template-react'

export const REQUEST_TIMEOUT_MS = 30_000
export const QUEUED_STALL_MS = 180_000
export const STREAM_STALL_MS = 120_000
export const SOCKET_UNREACHABLE_MS = 5_000
export const QUEUED_COPY_SWAP_MS = 90_000
export const TRACE_DOM_CAP = 600
// Raw log lines kept in memory for the Build log card (older lines drop off the top).
export const LOG_LINE_CAP = 500

export function siteHost(slug) {
  return `${slug}.localhost:${PROXY_PORT}`
}

export function siteUrl(slug) {
  return `http://${siteHost(slug)}`
}

/** The host to show and link: from the API's data.url once it has answered, else derived from the slug. */
export function hostOf(url, slug) {
  try {
    if (url) return new URL(url).host
  } catch {
    // fall through to the slug-derived host
  }
  return siteHost(slug)
}
