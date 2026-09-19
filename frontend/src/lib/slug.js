// Three lowercase hostname-safe words, hyphenated, so the client can subscribe
// to logs:<slug> before the POST is sent.

const ADJECTIVES = [
  'fluffy', 'quiet', 'brisk', 'gentle', 'sturdy', 'clever', 'sleepy', 'nimble',
  'bright', 'calm', 'eager', 'humble', 'lively', 'merry', 'proud', 'swift',
  'tidy', 'witty', 'bold', 'keen', 'plain', 'rapid', 'shy', 'warm',
]

const COLOURS = [
  'red', 'blue', 'green', 'amber', 'olive', 'teal', 'coral', 'slate',
  'ivory', 'pine', 'sage', 'rust', 'plum', 'ochre', 'navy', 'moss',
]

const ANIMALS = [
  'cat', 'otter', 'heron', 'fox', 'hare', 'lynx', 'mole', 'newt',
  'owl', 'pika', 'quail', 'seal', 'tern', 'vole', 'wren', 'yak',
  'bear', 'crane', 'deer', 'finch', 'goat', 'ibis', 'koala', 'moth',
]

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export function generateSlug() {
  return `${pick(ADJECTIVES)}-${pick(COLOURS)}-${pick(ANIMALS)}`
}
