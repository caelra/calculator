import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculate, CalculatorApiError } from './client'

function mockFetchOnce(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  return globalThis.fetch as ReturnType<typeof vi.fn>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('calculate', () => {
  it('returns the result on success', async () => {
    const fetchMock = mockFetchOnce(200, { result: 5 })

    await expect(calculate('add', 2, 3)).resolves.toBe(5)

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'add', a: 2, b: 3 }),
    })
  })

  it('omits b for unary operations', async () => {
    const fetchMock = mockFetchOnce(200, { result: 3 })

    await expect(calculate('sqrt', 9)).resolves.toBe(3)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toEqual({ operation: 'sqrt', a: 9 })
  })

  it('throws a typed error with the backend code and message', async () => {
    mockFetchOnce(422, {
      error: { code: 'division_by_zero', message: 'cannot divide by zero' },
    })

    const promise = calculate('divide', 10, 0)
    await expect(promise).rejects.toBeInstanceOf(CalculatorApiError)
    await promise.catch((err: CalculatorApiError) => {
      expect(err.code).toBe('division_by_zero')
      expect(err.message).toBe('cannot divide by zero')
    })
  })

  it('throws a generic error when the error body is not parseable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('gateway broke', { status: 502 })),
    )

    await expect(calculate('add', 1, 2)).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })

  it('throws a generic error when the error envelope has the wrong shape', async () => {
    mockFetchOnce(500, { message: 'gateway broke' })

    await expect(calculate('add', 1, 2)).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })

  it('rejects a successful response with an invalid result', async () => {
    mockFetchOnce(200, { result: 'five' })

    await expect(calculate('add', 2, 3)).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })

  it('throws a network error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(calculate('add', 1, 2)).rejects.toMatchObject({
      code: 'network_error',
    })
  })

  it('forwards an abort signal to fetch', async () => {
    const fetchMock = mockFetchOnce(200, { result: 5 })
    const controller = new AbortController()

    await calculate('add', 2, 3, controller.signal)

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('maps an aborted request to the aborted code, not a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')),
    )
    const controller = new AbortController()
    controller.abort()

    await expect(calculate('add', 1, 2, controller.signal)).rejects.toMatchObject({
      code: 'aborted',
    })
  })
})
