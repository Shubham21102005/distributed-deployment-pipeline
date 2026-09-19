// parseMessage(raw) returns a typed event. No React.
//
// Every socket `message` is a string: either the plain 'joined: logs:<slug>'
// ack, or JSON {"log": "..."} from the build container. Regexes are hoisted;
// the first match wins.
//
// The stage regexes tolerate an OPTIONAL `logs:`/`log:` prefix, so the ledger
// advances whether the builder prefixes its lines (`logs: Build started`) or
// sends them bare (`Build started`). Every result also carries `line`: the raw
// unwrapped text, so the log card can show exactly what came over the wire.

const JOINED_RE = /^joined:\s*logs:/i
const BUILD_STARTED_RE = /^(?:logs?:\s*)?build started$/i
const BUILD_ENDED_RE = /^(?:logs?:\s*)?build complete$/i
const UPLOAD_STARTED_RE = /^(?:logs?:\s*)?starting upload$/i
const FILE_UPLOADING_RE = /^(?:logs?:\s*)?uploading:\s*(.+)$/i
const FILE_UPLOADED_RE = /^(?:logs?:\s*)?uploaded:\s*(.+)$/i
const COMPLETED_RE = /^(?:logs?:\s*)?completed$/i
const STDERR_RE = /^error:\s*(.*)$/i
// A stdout tick: `logs: ` or `Log: `. Content is usually empty because the
// backend drops npm's real output (the two-argument publishLog bug).
const TICK_RE = /^logs?:\s*(.*)$/i
const LOGS_PREFIX_RE = /^logs?:\s*/i

/** Events that move the ledger to a later stage; the hook flushes these at once. */
export const STAGE_EVENTS = new Set(['build-started', 'build-ended', 'upload-started', 'completed'])

export function parseMessage(raw) {
  let text
  try {
    const parsed = JSON.parse(raw)
    text = parsed && typeof parsed === 'object' && 'log' in parsed ? parsed.log : parsed
  } catch {
    text = raw
  }
  text = String(text ?? '').trim()

  let m
  if (JOINED_RE.test(text)) return { type: 'joined', line: text }
  if (BUILD_STARTED_RE.test(text)) return { type: 'build-started', line: text }
  if (BUILD_ENDED_RE.test(text)) return { type: 'build-ended', line: text }
  if (UPLOAD_STARTED_RE.test(text)) return { type: 'upload-started', line: text }
  if ((m = FILE_UPLOADING_RE.exec(text))) return { type: 'file-uploading', path: m[1].trim(), line: text }
  if ((m = FILE_UPLOADED_RE.exec(text))) return { type: 'file-uploaded', path: m[1].trim(), line: text }
  if (COMPLETED_RE.test(text)) return { type: 'completed', line: text }
  if ((m = STDERR_RE.exec(text))) return { type: 'stderr', text: m[1].trim(), line: text }
  if ((m = TICK_RE.exec(text))) return { type: 'stdout', text: m[1].trim(), line: text }
  return { type: 'text', text: text.replace(LOGS_PREFIX_RE, ''), line: text }
}
