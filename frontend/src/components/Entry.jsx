// One ledger entry: its own two-column grid (96px stamp gutter + reading
// column on desktop; single column with the stamp inline after the word on
// phone), the stage word in the display face, the stage copy, the socket
// notice slot, the detail slot, the stall note with its "Deploy again" button,
// the "Quiet for…, then resumed" history line, and unrecognised-line text.
// data-state drives colour (see index.css).

import { memo } from 'react'
import Trace from './Trace.jsx'
import FileRows from './FileRows.jsx'
import { mmss } from '../lib/format.js'
import { QUEUED_COPY_SWAP_MS, siteUrl } from '../lib/config.js'
import {
  copy,
  queued as queuedCopy,
  uploading as uploadingCopy,
  deployed as deployedCopy,
  stall as stallCopy,
} from '../lib/copy.js'

function queuedBody({ detail, slug, host, status, now }) {
  const endAt = detail.endedAt ?? Math.max(now, detail.respondedAt)
  const elapsed = endAt - detail.respondedAt
  const swapped = elapsed >= QUEUED_COPY_SWAP_MS
  const text = swapped ? queuedCopy.copyAfter90s(slug) : queuedCopy.copy(slug)
  return {
    copy: detail.joined ? `${text} ${copy.queuedJoinedSuffix}` : text,
    detail: (
      <>
        <p className="clock text-small">
          {status === 'past' ? queuedCopy.clockFrozen(mmss(elapsed)) : queuedCopy.clockRunning(mmss(elapsed))}
        </p>
        <p className="wrap-any mt-1 max-w-[60ch] text-small text-quiet">{queuedCopy.futureUrl(host)}</p>
      </>
    ),
  }
}

function buildingBody({ detail, status, stallKind, lastMessageAt, now }) {
  return {
    copy: detail.endedAt === null ? copy.buildingCopyRunning : copy.buildingCopyEnded,
    detail: (
      <Trace
        marks={detail.marks}
        stdout={detail.stdout}
        stderr={detail.stderr}
        status={status}
        stallKind={stallKind}
        endedAt={detail.endedAt}
        startedAt={detail.startedAt}
        lastMessageAt={lastMessageAt}
        now={now}
      />
    ),
  }
}

function uploadingBody({ detail, status }) {
  const n = detail.uploadedCount
  let text
  if (status === 'past') text = uploadingCopy.done(n)
  else if (n === 0) text = copy.uploadingCopyStart
  else text = uploadingCopy.progress(n)
  return { copy: text, detail: detail.files.length > 0 ? <FileRows files={detail.files} /> : null }
}

function deployedBody({ detail, slug, host, url, stampMs, hostnameRef, onDeployAnother }) {
  return {
    copy: deployedCopy.headline(detail.fileCount, mmss(stampMs)),
    detail: (
      <>
        <a
          ref={hostnameRef}
          className="hostname wrap-any inline-block text-address-sm motion-safe:animate-ledger-arrive md:text-address"
          href={url || siteUrl(slug)}
          target="_blank"
          rel="noopener"
          aria-label={deployedCopy.linkAccessibleName(host)}
        >
          {deployedCopy.link(host)}
        </a>
        <p className="mt-1 max-w-[60ch] text-small text-quiet">{copy.completedCaveat}</p>
        <button type="button" className="text-button mt-2" onClick={onDeployAnother}>
          {copy.deployAnotherAction}
        </button>
      </>
    ),
  }
}

function bodyFor(props) {
  switch (props.entry.stage) {
    case 'queued':
      return queuedBody(props)
    case 'building':
      return buildingBody(props)
    case 'uploading':
      return uploadingBody(props)
    case 'deployed':
      return deployedBody(props)
    default:
      return { copy: '', detail: null }
  }
}

function Entry(props) {
  const { entry, status, notice, stallKind, onDeployAgain, detail } = props
  const word = copy.stageWord[entry.stage]
  const stamp = mmss(entry.stampMs)
  const body = bodyFor({ ...props, slug: props.slug, stampMs: entry.stampMs })
  const wordClass =
    entry.stage === 'deployed' ? 'stage-word motion-safe:animate-ledger-arrive' : 'stage-word'

  return (
    <li
      className="entry mt-10 grid grid-cols-1 first:mt-12 md:mt-14 md:grid-cols-[96px_minmax(0,1fr)] md:items-baseline md:gap-x-6 md:first:mt-16"
      data-state={status}
    >
      {notice ? (
        <p className="wrap-any mb-3 max-w-[60ch] text-small text-stalled md:col-start-2 md:row-start-1">{notice}</p>
      ) : null}
      <span className="stamp hidden text-right text-small text-quiet md:col-start-1 md:row-start-2 md:block">{stamp}</span>
      <div className="min-w-0 md:col-start-2 md:row-start-2">
        <div className="flex items-baseline gap-3">
          <h2 className={wordClass}>{word}</h2>
          <span className="stamp text-small text-quiet md:hidden">{stamp}</span>
        </div>
        <p className="count wrap-any mt-3 max-w-[60ch]">{body.copy}</p>
        {body.detail !== null ? <div className="mt-4">{body.detail}</div> : null}
        {detail.textLines.length > 0 ? (
          <div>
            {detail.textLines.map((line, i) => (
              <p key={i} className="wrap-any mt-1 max-w-[60ch] text-small text-quiet">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {stallKind ? (
          <>
            <p className="note mt-4 max-w-[60ch]">{stallCopy.note(stallKind)}</p>
            <button type="button" className="text-button mt-2" onClick={onDeployAgain}>
              {copy.deployAgainAction}
            </button>
          </>
        ) : null}
        {entry.resumed ? (
          <p className="clock mt-4 max-w-[60ch] text-small text-quiet">
            {stallCopy.resumed(mmss(entry.resumed.quietFor), mmss(entry.resumed.atMs))}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export default memo(Entry)
