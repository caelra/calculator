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

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

function isCalculateResponse(value: unknown): value is CalculateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value &&
    typeof value.result === 'number' &&
    Number.isFinite(value.result)
  )
}

async function readJSON(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new CalculatorApiError(
      'unexpected_response',
      `Unexpected response from the calculator service (HTTP ${response.status})`,
    )
  }
}

/** Calls the backend to apply an operation. Unary operations omit b. */
export async function calculate(
  operation: Operation,
  a: number,
  b?: number,
  signal?: AbortSignal,
): Promise<number> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}/v1/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b === undefined ? { operation, a } : { operation, a, b }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new CalculatorApiError('aborted', 'The request was cancelled')
    }
    throw new CalculatorApiError('network_error', 'Cannot reach the calculator service')
  }

  if (!response.ok) {
    const body = await readJSON(response)
    if (!isErrorBody(body)) {
      throw new CalculatorApiError(
        'unexpected_response',
        `Unexpected response from the calculator service (HTTP ${response.status})`,
      )
    }
    throw new CalculatorApiError(body.error.code, body.error.message)
  }

  const body = await readJSON(response)
  if (!isCalculateResponse(body)) {
    throw new CalculatorApiError(
      'unexpected_response',
      'The calculator service returned an invalid result',
    )
  }
  return body.result
}
