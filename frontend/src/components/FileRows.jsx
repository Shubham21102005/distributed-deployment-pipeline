// The per-file upload rows: path left (tabular-nums, wraps anywhere), status
// word right-aligned at 800px. "uploading" reads in currentColor, "uploaded"
// in quiet. Rows are never collapsed or scrolled; the ledger grows.

import { copy } from '../lib/copy.js'

export default function FileRows({ files }) {
  if (files.length === 0) return null
  return (
    <ul role="list" className="max-w-[800px] space-y-1 text-small">
      {files.map((f) => (
        <li key={f.path} className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="file-path wrap-any min-w-0">{f.path}</span>
          <span className={f.done ? 'ml-auto text-quiet' : 'ml-auto'}>
            {f.done ? copy.fileStatusUploaded : copy.fileStatusUploading}
          </span>
        </li>
      ))}
    </ul>
  )
}
