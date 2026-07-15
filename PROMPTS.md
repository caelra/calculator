# AI Prompts Used

This project was built with Claude Code (Anthropic). The workflow was: plan first, then test-driven implementation, with every test watched failing before the implementation was written.

## 1. Planning prompt (initial)

> Plan the following system:
>
> Objective: Build a full-stack calculator application with a React frontend and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.
>
> [full assignment requirements: operations, React frontend with validation/error handling/responsive design, Go REST backend with edge-case handling, unit tests + coverage, README, optional Docker]
>
> I need a technical document with all the details to meet with the requirements.

Decisions made during planning (confirmed interactively):

- Include all optional features (power, sqrt, percentage, Docker).
- Single `POST /api/v1/calculate` endpoint with an operation registry, rather than per-operation endpoints.
- Go standard library only (Go 1.22+ routing), no framework.

## 2. Implementation prompts (summarized)

Implementation followed the approved plan with TDD; representative instructions given to the agent:

- "Write table-driven tests for the calculator domain package first (happy paths, division by zero, negative sqrt, unknown operation, float64 overflow), watch them fail, then implement the operation registry with sentinel errors."
- "Write httptest-based handler tests covering malformed JSON, unknown fields, missing operands, domain-error status mapping (400 vs 422), CORS preflight and panic recovery; then implement the handler and middleware."
- "Scaffold a Vite react-ts app; write tests for a typed fetch client (success, error envelope, network failure) before implementing it."
- "Implement a useCalculator reducer state machine test-first: digit entry rules, decimal handling, sign toggle, backspace, operator chaining, async equals via the mocked client, error display."
- "Build Display/Keypad/Calculator components with accessible names and keyboard support, tested with React Testing Library and user-event."
- "Add multi-stage Dockerfiles (distroless Go image, nginx-served frontend with /api proxy) and a docker-compose.yml."

## 3. Verification

- All Go and Vitest suites run with coverage; dev servers exercised with curl; the composed Docker stack exercised end-to-end in a browser.
