# Full-Stack Calculator

A calculator web application: **React (TypeScript)** frontend talking to a **Go** REST backend. Supports basic arithmetic (add, subtract, multiply, divide) plus exponentiation, square root, and percentage.

```
┌──────────────────────┐        POST /api/v1/calculate        ┌──────────────────────┐
│  React + TypeScript  │  ──────────────────────────────────▶ │   Go (net/http)      │
│  Vite dev server /   │  ◀──────────────────────────────────  │                      │
│  nginx (Docker)      │        { "result": 2.5 } JSON        │  internal/api        │
│                      │                                       │  internal/calculator │
└──────────────────────┘                                       └──────────────────────┘
```

## Prerequisites

- Go ≥ 1.22 (developed with 1.25)
- Node.js ≥ 20 (developed with 24)
- Docker (optional, for the containerized setup)

## Running locally (dev)

Backend (port 8080):

```sh
cd backend
go run ./cmd/server
```

Frontend (port 5173, proxies `/api` to the backend):

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Running with Docker

```sh
docker compose up --build
```

Open http://localhost:3000. nginx serves the built frontend and proxies `/api` to the backend container.

## Tests & coverage

Backend:

```sh
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out    # or -html for a browsable report
```

Frontend:

```sh
cd frontend
npm test                # run once
npm run test:coverage   # with v8 coverage report
```

Current coverage:

| Layer | Package/scope | Coverage |
|---|---|---|
| Backend | `internal/calculator` | 100% statements |
| Backend | `internal/api` | 95.0% statements |
| Frontend | `src/` (35 tests) | 95.2% statements / 97.7% lines |

The backend suite also passes under the race detector (`go test -race ./...`), covering concurrent access to the per-IP rate limiter.

(`cmd/server` is process wiring — flags, signals, `ListenAndServe` — and is intentionally not unit-tested.)

## API

### `POST /api/v1/calculate`

Request:

```json
{ "operation": "divide", "a": 10, "b": 4 }
```

`operation` is one of `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percentage`. `sqrt` is unary — `b` is omitted. `percentage` computes *a percent of b* (`25, 200 → 50`).

Success — `200`:

```json
{ "result": 2.5 }
```

Errors — `{ "error": { "code", "message" } }` envelope:

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | malformed JSON, missing/non-numeric operands, unknown fields |
| 400 | `unknown_operation` | operation not supported |
| 422 | `division_by_zero` | divide with `b = 0` |
| 422 | `negative_sqrt` | sqrt of a negative number |
| 422 | `not_finite` | result overflows float64 or is undefined (e.g. `(-1)^0.5`) |
| 429 | `rate_limited` | client IP exceeded its request budget (see Configuration) |

Examples:

```sh
curl -s -X POST localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":2,"b":3}'
# {"result":5}

curl -s -X POST localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","a":9}'
# {"result":3}

curl -s -X POST localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":10,"b":0}'
# {"error":{"code":"division_by_zero","message":"cannot divide by zero"}}   (HTTP 422)
```

### `GET /api/v1/operations`

Lists supported operations and their arity — the discovery endpoint a client could use instead of hardcoding the op list.

### `GET /healthz`

Liveness probe, returns `200`. Exempt from rate limiting so monitors are never throttled.

## Configuration (backend env vars)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | origin allowed for cross-origin calls |
| `RATE_LIMIT_RPS` | `20` | per-IP sustained requests/second (`0` disables) |
| `RATE_LIMIT_BURST` | `40` | per-IP burst allowance |

## Design decisions

- **Single `/calculate` endpoint instead of one per operation.** One handler plus an operation registry in the domain package. Adding an operation is one registry entry + tests; no new routes, handlers, or client methods.
- **Go standard library only.** Go 1.22+ method-pattern routing (`POST /api/v1/calculate`) makes a router dependency unnecessary at this scale. Middleware is plain `func(http.Handler) http.Handler`.
- **Domain/transport split.** `internal/calculator` is pure logic returning sentinel errors; `internal/api` maps them to HTTP status codes. Each layer is tested independently (table-driven tests vs `httptest`).
- **Backend is the single source of truth for validation.** The frontend prevents malformed *input* by construction (reducer won't allow `1..2`), but domain rules (÷0, √negative) are enforced server-side only and the UI renders the server's error message. No duplicated, drift-prone validation.
- **Frontend state machine in a hook.** All calculator behavior lives in a `useReducer`-based `useCalculator` hook; components are thin renderers. The reducer is pure and unit-tested without the DOM.
- **Same-origin `/api` everywhere.** The Vite dev server and the nginx container both proxy `/api` to the Go backend, so no CORS in either normal path (a CORS middleware still allows the dev origin for direct API access).
- **422 vs 400.** Requests that are syntactically fine but mathematically invalid (÷0) return `422 Unprocessable Entity` with a machine-readable `code`; malformed requests return `400`.
- **Request cancellation instead of a scheduler.** Calculations are pure, microsecond-fast CPU work and Go's `net/http` already runs one goroutine per request, so a job queue/scheduler would add latency and failure modes for zero payoff. The async concerns that do matter are handled directly: the frontend client takes an `AbortSignal`, and `useCalculator` cancels the in-flight request whenever a new evaluation starts or `C` is pressed — a stale response can never overwrite newer state.
- **Per-IP rate limiting.** A `golang.org/x/time/rate` token bucket per client IP (the one non-stdlib backend dependency, maintained by the Go team) protects the backend from abusive concurrency; idle buckets are evicted lazily. Limitation: behind the nginx proxy all clients share the proxy's IP — for real multi-tenant deployments, derive the client key from a trusted `X-Forwarded-For` chain instead.

### Assumptions

- `percentage(a, b)` = "a percent of b" = `a·b/100`.
- Operands and results are IEEE-754 float64; results are display-rounded to 12 significant digits in the UI (`0.1 + 0.2 → 0.3`). Results outside float64 range are an error (`not_finite`), not `Infinity`.
- Chained input (`2 + 3 × 4`) evaluates left-to-right as each operator is pressed (standard calculator behavior), not with precedence.

### What I'd do with more time

- Expression history panel and a shareable calculation log.
- Playwright end-to-end test against the composed stack.
- CI workflow (test + coverage gates + image build).
- Rate limiting and request IDs in the backend middleware chain.

## Repository layout

```
backend/
  cmd/server/          entrypoint (env config, graceful shutdown)
  internal/calculator/ pure domain: operation registry, sentinel errors
  internal/api/        HTTP handlers, middleware, error mapping
frontend/
  src/api/             typed fetch client
  src/hooks/           useCalculator reducer state machine
  src/components/      Calculator, Display, Keypad
docker-compose.yml     backend + nginx-served frontend
PROMPTS.md             AI prompts used to build this
```
