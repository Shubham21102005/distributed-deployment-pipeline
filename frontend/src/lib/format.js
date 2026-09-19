// Pure formatting helpers. No React.

/** ms to 'm:ss' (floored, never negative). */
export function mmss(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/** ms to whole seconds (floored, never negative). */
export function secondsAgo(ms) {
  return Math.max(0, Math.floor(ms / 1000))
}

export function plural(n, word) {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`
}

const HEAD_RE = /<head[\s\S]*?<\/head>/gi
const BREAK_RE = /<br\s*\/?>|<\/p>|<\/div>|<\/pre>|<\/h[1-6]>|<\/li>|<\/tr>/gi
const TAG_RE = /<[^>]*>/g
const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi
const LINE_BREAK_RE = /\r?\n/
const WS_RE = /\s+/g
const SENTENCE_RE = /^.*?[.!?](?=\s|$)/
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntity(match, body) {
  const lower = body.toLowerCase()
  if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
  if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10))
  return Object.hasOwn(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match
}

/**
 * For a 500 body from Express's default handler (HTML): drop the <head>, turn
 * block ends into newlines, strip tags and entities, take the first non-empty
 * line and truncate it. Returns '' when nothing readable survives.
 */
export function stripHtmlExcerpt(body, max = 160) {
  if (typeof body !== 'string') return ''
  const text = body
    .replace(HEAD_RE, '\n')
    .replace(BREAK_RE, '\n')
    .replace(TAG_RE, ' ')
    .replace(ENTITY_RE, decodeEntity)
  for (const raw of text.split(LINE_BREAK_RE)) {
    const line = raw.replace(WS_RE, ' ').trim()
    if (!line) continue
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
  }
  return ''
}

/** The first sentence of a note, for the status region. */
export function firstSentence(text) {
  const m = SENTENCE_RE.exec(text)
  return m ? m[0] : text
}
