// Label + input + primary button + "Use a sample repository" text button.
// Runs the two client-side checks, renders the validation note and the
// request-failed note (focus moves to it), and calls deploy(url).

import { useEffect, useRef, useState } from 'react'
import { SAMPLE_REPO_URL } from '../lib/config.js'
import { copy, requestFailed } from '../lib/copy.js'
import { preloadSocketClient } from '../hooks/useDeploy.js'

const SCHEME_RE = /^https?:\/\/\S+$/i
const INPUT_ID = 'repo-url'
const NOTE_ID = 'repo-url-note'

function requestErrorText(err) {
  switch (err.kind) {
    case '400':
      return requestFailed[400](err.reason)
    case '500':
      return err.excerpt ? requestFailed[500](err.excerpt) : copy.requestFailed500NoExcerpt
    case 'other':
      return requestFailed.other(err.status)
    case 'timeout':
      return copy.requestFailedTimeout
    default:
      return copy.requestFailedNetwork
  }
}

export default function DeployForm({ deploy, pending, requestError, inputRef }) {
  const [value, setValue] = useState('')
  const [validation, setValidation] = useState(null)
  const submitRef = useRef(null)
  const noteRef = useRef(null)

  // The request-failed note is announced by moving focus to it.
  const failedAt = requestError ? requestError.at : 0
  useEffect(() => {
    if (failedAt && noteRef.current) noteRef.current.focus()
  }, [failedAt])

  // Disabling the focused submit button while pending drops focus to <body> (the focus-fixup
  // rule). When the request succeeds, put focus back on the button so a keyboard user keeps
  // their place; the failure path moves focus to the note instead.
  const wasPendingRef = useRef(false)
  useEffect(() => {
    const wasPending = wasPendingRef.current
    wasPendingRef.current = pending
    if (wasPending && !pending && requestError === null && document.activeElement === document.body) {
      submitRef.current?.focus({ preventScroll: true })
    }
  }, [pending, requestError])

  function onSubmit(event) {
    event.preventDefault()
    if (pending) return
    const url = value.trim()
    if (url === '') {
      setValidation('empty')
      inputRef.current?.focus()
      return
    }
    if (!SCHEME_RE.test(url)) {
      setValidation('scheme')
      inputRef.current?.focus()
      return
    }
    setValidation(null)
    deploy(url)
  }

  function onChange(event) {
    setValue(event.target.value)
    setValidation(null)
  }

  function useSampleRepository() {
    setValue(SAMPLE_REPO_URL)
    setValidation(null)
    submitRef.current?.focus()
  }

  const validationText =
    validation === 'empty' ? copy.validationEmpty : validation === 'scheme' ? copy.validationScheme : null
  const invalid = validationText !== null || (requestError !== null && !pending)
  const showRequestError = validationText === null && requestError !== null && !pending

  return (
    <form className="max-w-[720px]" noValidate onSubmit={onSubmit}>
      <label htmlFor={INPUT_ID} className="block text-small font-semibold">
        {copy.inputLabel}
      </label>
      <div className="mt-2 flex flex-col gap-2 md:flex-row md:gap-3">
        <input
          ref={inputRef}
          id={INPUT_ID}
          name="gitURL"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus // single-purpose page with one input; the demo starts by pasting
          placeholder={copy.inputPlaceholder}
          value={value}
          onChange={onChange}
          onFocus={preloadSocketClient}
          readOnly={pending}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={invalid ? NOTE_ID : undefined}
          className="field h-12 min-w-0 px-[14px] md:flex-1 text-address-sm md:h-13 md:text-address"
        />
        <button
          ref={submitRef}
          type="submit"
          disabled={pending}
          aria-busy={pending ? 'true' : undefined}
          className="primary-button grid h-12 shrink-0 place-items-center px-5 text-body md:h-13"
        >
          <span className="col-start-1 row-start-1">{pending ? copy.pendingAction : copy.primaryAction}</span>
          {/* Invisible widest label, so the row does not reflow when the label swaps to "Deploying…". */}
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">
            {copy.primaryAction}
          </span>
        </button>
      </div>
      {validationText !== null ? (
        <p id={NOTE_ID} role="alert" className="mt-2 max-w-[60ch] text-small text-failed">
          {validationText}
        </p>
      ) : null}
      {showRequestError ? (
        <p id={NOTE_ID} ref={noteRef} tabIndex={-1} className="wrap-any mt-2 max-w-[60ch] text-failed">
          {requestErrorText(requestError)}
        </p>
      ) : null}
      <button type="button" className="text-button mt-2" onClick={useSampleRepository}>
        {copy.sampleAction}
      </button>
    </form>
  )
}
