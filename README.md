# distributed-deployment-pipeline

Paste a public Git URL for a static site, and this deploys it: a container clones the
repo, runs `npm install && npm run build`, uploads `dist/` to S3, and serves the result
at `http://<slug>.localhost:8000`. The build streams to the browser line by line while it
runs. It's a self-hosted take on what Vercel or Netlify do for a static build, wired
together from four small Node services and AWS (ECS Fargate, S3, ECR) plus Redis.

## How a deploy flows

```
  Browser (frontend, :5173)
      │  POST /api/project  { gitURL }
      ▼
  API  (:5000 HTTP, :5001 socket.io)
      │  ECS RunTask (Fargate)
      ▼
  Build container  ──►  git clone ──► npm install ──► npm run build ──► upload dist/ to S3
      │  publish  logs:<slug>                                              (__output/<slug>/…)
      ▼
  Redis  ──►  API forwards each line over socket.io  ──►  Browser log stream

  Visitor  ──►  http://<slug>.localhost:8000  ──►  reverse proxy (:8000)  ──►  S3 __output/<slug>/
```

Step by step:

1. The browser sends `POST /project` with the repository URL. The API generates a slug
   (three hyphenated words, e.g. `sturdy-olive-seal`) unless one is supplied, then calls
   ECS `RunTask` to launch one Fargate build container and immediately responds with
   `{ status: "queued", data: { projectSlug, url } }`. "Queued" means the task was
   requested, not that the build has started — the container takes tens of seconds to boot.
2. The container (`build-server`) clones the repo into `/home/app/output`, runs the build,
   and uploads every file under `dist/` to `s3://auto-deployment-project-output/__output/<slug>/`.
   For each step it publishes a log line to the Redis channel `logs:<slug>`.
3. The API holds one pattern subscription (`psubscribe logs:*`) and forwards each line to
   whichever socket.io clients joined the room `logs:<slug>`. The browser subscribed to that
   room before the build began, so it sees the log in real time.
4. A visitor opening `http://<slug>.localhost:8000` hits the reverse proxy, which maps the
   first hostname label (`<slug>`) to the S3 prefix and streams the files back. A request
   for `/` is rewritten to `/index.html`.

## Services

| Directory | What it is | Port | Runs on |
| --- | --- | --- | --- |
| `frontend/` | React + Vite + Tailwind UI: enter a URL, watch the build, open the site. | 5173 (dev) | Your machine |
| `api/` | Express server. `POST /project` launches the build; socket.io relays logs from Redis. | 5000 HTTP, 5001 socket | Your machine |
| `build-server/` | The build container image: clone, build, upload to S3, publish logs. | — | ECS Fargate |
| `reverse-proxy/` | Maps `<slug>.localhost:8000` to the matching S3 prefix and serves the files. | 8000 | Your machine |

`frontend/` and `build-server/` each have their own README with detail specific to them.

## Prerequisites

On AWS (region `ap-south-1`):

- An **ECR repository** named `build-server` for the build image.
- An **ECS cluster** and a **Fargate task definition** whose task's container is named
  `builder-image` and points at that image. The API references the cluster and task by ARN,
  and names `builder-image` when it passes per-run environment overrides.
- An **S3 bucket** `auto-deployment-project-output`, readable over HTTP for the deployed
  sites. Files land under `__output/<slug>/`.
- A **VPC subnet set and security group** the Fargate task launches into. These are listed
  in `api/index.js`; change them to match your account.
- An IAM user whose keys can call `ecs:RunTask`, `s3:PutObject`, and pull from ECR.

Locally:

- Node 20+ and npm
- Docker (to build and push the build image)
- AWS CLI v2 (for ECR login)
- A reachable Redis or Valkey instance for the log pub/sub

## Configuration

Each Node service reads its own `.env`. The build container gets its environment at runtime
from the API's `RunTask` call, not from a checked-in file.

`api/.env`

| Variable | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY` | Credentials for `RunTask`, also forwarded to the build container. |
| `CLUSTER_ARN` | ECS cluster to run the build task in. |
| `TASK_ARN` | Task definition to launch. |
| `REDIS_URL` | Redis/Valkey connection string for the log subscription. |
| `PROXY_PORT` | Port used to build the returned site URL. Defaults to `8000`; keep it matched to the reverse proxy. |

`build-server/.env` holds `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, and `REDIS_URL` for
local runs; in production the API supplies these plus `GIT_REPOSITORY_URL` and `PROJECT_ID`
as container overrides. The reverse proxy needs no environment; its bucket and region are
set in `reverse-proxy/index.js`.

## Running it

Build and push the build-server image once (and again whenever `build-server/` changes):

```bash
cd build-server
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t build-server .
docker tag build-server:latest <account-id>.dkr.ecr.ap-south-1.amazonaws.com/build-server:latest
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/build-server:latest
```

The task definition pulls `:latest`, so a new push is picked up on the next deploy without a
new task revision. On Windows, run the ECR login in Git Bash — PowerShell re-encodes the piped
token and the login fails with a 400.

Then start the three local services, each in its own terminal:

```bash
cd reverse-proxy && npm install && node index.js   # :8000
cd api           && npm install && npm run dev      # :5000 HTTP, :5001 socket
cd frontend      && npm install && npm run dev      # :5173
```

Open `http://localhost:5173`, paste a public repository URL, and deploy. The Vite dev server
proxies `/api` to the API on `:5000`, so no CORS setup is needed. `*.localhost` resolves to
`127.0.0.1` in modern browsers, so the deployed-site links work without editing your hosts file.

## API

**`POST /project`** — body `{ "gitURL": "https://github.com/you/site", "slug"?: "custom-slug" }`

- `200` → `{ "status": "queued", "data": { "projectSlug": "<slug>", "url": "http://<slug>.localhost:8000" } }`
- `400` → `{ "error": "gitURL is required" }`

**socket.io** on `:5001` — the client emits `subscribe` with the string `logs:<slug>` to join
that build's room, then receives `message` events. The first is the plain string
`joined: logs:<slug>`; every later one is JSON of the form `{"log":"..."}`. Subscribe before
the build starts, because Redis pub/sub has no history.
