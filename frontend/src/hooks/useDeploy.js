// The whole deploy lifecycle in one hook: submit (clear the previous run,
// generate a slug, open the socket and subscribe before the POST), request
// classification, socket handlers, rAF-batched dispatch of parsed log events,
// the stall timers, and cleanup on new deploy and unmount.
//
// The socket is created in the submit handler (an event), never in an effect,
// so StrictMode's double-invoked effects cannot open two sockets. Handlers only
// touch `dispatch` (stable) and refs, so one subscription per deploy suffices.

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { reducer, initialState } from './deployReducer.js'
import { parseMessage, STAGE_EVENTS } from '../lib/logLines.js'
import { generateSlug } from '../lib/slug.js'
import { stripHtmlExcerpt } from '../lib/format.js'
import {
  API_PATH,
  SOCKET_URL,
  REQUEST_TIMEOUT_MS,
  SOCKET_UNREACHABLE_MS,
  QUEUED_STALL_MS,
  STREAM_STALL_MS,
  siteUrl,
} from '../lib/config.js'

const DEFAULT_TIMING = { queuedStallMs: QUEUED_STALL_MS, streamStallMs: STREAM_STALL_MS }
const FLUSH_FALLBACK_MS = 100

// socket.io-client is only needed once the form is submitted, so it ships as its
// own chunk. Vite caches the import; preloadSocketClient() warms it on intent.
const loadSocketClient = () => import('socket.io-client')
export function preloadSocketClient() {
  loadSocketClient().catch(() => {})
}

// If the socket.io-client chunk fails to load (stale hash after a rebuild, network gone
// after first paint), deploy anyway with an inert socket: 'connect' never fires, so the
// unreachable timer raises the existing log-server notice instead of wedging in 'requesting'.
const INERT_SOCKET = { on() {}, off() {}, emit() {}, disconnect() {} }
const INERT_SOCKET_CLIENT = { io: () => INERT_SOCKET }

/** POST /api/project. Never throws; classifies every outcome. */
async function request(fetchImpl, gitURL, slug, signal) {
  let res
  try {
    res = await fetchImpl(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitURL, slug }),
      signal,
    })
  } catch (err) {
    return { ok: false, error: { kind: err && err.name === 'AbortError' ? 'timeout' : 'network' } }
  }

  if (res.ok) {
    let data
    try {
      data = (await res.json())?.data ?? null
    } catch {
      data = null
    }
    return { ok: true, projectSlug: data?.projectSlug ?? null, url: data?.url ?? null }
  }

  if (res.status === 400) {
    let reason
    try {
      const json = await res.json()
      reason = typeof json?.error === 'string' ? json.error : null
    } catch {
      reason = null
    }
    return reason
      ? { ok: false, error: { kind: '400', reason } }
      : { ok: false, error: { kind: 'other', status: 400 } }
  }

  if (res.status === 500) {
    let excerpt
    try {
      excerpt = stripHtmlExcerpt(await res.text(), 160)
    } catch {
      excerpt = ''
    }
    return { ok: false, error: { kind: '500', excerpt: excerpt || null } }
  }

  // The browser only reaches the API through the Vite proxy, which answers an unreachable
  // upstream with an empty 502/504 instead of a thrown fetch. Read that as "API not running".
  if (res.status === 502 || res.status === 504) {
    let body
    try {
      body = await res.text()
    } catch {
      body = ''
    }
    if (body.trim() === '') return { ok: false, error: { kind: 'network' } }
  }

  return { ok: false, error: { kind: 'other', status: res.status } }
}

