import type { ApiErrorBody, CalculateResponse, Operation } from '../types'

// Same-origin by default: the Vite dev server and the nginx container both
// proxy /api to the Go backend. Override with VITE_API_URL if needed.
const BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api'

/** Error carrying the backend's machine-readable code plus a human message. */
export class CalculatorApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CalculatorApiError'
    this.code = code
  }
}

/** Calls the backend to apply an operation. Unary operations omit b. */
export async function calculate(
  operation: Operation,
  a: number,
  b?: number,
): Promise<number> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}/v1/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b === undefined ? { operation, a } : { operation, a, b }),
    })
  } catch {
    throw new CalculatorApiError('network_error', 'Cannot reach the calculator service')
  }

  if (!response.ok) {
    let body: ApiErrorBody
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      throw new CalculatorApiError(
        'unexpected_response',
        `Unexpected response from the calculator service (HTTP ${response.status})`,
      )
    }
    throw new CalculatorApiError(body.error.code, body.error.message)
  }

  const body = (await response.json()) as CalculateResponse
  return body.result
}
