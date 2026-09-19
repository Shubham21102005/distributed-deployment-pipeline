// The deploy state machine. Pure: every action carries its own `at` timestamp,
// so the reducer never reads the clock. Stamps are elapsed ms from the Deploy
// click (state.startedAt); the components format them with mmss().

import { firstSentence, mmss } from '../lib/format.js'
import { copy, deployed as deployedCopy, socket as socketCopy, stall as stallCopy } from '../lib/copy.js'
import { LOG_LINE_CAP, TRACE_DOM_CAP, hostOf } from '../lib/config.js'

const STAGE_ORDER = { queued: 0, building: 1, uploading: 2, deployed: 3 }
const LIVE_STAGES = new Set(['queued', 'building', 'uploading', 'deployed'])

export function initialState() {
  return {
    stage: 'idle',
    startedAt: 0,
    slug: '',
    url: '',
    gitURL: '',
    entries: [],
    queued: { respondedAt: 0, endedAt: null, joined: false, textLines: [] },
    building: { startedAt: 0, stdout: 0, stderr: 0, marks: [], endedAt: null, textLines: [] },
    uploading: { startedAt: 0, files: [], uploadedCount: 0, textLines: [] },
    deployed: { completedAt: 0, fileCount: 0, textLines: [] },
    // Raw log for the Build log card: every line the socket delivered, verbatim.
    // Consecutive identical lines are collapsed to one row with a repeat count.
    log: [],
    lastMessageAt: 0,
    stall: null,
    socket: 'idle',
    socketNoticeAt: 0,
    requestError: null,
    announcement: '',
  }
}

function order(stage) {
  return STAGE_ORDER[stage] ?? -1
}

function withTextLine(s, text) {
  if (!text) return s
  const key = s.stage
  return { ...s, [key]: { ...s[key], textLines: [...s[key].textLines, text] } }
}

/** Every real log line: refresh the silence clock, clear a stall, retire a reconnect notice. */
function noteActivity(s, at) {
  let next = { ...s, lastMessageAt: at }
  if (s.stall) {
    const entries = s.entries.slice()
    const last = entries.length - 1
    entries[last] = { ...entries[last], resumed: { quietFor: at - s.lastMessageAt, atMs: at - s.startedAt } }
    // Clear the announcement so a second stall of the same kind is a real text change for the live region.
    next = { ...next, entries, stall: null, announcement: '' }
  }
  if (s.socket === 'reconnected') next.socket = 'joined'
  return next
}

/** Advance monotonically to `target`, creating every skipped entry with this stamp. */
function advanceTo(s, target, at) {
  let next = s
  const stampMs = at - s.startedAt
  for (let i = order(s.stage) + 1; i <= order(target); i++) {
    const stage = Object.keys(STAGE_ORDER)[i]
    const entries = [...next.entries, { stage, stampMs, resumed: null }]
    switch (stage) {
      case 'building':
        next = {
          ...next,
          stage,
          entries,
          queued: { ...next.queued, endedAt: at },
          building: { ...next.building, startedAt: at },
          announcement: copy.liveRegion.building,
        }
        break
      case 'uploading':
        next = {
          ...next,
          stage,
          entries,
          building: { ...next.building, endedAt: next.building.endedAt ?? at },
          uploading: { ...next.uploading, startedAt: at },
          announcement: copy.liveRegion.uploading,
        }
        break
      case 'deployed':
        next = {
          ...next,
          stage,
          entries,
          deployed: { ...next.deployed, completedAt: at, fileCount: next.uploading.uploadedCount },
          announcement: deployedCopy.liveRegion(hostOf(next.url, next.slug)),
        }
        break
      default:
        break
    }
  }
  return next
}

function addFileRow(s, path, done) {
  const files = s.uploading.files
  // The builder uploads sequentially (Uploading X, then Uploaded X), so the row is almost always the last one.
  const lastIdx = files.length - 1
  const idx = lastIdx >= 0 && files[lastIdx].path === path ? lastIdx : files.findIndex((f) => f.path === path)
  let nextFiles
  if (idx === -1) nextFiles = [...files, { path, done }]
  else if (done && !files[idx].done) {
    nextFiles = files.slice()
    nextFiles[idx] = { ...files[idx], done: true }
  } else nextFiles = files
  const uploadedCount = done ? s.uploading.uploadedCount + 1 : s.uploading.uploadedCount
  return { ...s, uploading: { ...s.uploading, files: nextFiles, uploadedCount } }
}

function logKind(type) {
  if (type === 'joined') return 'system'
  if (type === 'stdout') return 'out'
  if (type === 'stderr') return 'err'
  if (type === 'text') return 'text'
  return 'event'
}

/** Record the raw wire line for the Build log card, collapsing consecutive repeats. */
function appendLog(s, ev) {
  const text = ev.line ?? ev.text ?? ''
  const kind = logKind(ev.type)
  const log = s.log
  const last = log[log.length - 1]
  if (last && last.kind === kind && last.text === text) {
    const copyArr = log.slice()
    copyArr[copyArr.length - 1] = { ...last, count: last.count + 1 }
    return { ...s, log: copyArr }
  }
  const row = { kind, text, count: 1 }
  const nextLog = log.length >= LOG_LINE_CAP ? [...log.slice(1), row] : [...log, row]
  return { ...s, log: nextLog }
}