export function useDeploy() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // The current run: socket, abort controller, timers, mock handle. Transient, never rendered.
  const runRef = useRef(null)
  const bufferRef = useRef([])
  const flushHandleRef = useRef(null)
  const timingRef = useRef(DEFAULT_TIMING)

  const cancelFlush = useCallback(() => {
    const h = flushHandleRef.current
    if (!h) return
    if (h.kind === 'raf') cancelAnimationFrame(h.id)
    else clearTimeout(h.id)
    flushHandleRef.current = null
  }, [])

  const flush = useCallback(() => {
    flushHandleRef.current = null
    const events = bufferRef.current
    if (events.length === 0) return
    bufferRef.current = []
    dispatch({ type: 'events', events })
  }, [])

  // Socket messages arrive as separate macrotasks; buffer them and dispatch once per frame.
  // A stage-changing event flushes at once. In a hidden tab rAF never fires, so fall back to a
  // timeout, and reroute a frame that was pending when the tab went hidden (otherwise the buffer
  // would sit unflushed, lastMessageAt would go stale and the stall timer would fire falsely).
  const push = useCallback(
    (event) => {
      bufferRef.current.push(event)
      if (STAGE_EVENTS.has(event.type)) {
        cancelFlush()
        flush()
        return
      }
      const pending = flushHandleRef.current
      if (pending) {
        if (pending.kind === 'raf' && document.hidden) cancelFlush()
        else return
      }
      if (typeof requestAnimationFrame === 'function' && !document.hidden) {
        flushHandleRef.current = { kind: 'raf', id: requestAnimationFrame(flush) }
      } else {
        flushHandleRef.current = { kind: 'timeout', id: setTimeout(flush, FLUSH_FALLBACK_MS) }
      }
    },
    [cancelFlush, flush],
  )

  const stopRun = useCallback(() => {
    const run = runRef.current
    if (!run) return
    runRef.current = null
    if (run.socket) {
      run.socket.off()
      run.socket.disconnect()
    }
    clearTimeout(run.unreachableTimer)
    clearTimeout(run.requestTimer)
    if (run.abort) run.abort.abort()
    if (run.stopMock) run.stopMock()
    cancelFlush()
    bufferRef.current = []
  }, [cancelFlush])

  useEffect(() => stopRun, [stopRun])

  // Drain a pending frame the moment the tab hides: browsers pause rAF in background tabs.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && flushHandleRef.current?.kind === 'raf') {
        cancelFlush()
        flush()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [cancelFlush, flush])

  const start = useCallback(
    (run, socket, fetchImpl, gitURL) => {
      run.socket = socket

      socket.on('connect', () => {
        clearTimeout(run.unreachableTimer)
        // Rooms do not survive a reconnect: subscribe on every connect.
        socket.emit('subscribe', `logs:${run.slug}`)
        dispatch({ type: 'socket-connect', at: Date.now() })
      })
      socket.on('disconnect', () => {
        dispatch({ type: 'socket-disconnect', at: Date.now() })
      })
      socket.on('message', (raw) => {
        push({ ...parseMessage(raw), at: Date.now() })
      })

      run.unreachableTimer = setTimeout(() => {
        dispatch({ type: 'socket-unreachable', at: Date.now() })
      }, SOCKET_UNREACHABLE_MS)

      const abort = new AbortController()
      run.abort = abort
      run.requestTimer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)

      request(fetchImpl, gitURL, run.slug, abort.signal).then((result) => {
        if (runRef.current !== run) return
        clearTimeout(run.requestTimer)
        run.abort = null
        if (result.ok) {
          if (result.projectSlug && result.projectSlug !== run.slug) {
            run.slug = result.projectSlug
            socket.emit('subscribe', `logs:${run.slug}`)
          }
          dispatch({ type: 'queued', at: Date.now(), slug: run.slug, url: result.url || siteUrl(run.slug) })
        } else {
          stopRun()
          dispatch({ type: 'request-failed', at: Date.now(), error: result.error })
        }
      })
    },
    [push, stopRun],
  )

  const deploy = useCallback(
    (gitURL) => {
      stopRun()
      const at = Date.now()
      const slug = generateSlug()
      const run = {
        slug,
        socket: null,
        abort: null,
        unreachableTimer: 0,
        requestTimer: 0,
        stopMock: null,
      }
      runRef.current = run
      timingRef.current = DEFAULT_TIMING
      dispatch({ type: 'submit', at, slug, url: siteUrl(slug), gitURL })

      // Dev-only mock replay (?mock=<scenario>): same parseMessage to reducer path,
      // scripted raw strings instead of a socket. Tree-shaken out of production builds.
      const scenario = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('mock') : null
      if (scenario) {
        import('../dev/mockRun.js').then(({ createMock }) => {
          if (runRef.current !== run) return
          const mock = createMock(scenario)
          if (mock.timing) timingRef.current = { ...DEFAULT_TIMING, ...mock.timing }
          run.stopMock = mock.stop
          start(run, mock.socket, mock.fetch, gitURL)
        })
        return
      }

      loadSocketClient()
        .catch(() => INERT_SOCKET_CLIENT)
        .then(({ io }) => {
          if (runRef.current !== run) return
          start(run, io(SOCKET_URL), (url, init) => fetch(url, init), gitURL)
        })
    },
    [start, stopRun],
  )

  // Stall timers, derived from the state they watch. Cleared automatically on
  // every stage change, on each message (lastMessageAt), on stall, and on unmount.
  const { stage, lastMessageAt } = state
  const respondedAt = state.queued.respondedAt
  const stalled = state.stall !== null

  useEffect(() => {
    if (stalled) return undefined
    const timing = timingRef.current
    let delay
    if (stage === 'queued') delay = timing.queuedStallMs - (Date.now() - respondedAt)
    else if (stage === 'building' || stage === 'uploading') delay = timing.streamStallMs - (Date.now() - lastMessageAt)
    else return undefined
    const id = setTimeout(() => dispatch({ type: 'stall', at: Date.now() }), Math.max(0, delay))
    return () => clearTimeout(id)
  }, [stage, lastMessageAt, respondedAt, stalled])

  return { state, deploy }
}
