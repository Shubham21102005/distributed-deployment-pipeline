// Every visible string, verbatim from the brief's exact_copy. Templates take
// already-formatted values (slug, host, m:ss strings, counts).

export const copy = {
  pageTitle: 'Deploy a repository',
  supportingLine:
    'A container clones the repo, runs npm install and npm run build, and uploads dist/ to S3; each step is written below as it happens, about two minutes in all.',
  inputLabel: 'Repository URL',
  inputPlaceholder: 'https://github.com/you/site',
  primaryAction: 'Deploy repository',
  pendingAction: 'Deploying…',
  sampleAction: 'Use a sample repository',
  validationEmpty: 'Paste a repository URL first.',
  validationScheme: 'The URL needs to start with https:// so the container can clone it.',
  requestFailedNetwork: "Couldn't reach the API at localhost:5000. Start it, then deploy again.",
  requestFailedTimeout:
    "The API didn't answer within 30 seconds. Check that it's running on localhost:5000, then deploy again.",
  requestFailed500NoExcerpt:
    "Deploy didn't start. The API returned 500 while asking AWS to launch the build container. Check the API's terminal, then deploy again.",
  stageWord: {
    queued: 'Queued',
    building: 'Building',
    uploading: 'Uploading',
    deployed: 'Deployed',
  },
  queuedJoinedSuffix: 'Listening for its log.',
  queuedStallNote:
    "Nothing from the container after 3 minutes. Usually that means AWS couldn't start the task at all. Check the ECS task's stopped reason, then deploy again.",
  buildingCopyRunning:
    "npm install and npm run build are running in the container. Their output isn't forwarded yet, so each mark is one chunk npm printed: tall for stdout, short for stderr.",
  buildingCopyEnded:
    "npm install and npm run build ran in the container. Their output isn't forwarded yet, so each mark is one chunk npm printed: tall for stdout, short for stderr.",
  buildingCountsNone: 'No output yet.',
  buildingStallMidNote:
    "No output for 2 minutes and the build step hasn't ended. The container may have run out of memory or been stopped. Deploy again, or check the ECS task.",
  buildingStallEndedNote:
    "No upload started in the 2 minutes since the build step ended. That happens when there's no dist/ to upload: the clone failed (private or mistyped URL), or npm run build failed. Check the URL, run the build locally, then deploy again.",
  uploadingCopyStart: 'Copying dist/ to S3, one file at a time.',
  fileStatusUploading: 'uploading',
  fileStatusUploaded: 'uploaded',
  uploadingStallNote:
    "An upload to S3 didn't come back in 2 minutes. The builder stops at the first upload that fails, so the file still marked uploading is the one to look at. Deploy again; if it stops at the same file, check the bucket's permissions.",
  completedCaveat: "Only files that exist in dist/ resolve, so a deep link like /about won't.",
  deployAnotherAction: 'Deploy another repository',
  deployAgainAction: 'Deploy again',
  socketUnreachableNotice:
    "Couldn't connect to the log server at localhost:5001. The deploy is still running, but nothing will show here. Try the URL in about two minutes.",
  liveRegion: {
    pending: 'Deploying…',
    queued: 'Queued',
    building: 'Building',
    buildEnded: 'Build step ended',
    uploading: 'Uploading',
  },
  log: {
    heading: 'Build log',
    empty: 'Every line the build container sends appears here as it arrives.',
    tick: 'npm output (content not forwarded)',
    system: 'Connected to the log stream.',
    countSuffix: (n) => `×${n}`,
    lineCount: (n) => `${n} ${n === 1 ? 'line' : 'lines'}`,
  },
}

export const documentTitle = {
  idle: () => 'Deploy a repository',
  requesting: () => 'Deploying…',
  requestFailed: () => "Deploy didn't start",
  queued: (slug) => `Queued: ${slug}`,
  building: (slug) => `Building: ${slug}`,
  uploading: (slug) => `Uploading: ${slug}`,
  deployed: (slug) => `Deployed: ${slug}`,
  stalled: (slug) => `Stalled: ${slug}`,
}

export const requestFailed = {
  400: (reason) => `Deploy didn't start. The API said: ${reason}. Check the URL, then deploy again.`,
  500: (excerpt) =>
    `Deploy didn't start. The API returned 500 while asking AWS to launch the build container. Its response began: “${excerpt}”. Check the API's terminal, then deploy again.`,
  other: (status) => `Deploy didn't start. The API returned ${status}. Check the API's terminal, then deploy again.`,
}

export const queued = {
  copy: (slug) =>
    `AWS is starting a build container for ${slug}. Nothing arrives until it boots, usually 30 to 90 seconds.`,
  copyAfter90s: (slug) =>
    `AWS is starting a build container for ${slug}. Still starting after a minute and a half; some containers take longer, and the log begins on its own.`,
  clockRunning: (mmss) => `Waiting ${mmss}`,
  clockFrozen: (mmss) => `Waited ${mmss}`,
  futureUrl: (host) => `When it's done it'll be at ${host}.`,
}

export const building = {
  counts: (n, m) => {
    if (n === 0) return copy.buildingCountsNone
    if (m === 0) return n === 1 ? '1 chunk, none on stderr.' : `${n} chunks, none on stderr.`
    if (n === 1) return `1 chunk, ${m} on stderr (npm warnings usually land there).`
    return `${n} chunks, ${m} on stderr (npm warnings usually land there).`
  },
  lastOutputSeconds: (s) => `Last output ${s}s ago.`,
  lastOutputMinutes: (mmss) => `Last output ${mmss} ago.`,
  ended: (mmss) => `The build step ended after ${mmss}. Checking for dist/.`,
  endedPast: (mmss) => `The build step ended after ${mmss}.`,
}

export const uploading = {
  progress: (n) =>
    n === 1
      ? 'Copying dist/ to S3, one file at a time. 1 file so far.'
      : `Copying dist/ to S3, one file at a time. ${n} files so far.`,
  done: (n) => (n === 1 ? '1 file.' : `${n} files.`),
}

export const deployed = {
  headline: (n, mmss) =>
    n === 1
      ? `It's up. 1 file landed on S3 in ${mmss} and the proxy is serving it now.`
      : `It's up. ${n} files landed on S3 in ${mmss} and the proxy is serving them now.`,
  link: (host) => host,
  linkAccessibleName: (host) => `Open ${host} in a new tab`,
  liveRegion: (host) => `Deployed at ${host}`,
}

export const stall = {
  note: (kind) =>
    ({
      queued: copy.queuedStallNote,
      'building-mid': copy.buildingStallMidNote,
      'building-ended': copy.buildingStallEndedNote,
      uploading: copy.uploadingStallNote,
    })[kind],
  resumed: (quietFor, at) => `Quiet for ${quietFor}, then resumed at ${at}.`,
}

export const socket = {
  disconnected: (mmss) =>
    `Lost the log connection at ${mmss}. Reconnecting. Anything the builder prints meanwhile won't show up here.`,
  reconnected: (mmss) =>
    `Reconnected at ${mmss}. Lines printed in between are gone; if this stage doesn't move on, deploy again.`,
}
