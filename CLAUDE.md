# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (from `backend/`):

```sh
go run ./cmd/server                                  # start API on :8080
go test ./...                                        # all tests
go test ./internal/api/ -run TestRateLimit           # single test (by name regex)
go test -race ./... -coverprofile=coverage.out       # what CI runs
go tool cover -func=coverage.out                     # coverage summary
```

Frontend (from `frontend/`):

```sh
npm run dev              # Vite dev server on :5173, proxies /api to :8080
npm test                 # all tests (vitest run)
npx vitest run src/hooks/useCalculator.test.ts       # single file
npx vitest run -t 'aborts the in-flight'             # single test by name
npm run test:coverage    # v8 coverage
npm run lint             # oxlint
npm run build            # tsc -b && vite build (type-checks; `npm test` does not)
```

Full stack: `docker compose up --build` → http://localhost:3000.

## Architecture

Two independent programs joined only by the JSON contract of `POST /api/v1/calculate`. The frontend never computes; every `=`/`√` press is an HTTP call.

**Error contract is the through-line.** Understanding one request end-to-end requires these files in order:

1. `backend/internal/calculator/calculator.go` — pure domain. An operation registry (`map[Operation]opSpec` with arity) plus sentinel errors (`ErrDivisionByZero`, `ErrNegativeSqrt`, `ErrNotFinite`, `ErrUnknownOperation`). No HTTP knowledge.
2. `backend/internal/api/handler.go` — maps sentinels to status codes: malformed/missing input → `400 bad_request`, domain errors → `422` with machine codes (`division_by_zero`, …), always the `{"error":{"code","message"}}` envelope. Request bodies must be exactly one JSON object (`DisallowUnknownFields` + require-EOF check), operands are `*float64` to distinguish missing from `0`.
3. `frontend/src/api/client.ts` — parses that envelope into a typed `CalculatorApiError{code}`; runtime-validates response shapes (`isCalculateResponse`/`isErrorBody`) instead of trusting casts. Distinct codes for `network_error`, `unexpected_response`, and `aborted`.
4. `frontend/src/hooks/useCalculator.ts` — all calculator behavior lives in this reducer + hook; components (`src/components/`) are thin renderers. The UI shows the backend's error `message` verbatim — domain validation is deliberately server-only, never duplicated client-side.

**Adding an operation** touches: registry entry + tests in `calculator.go`/`calculator_test.go`, the `Operation` union and `BINARY_OPERATIONS` in `frontend/src/types.ts`, a key in `Keypad.tsx` (plus `KEY_OPERATORS` in `Calculator.tsx` for a keyboard binding), and README's op list. No routing or handler changes — that's the point of the single endpoint.

**Cancellation semantics.** `useCalculator` keeps one `AbortController`: each new evaluation aborts the in-flight one, `C` and unmount abort too. Aborted calls return `null` without dispatching, so a stale response can never overwrite newer state. Client maps fetch aborts to code `aborted` — treat that code as "not an error" anywhere it surfaces.

**Same-origin `/api` everywhere.** Vite dev proxy (`vite.config.ts`) and nginx (`frontend/nginx.conf`) both forward `/api` to the Go server, so CORS only matters for direct cross-origin API access (`CORS_ORIGIN` env, default the dev origin).

**Rate limiting** (`backend/internal/api/ratelimit.go`): per-IP token buckets via `golang.org/x/time/rate` — the only non-stdlib backend dependency; keep it that way absent strong reason. `RATE_LIMIT_RPS=0` disables; `/healthz` is exempt. Behind the nginx container all clients share one IP (known limitation).

## Conventions

- TDD is the working style here: tests were written first for every layer (table-driven in Go, mocked-client Vitest for the hook). Watch new tests fail before implementing.
- Backend accessible test seams: `NewHandler(Config{...})` for httptest servers; middleware are plain `func(http.Handler) http.Handler` and testable in isolation.
- Component tests select buttons by accessible name (`aria-label`: `add`, `equals`, `square root`, …) — keep labels stable or update tests with them.
- The hook's `calculate` mock assertions include the trailing `AbortSignal` arg: `toHaveBeenCalledWith('add', 2, 3, expect.any(AbortSignal))`.
- `percentage(a, b)` means "a percent of b" (`a*b/100`); results are display-rounded to 12 significant digits in `formatResult`.
- CI (`.github/workflows/ci.yml`) runs backend `go test -race` + coverage and frontend lint/build/coverage; keep both green.