function applyEvent(s, ev) {
  s = appendLog(s, ev)
  if (ev.type === 'joined') {
    return {
      ...s,
      queued: { ...s.queued, joined: true },
      socket: s.socket === 'connecting' ? 'joined' : s.socket,
    }
  }
  if (!LIVE_STAGES.has(s.stage)) return s

  const at = ev.at
  let next = noteActivity(s, at)

  switch (ev.type) {
    case 'build-started':
      if (order(next.stage) < STAGE_ORDER.building) next = advanceTo(next, 'building', at)
      return next

    case 'stdout':
    case 'stderr': {
      if (order(next.stage) < STAGE_ORDER.building) next = advanceTo(next, 'building', at)
      // The trace stops growing on 'Build complete'; a stray later line still resets the stall clock and shows its text.
      if (next.stage === 'building' && next.building.endedAt === null) {
        const b = next.building
        const isErr = ev.type === 'stderr'
        const marks = b.marks.length < TRACE_DOM_CAP ? [...b.marks, isErr ? 1 : 0] : b.marks
        next = {
          ...next,
          building: { ...b, marks, stdout: b.stdout + (isErr ? 0 : 1), stderr: b.stderr + (isErr ? 1 : 0) },
        }
      }
      return withTextLine(next, ev.text)
    }

    case 'build-ended':
      if (order(next.stage) < STAGE_ORDER.building) next = advanceTo(next, 'building', at)
      if (next.stage === 'building' && next.building.endedAt === null) {
        next = {
          ...next,
          building: { ...next.building, endedAt: at },
          announcement: copy.liveRegion.buildEnded,
        }
      }
      return next

    case 'upload-started':
      if (order(next.stage) < STAGE_ORDER.uploading) next = advanceTo(next, 'uploading', at)
      return next

    case 'file-uploading':
      if (order(next.stage) < STAGE_ORDER.uploading) next = advanceTo(next, 'uploading', at)
      if (next.stage === 'uploading') next = addFileRow(next, ev.path, false)
      return next

    case 'file-uploaded':
      if (order(next.stage) < STAGE_ORDER.uploading) next = advanceTo(next, 'uploading', at)
      if (next.stage === 'uploading') next = addFileRow(next, ev.path, true)
      return next

    case 'completed':
      if (order(next.stage) < STAGE_ORDER.deployed) next = advanceTo(next, 'deployed', at)
      return next

    case 'text':
      return withTextLine(next, ev.text)

    default:
      return next
  }
}

export function reducer(s, action) {
  switch (action.type) {
    case 'submit':
      return {
        ...initialState(),
        stage: 'requesting',
        startedAt: action.at,
        slug: action.slug,
        url: action.url,
        gitURL: action.gitURL,
        socket: 'connecting',
        announcement: copy.liveRegion.pending,
      }

    case 'queued':
      if (s.stage !== 'requesting') return s
      return {
        ...s,
        stage: 'queued',
        slug: action.slug,
        url: action.url,
        entries: [{ stage: 'queued', stampMs: action.at - s.startedAt, resumed: null }],
        queued: { ...s.queued, respondedAt: action.at },
        lastMessageAt: action.at,
        announcement: copy.liveRegion.queued,
      }

    case 'request-failed':
      if (s.stage !== 'requesting') return s
      return { ...s, stage: 'request-failed', requestError: { ...action.error, at: action.at }, socket: 'idle' }

    case 'events':
      return action.events.reduce(applyEvent, s)

    case 'stall': {
      if (s.stall) return s
      let kind
      if (s.stage === 'queued') kind = 'queued'
      else if (s.stage === 'building') kind = s.building.endedAt === null ? 'building-mid' : 'building-ended'
      else if (s.stage === 'uploading') kind = 'uploading'
      else return s
      return { ...s, stall: { kind, since: action.at }, announcement: firstSentence(stallCopy.note(kind)) }
    }

    case 'socket-connect': {
      if (s.stage === 'deployed') return s
      if (s.socket !== 'disconnected' && s.socket !== 'unreachable') return s
      const atMs = action.at - s.startedAt
      return { ...s, socket: 'reconnected', socketNoticeAt: atMs, announcement: socketCopy.reconnected(mmss(atMs)) }
    }

    case 'socket-disconnect': {
      if (s.stage === 'deployed') return s
      if (!LIVE_STAGES.has(s.stage) && s.stage !== 'requesting') return s
      const atMs = action.at - s.startedAt
      return { ...s, socket: 'disconnected', socketNoticeAt: atMs, announcement: socketCopy.disconnected(mmss(atMs)) }
    }

    case 'socket-unreachable':
      if (s.socket !== 'connecting') return s
      return { ...s, socket: 'unreachable', socketNoticeAt: action.at - s.startedAt, announcement: copy.socketUnreachableNotice }

    default:
      return s
  }
}
