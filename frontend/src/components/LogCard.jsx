// The Build log card: every raw line the socket delivered, verbatim, in a
// scrollable panel that stays visible during the deploy and after it finishes.
// Consecutive identical lines are collapsed to one row with a repeat count, so
// the ~70 content-less "npm output" ticks read as one row, not seventy. The
// list auto-scrolls to the newest line while it is near the bottom.

import { useEffect, useLayoutEffect, useRef } from 'react'
import { copy } from '../lib/copy.js'

const c = copy.log

// The empty stdout/stderr ticks carry no content (the backend drops npm's real
// output), so show a readable stand-in instead of a blank row.
function rowText(row) {
  if (row.kind === 'out' || row.kind === 'err') {
    return row.text.replace(/^logs?:\s*/i, '').replace(/^error:\s*/i, '').trim() || c.tick
  }
  if (row.kind === 'system') return c.system
  return row.text
}

export default function LogCard({ log }) {
  const scrollRef = useRef(null)
  const pinnedRef = useRef(true)

  // Track whether the viewer is near the bottom, so streaming doesn't yank them
  // up if they've scrolled back to read something.
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [log])

  // Keep the pinned flag honest if the box is resized.
  useEffect(() => {
    pinnedRef.current = true
  }, [])

  const lineCount = log.reduce((n, r) => n + r.count, 0)

  return (
    <section className="log-card mt-14 md:col-start-2" aria-labelledby="log-heading">
      <div className="mb-3 flex items-baseline justify-between gap-x-4">
        <h2 id="log-heading" className="text-body font-bold text-ink">
          {c.heading}
        </h2>
        <span className="count text-small text-quiet">{c.lineCount(lineCount)}</span>
      </div>
      {log.length === 0 ? (
        <p className="log-body text-small text-quiet">{c.empty}</p>
      ) : (
        <ol ref={scrollRef} onScroll={onScroll} className="log-body log-scroll text-small" tabIndex={0}>
          {log.map((row, i) => (
            <li key={i} className="log-line flex items-baseline gap-x-3">
              <span className={`wrap-any min-w-0 ${row.kind === 'err' ? 'text-stalled' : row.kind === 'event' ? 'text-ink' : 'text-quiet'}`}>
                {rowText(row)}
              </span>
              {row.count > 1 ? <span className="count ml-auto shrink-0 text-quiet">{c.countSuffix(row.count)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
