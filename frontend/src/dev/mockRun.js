// Dev-only mock replay. Loaded by useDeploy through a dynamic import guarded
// by import.meta.env.DEV, so Rollup drops it from production bundles.
//
// It stands in for the socket and for fetch(), and feeds the SAME strings the
// real backend sends (the plain 'joined: logs:<slug>' ack and JSON {"log": "..."}
// strings) through the same parseMessage to reducer path. Timings are compressed.
//
// Scenarios (append ?mock=<name> to the dev URL):
//   happy         queued ~3s, ~70 ticks over ~4s, upload of 8 files, Deployed
//   stall-build   stops after 'Build complete'; stall timers shortened so the stall shows within ~6s
//   stall-queued  never sends 'Build started'; queued stall within ~6s
//   fail-400      the POST resolves 400 with the API's JSON reason
//   fail-500      the POST resolves 500 with a short Express-style HTML body
//   disconnect    mid-build 'disconnect' for 3s, then 'connect' and the build resumes

const DIST_FILES = [
  'index.html',
  'assets/index-CyBHeG3D.js',
  'assets/index-DykytF2W.css',
  'assets/react-CHdo91hT.svg',
  'assets/vite-CHdo91hT.svg',
  'assets/hero-BQtP9Z1u.png',
  'favicon.svg',
  'robots.txt',
]

const SHORT_STALL = { queuedStallMs: 4000, streamStallMs: 4000 }

function logString(text) {
  return JSON.stringify({ log: text })
}

/** Minimal socket.io-like emitter: on/off/emit/disconnect, plus a `connected` flag. */
function createFakeSocket(schedule) {
  const listeners = new Map()
  const socket = {
    connected: false,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      if (!event) listeners.clear()
      else if (!fn) listeners.delete(event)
      else listeners.get(event)?.delete(fn)
      return socket
    },
    // The client emits subscribe; the server answers with the plain ack.
    emit(event, channel) {
      if (event === 'subscribe') schedule(30, () => socket.receive('message', `joined: ${channel}`))
      return socket
    },
    receive(event, ...args) {
      for (const fn of listeners.get(event) ?? []) fn(...args)
    },
    disconnect() {
      socket.connected = false
      return socket
    },
  }
  return socket
}

function htmlResponse(status, body) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const EXPRESS_500 =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Error: The security group &#39;sg-03114e2162838fde6&#39; does not exist in default VPC<br> &nbsp; &nbsp;at throwDefaultError (/home/api/node_modules/@smithy/smithy-client/dist-cjs/index.js:844:20)</pre>\n</body>\n</html>\n'

export function createMock(scenario) {
  const timers = new Set()
  let stopped = false

  function schedule(delay, fn) {
    const id = setTimeout(() => {
      timers.delete(id)
      if (!stopped) fn()
    }, delay)
    timers.add(id)
    return id
  }

  const socket = createFakeSocket(schedule)
  const send = (text) => socket.receive('message', logString(text))

  // The socket connects shortly after it is opened, before the POST resolves.
  schedule(150, () => {
    socket.connected = true
    socket.receive('connect')
  })

  // Read the request body so the response echoes the client's slug, like the API does.
  function fetchImpl(url, init) {
    let slug = 'mock-slug'
    try {
      slug = JSON.parse(init.body).slug || slug
    } catch {
      /* the mock only needs a slug for the echo */
    }
    return new Promise((resolve) => {
      schedule(700, () => {
        if (scenario === 'fail-400') {
          resolve(jsonResponse(400, { error: 'gitURL is required' }))
          return
        }
        if (scenario === 'fail-500') {
          resolve(htmlResponse(500, EXPRESS_500))
          return
        }
        resolve(jsonResponse(200, { status: 'queued', data: { projectSlug: slug, url: `http://${slug}.localhost:8000` } }))
        scriptRun()
      })
    })
  }

  // The container's log, time-compressed. Real sequence from build-server/script.js.
  function scriptRun() {
    if (scenario === 'stall-queued') return

    let t = 3000
    schedule(t, () => send('logs: Build started'))

    // ~60 stdout chunks and ~10 stderr chunks over ~4s, stderr clustered like npm warnings.
    const ticks = []
    for (let i = 0; i < 70; i++) ticks.push(i % 7 === 3 ? 'Error: ' : 'logs: ')
    const step = 4000 / ticks.length
    // disconnect scenario: the socket drops for 3s mid-build, reconnects, and the
    // builder's next line arrives 2s later so the reconnected notice can be read.
    const pauseAt = scenario === 'disconnect' ? 30 : -1
    const pauseMs = 3000 + 2000

    ticks.forEach((line, i) => {
      let delay = t + 200 + i * step
      if (pauseAt !== -1 && i >= pauseAt) delay += pauseMs
      schedule(delay, () => send(line))
    })

    if (pauseAt !== -1) {
      const dropAt = t + 200 + pauseAt * step
      schedule(dropAt - 50, () => {
        socket.connected = false
        socket.receive('disconnect', 'transport close')
      })
      schedule(dropAt + 2950, () => {
        socket.connected = true
        socket.receive('connect')
      })
      t += pauseMs
    }

    t += 200 + ticks.length * step + 400
    schedule(t, () => send('logs: Build complete'))

    if (scenario === 'stall-build') return

    t += 1200
    schedule(t, () => send('logs:Starting Upload'))

    DIST_FILES.forEach((file, i) => {
      const base = t + 300 + i * 350
      schedule(base, () => send(`logs: Uploading: ${file}`))
      schedule(base + 220, () => send(`logs: Uploaded: ${file}`))
    })

    t += 300 + DIST_FILES.length * 350 + 300
    schedule(t, () => send('logs: COmpleted'))
  }

  return {
    socket,
    fetch: fetchImpl,
    timing: scenario === 'stall-build' || scenario === 'stall-queued' ? SHORT_STALL : null,
    stop() {
      stopped = true
      for (const id of timers) clearTimeout(id)
      timers.clear()
    },
  }
}
