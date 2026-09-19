// The page: <main> container with the header grid (h1, supporting line, form)
// and the ledger. Owns the single useDeploy() call and sets document.title.

import { useCallback, useEffect, useRef } from 'react'
import DeployForm from './components/DeployForm.jsx'
import Ledger from './components/Ledger.jsx'
import LogCard from './components/LogCard.jsx'
import { useDeploy } from './hooks/useDeploy.js'
import { copy, documentTitle } from './lib/copy.js'

function titleFor(state) {
  if (state.stall) return documentTitle.stalled(state.slug)
  switch (state.stage) {
    case 'requesting':
      return documentTitle.requesting()
    case 'request-failed':
      return documentTitle.requestFailed()
    case 'queued':
      return documentTitle.queued(state.slug)
    case 'building':
      return documentTitle.building(state.slug)
    case 'uploading':
      return documentTitle.uploading(state.slug)
    case 'deployed':
      return documentTitle.deployed(state.slug)
    default:
      return documentTitle.idle()
  }
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function App() {
  const { state, deploy } = useDeploy()
  const inputRef = useRef(null)

  const title = titleFor(state)
  useEffect(() => {
    document.title = title
  }, [title])

  // The Build log card is visible from the moment the container is queued and
  // stays after the deploy finishes, so the full log can be read at any time.
  const showLog = state.log.length > 0 || ['queued', 'building', 'uploading', 'deployed'].includes(state.stage)

  // Re-submitting clears the ledger, which unmounts the "Deploy again" button itself;
  // move focus to the input first so a keyboard user is not dropped on <body>. Submit
  // through the form so the URL currently in the field is used (the stall note tells the
  // user to check it first) and the same two client-side checks run.
  const deployAgain = useCallback(() => {
    const input = inputRef.current
    input?.focus({ preventScroll: true })
    input?.form?.requestSubmit()
  }, [])

  const deployAnother = useCallback(() => {
    const input = inputRef.current
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    if (input) {
      input.focus({ preventScroll: true })
      input.select()
    }
  }, [])

  return (
    <main className="mx-auto max-w-[1040px] px-4 pt-8 pb-16 md:px-12 md:pt-16 md:pb-24">
      <div className="md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-6">
        <div className="min-w-0 md:col-start-2">
          <h1 className="text-title-sm font-bold md:text-title">{copy.pageTitle}</h1>
          <p className="mt-3 max-w-[60ch]">{copy.supportingLine}</p>
          <div className="mt-8">
            <DeployForm
              deploy={deploy}
              pending={state.stage === 'requesting'}
              requestError={state.requestError}
              inputRef={inputRef}
            />
          </div>
        </div>
      </div>
      <Ledger state={state} onDeployAgain={deployAgain} onDeployAnother={deployAnother} />
      {showLog ? (
        <div className="md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-6">
          <LogCard log={state.log} />
        </div>
      ) : null}
    </main>
  )
}
