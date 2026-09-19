# frontend

The deploy page for the pipeline: paste a public repository URL, watch the build report in, open the deployed site.

## Run

```
npm install
npm run dev
```

Other scripts: `npm run build` (production bundle in `dist/`), `npm run lint`, `npm run preview`.

## Ports it expects

| Port | What | How the page reaches it |
|---|---|---|
| 5000 | Express API (`api/index.js`) | `POST /api/project`, proxied by `vite.config.js` to `http://localhost:5000/project` (the API has no CORS) |
| 5001 | socket.io log server (same process as the API) | `io("http://localhost:5001")`, `emit("subscribe", "logs:<slug>")`, listens for `message` |
| 8000 | reverse proxy serving deployed sites | the link at the end of a deploy, `http://<slug>.localhost:8000` |

The slug is generated client-side (`src/lib/slug.js`) and sent as `slug` so the socket can subscribe before the POST.

## Reviewing without AWS: `?mock=<scenario>`

In dev only, adding `?mock=<scenario>` to the URL replaces the socket and the POST with a scripted, time-compressed replay of the exact strings the backend sends. It goes through the same parser and reducer as a real deploy. Press Deploy with any URL.

| URL | What you see |
|---|---|
| `http://localhost:5173/?mock=happy` | queued for ~3s, a build trace of ~70 chunks, 8 file uploads, Deployed |
| `http://localhost:5173/?mock=stall-build` | stops after the build step ends; the stall appears within ~6s |
| `http://localhost:5173/?mock=stall-queued` | the container never starts; the queued stall appears within ~6s |
| `http://localhost:5173/?mock=fail-400` | the API rejects the request with a JSON reason |
| `http://localhost:5173/?mock=fail-500` | the API returns Express's HTML 500 page; the first line is quoted |
| `http://localhost:5173/?mock=disconnect` | the log socket drops mid-build for 3s, reconnects, and the build resumes |

The mock lives in `src/dev/mockRun.js` and is loaded through a dynamic import guarded by `import.meta.env.DEV`, so it is not in production bundles.

## Where things live

- `src/index.css` holds the design tokens (Tailwind v4 `@theme`: six colours, two font families, five type sizes, one radius) and all custom CSS. There is no `tailwind.config.js`.
- `src/lib/copy.js` holds every visible string.
- `src/lib/config.js` holds the API path, socket URL, timeouts, and `SAMPLE_REPO_URL` (set it to a public Vite repository you have verified builds to `dist/`).
- `src/hooks/useDeploy.js` and `src/hooks/deployReducer.js` hold the deploy lifecycle and state machine.
- `DESIGN.md` is the design brief the page is built to.
