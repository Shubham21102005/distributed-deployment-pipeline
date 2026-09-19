// The tally: one 2px mark per chunk npm printed, tall for stdout (currentColor)
// and short for stderr (quiet, bottom-aligned), at a 5px pitch, wrapping at
// 800px. Followed by the counts sentence and either the "Last output" clock or
// the "build step ended" sentence. Pure presentation.

import { memo } from 'react'
import { building as buildingCopy } from '../lib/copy.js'
import { mmss, secondsAgo } from '../lib/format.js'

const STDOUT_MARK = 'inline-block w-[2px] h-[14px] bg-current'
const STDERR_MARK = 'inline-block w-[2px] h-[7px] bg-quiet'

const Marks = memo(function Marks({ marks }) {
  return (
    <div aria-hidden="true" className="flex max-w-[800px] min-h-[14px] flex-wrap items-end gap-x-[3px] gap-y-1">
      {marks.map((m, i) => (
        <span key={i} className={m === 1 ? STDERR_MARK : STDOUT_MARK} />
      ))}
    </div>
  )
})

function clockLine({ status, stallKind, endedAt, startedAt, lastMessageAt, now }) {
  if (endedAt === null) {
    const ms = Math.max(0, now - lastMessageAt)
    return ms < 60_000 ? buildingCopy.lastOutputSeconds(secondsAgo(ms)) : buildingCopy.lastOutputMinutes(mmss(ms))
  }
  const took = mmss(endedAt - startedAt)
  const checking = status === 'current' && stallKind !== 'building-ended'
  return checking ? buildingCopy.ended(took) : buildingCopy.endedPast(took)
}

export default function Trace({ marks, stdout, stderr, status, stallKind, endedAt, startedAt, lastMessageAt, now }) {
  const n = stdout + stderr
  return (
    <div>
      <Marks marks={marks} />
      <p className="count mt-1 max-w-[60ch] text-small text-quiet">{buildingCopy.counts(n, stderr)}</p>
      <p className="clock mt-1 max-w-[60ch] text-small">
        {clockLine({ status, stallKind, endedAt, startedAt, lastMessageAt, now })}
      </p>
    </div>
  )
}
