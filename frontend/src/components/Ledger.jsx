// The <ol role="list"> of stage entries plus the single visually-hidden
// role="status" live region. Decides which entry is current / past / stalled /
// deployed, scrolls a new entry into view when the reader is already near the
// bottom, and moves focus to the hostname link when the deploy completes.

import { useEffect, useLayoutEffect, useRef } from 'react'
import Entry from './Entry.jsx'
import { useNow } from '../hooks/useNow.js'
import { mmss } from '../lib/format.js'
import { hostOf } from '../lib/config.js'
import { copy, socket as socketCopy } from '../lib/copy.js'

const NEAR_BOTTOM_PX = 120
const ARRIVED_MS = 3000

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function noticeFor(state) {
  switch (state.socket) {
    case 'unreachable':
      return copy.socketUnreachableNotice
    case 'disconnected':
      return socketCopy.disconnected(mmss(state.socketNoticeAt))
    case 'reconnected':
      return socketCopy.reconnected(mmss(state.socketNoticeAt))
    default:
      return null
  }
}

export default function Ledger({ state, onDeployAgain, onDeployAnother }) {
  const { entries, stage, stall, slug } = state
  const clockLive = stage === 'queued' || (stage === 'building' && state.building.endedAt === null)
  const now = useNow(clockLive)

  const listRef = useRef(null)
  const hostnameRef = useRef(null)
  const count = entries.length

  // A new entry scrolls into view only when the viewport was already within
  // 120px of the bottom before it was added. Scrolling up is the pause.
  useLayoutEffect(() => {
    if (count === 0) return
    const li = listRef.current?.lastElementChild
    if (!li) return
    const grown = li.getBoundingClientRect().height + parseFloat(getComputedStyle(li).marginTop || '0')
    const bottomBefore = document.documentElement.scrollHeight - grown
    const viewportBottom = window.scrollY + window.innerHeight
    if (viewportBottom >= bottomBefore - NEAR_BOTTOM_PX) {
      li.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [count])

  // Focus moves to the hostname link on arrival so Enter opens the site;
  // data-arrived keeps the outline visible for 3s after the programmatic focus,
  // and comes off earlier if focus leaves the link.
  useEffect(() => {
    if (stage !== 'deployed') return undefined
    const link = hostnameRef.current
    if (!link) return undefined
    const arrivedOff = () => link.removeAttribute('data-arrived')
    link.setAttribute('data-arrived', '')
    link.focus({ preventScroll: false })
    const id = setTimeout(arrivedOff, ARRIVED_MS)
    link.addEventListener('blur', arrivedOff, { once: true })
    return () => {
      clearTimeout(id)
      link.removeEventListener('blur', arrivedOff)
      arrivedOff()
    }
  }, [stage, slug])

  const last = count - 1
  const notice = noticeFor(state)
  const host = hostOf(state.url, slug)

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement}
      </div>
      {/* data-deployed scopes the ink-to-quiet colour settle to the arrival beat (index.css). */}
      <ol ref={listRef} role="list" data-deployed={stage === 'deployed' ? '' : undefined}>
        {entries.map((entry, i) => {
          const isLast = i === last
          let status = 'past'
          if (isLast) status = stall ? 'stalled' : stage === 'deployed' ? 'deployed' : 'current'
          return (
            <Entry
              key={entry.stage}
              entry={entry}
              status={status}
              slug={slug}
              host={host}
              url={state.url}
              detail={state[entry.stage]}
              now={isLast ? now : 0}
              lastMessageAt={isLast ? state.lastMessageAt : 0}
              notice={isLast ? notice : null}
              stallKind={isLast && stall ? stall.kind : null}
              onDeployAgain={onDeployAgain}
              onDeployAnother={onDeployAnother}
              hostnameRef={entry.stage === 'deployed' ? hostnameRef : null}
            />
          )
        })}
      </ol>
    </>
  )
}
