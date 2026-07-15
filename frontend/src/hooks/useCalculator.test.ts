import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalculatorApiError } from '../api/client'
import { initialState, reducer, useCalculator } from './useCalculator'

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/client')>()
  return { ...original, calculate: vi.fn() }
})

import { calculate } from '../api/client'
const calculateMock = vi.mocked(calculate)

beforeEach(() => {
  calculateMock.mockReset()
})

describe('reducer: input editing', () => {
  it('starts with a zero display', () => {
    expect(initialState.display).toBe('0')
  })

  it('replaces the leading zero with the first digit', () => {
    const s = reducer(initialState, { type: 'DIGIT', digit: '7' })
    expect(s.display).toBe('7')
  })

  it('appends subsequent digits', () => {
    let s = reducer(initialState, { type: 'DIGIT', digit: '1' })
    s = reducer(s, { type: 'DIGIT', digit: '2' })
    expect(s.display).toBe('12')
  })

  it('adds a decimal point once', () => {
    let s = reducer(initialState, { type: 'DIGIT', digit: '1' })
    s = reducer(s, { type: 'DECIMAL' })
    s = reducer(s, { type: 'DIGIT', digit: '5' })
    s = reducer(s, { type: 'DECIMAL' })
    expect(s.display).toBe('1.5')
  })

  it('starts a decimal entry with a leading zero', () => {
    const s = reducer(initialState, { type: 'DECIMAL' })
    expect(s.display).toBe('0.')
  })

  it('caps entry length at 15 characters', () => {
    let s = initialState
    for (let i = 0; i < 20; i++) s = reducer(s, { type: 'DIGIT', digit: '9' })
    expect(s.display).toHaveLength(15)
  })

  it('toggles the sign of the current entry', () => {
    let s = reducer(initialState, { type: 'DIGIT', digit: '5' })
    s = reducer(s, { type: 'TOGGLE_SIGN' })
    expect(s.display).toBe('-5')
    s = reducer(s, { type: 'TOGGLE_SIGN' })
    expect(s.display).toBe('5')
  })

  it('backspace removes the last character and bottoms out at zero', () => {
    let s = reducer(initialState, { type: 'DIGIT', digit: '1' })
    s = reducer(s, { type: 'DIGIT', digit: '2' })
    s = reducer(s, { type: 'BACKSPACE' })
    expect(s.display).toBe('1')
    s = reducer(s, { type: 'BACKSPACE' })
    expect(s.display).toBe('0')
  })

  it('clear resets everything', () => {
    let s = reducer(initialState, { type: 'DIGIT', digit: '9' })
    s = reducer(s, { type: 'SET_OPERATOR', operator: 'add' })
    s = reducer(s, { type: 'CLEAR' })
    expect(s).toEqual(initialState)
  })

  it('typing after a result starts a fresh entry', () => {
    let s = reducer(initialState, { type: 'EVALUATE_SUCCESS', result: 42 })
    expect(s.display).toBe('42')
    s = reducer(s, { type: 'DIGIT', digit: '3' })
    expect(s.display).toBe('3')
  })

  it('typing clears a previous error', () => {
    let s = reducer(initialState, { type: 'EVALUATE_FAILURE', message: 'boom' })
    expect(s.error).toBe('boom')
    s = reducer(s, { type: 'DIGIT', digit: '3' })
    expect(s.error).toBeNull()
  })
})

describe('useCalculator: evaluation', () => {
  it('evaluates a binary expression via the backend', async () => {
    calculateMock.mockResolvedValue(5)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('2'))
    await act(async () => result.current.pressOperator('add'))
    act(() => result.current.pressDigit('3'))
    await act(async () => result.current.pressEquals())

    expect(calculateMock).toHaveBeenCalledWith('add', 2, 3, expect.any(AbortSignal))
    expect(result.current.state.display).toBe('5')
    expect(result.current.state.error).toBeNull()
  })

  it('clear aborts the in-flight request and keeps the reset state', async () => {
    let capturedSignal: AbortSignal | undefined
    calculateMock.mockImplementation(
      (_op, _a, _b, signal) =>
        new Promise<number>((_resolve, reject) => {
          capturedSignal = signal
          signal?.addEventListener('abort', () =>
            reject(new CalculatorApiError('aborted', 'The request was cancelled')),
          )
        }),
    )
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('2'))
    await act(async () => result.current.pressOperator('add'))
    act(() => result.current.pressDigit('3'))
    act(() => {
      void result.current.pressEquals() // in flight, deliberately not awaited
    })
    await act(async () => result.current.clear())

    expect(capturedSignal?.aborted).toBe(true)
    expect(result.current.state.display).toBe('0')
    expect(result.current.state.error).toBeNull()
    expect(result.current.state.loading).toBe(false)
  })

  it('a new evaluation aborts the previous in-flight request', async () => {
    const signals: (AbortSignal | undefined)[] = []
    calculateMock
      .mockImplementationOnce(
        (_op, _a, _b, signal) =>
          new Promise<number>((_resolve, reject) => {
            signals.push(signal)
            signal?.addEventListener('abort', () =>
              reject(new CalculatorApiError('aborted', 'The request was cancelled')),
            )
          }),
      )
      .mockImplementationOnce((_op, _a, _b, signal) => {
        signals.push(signal)
        return Promise.resolve(3)
      })
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('9'))
    await act(async () => result.current.pressOperator('add'))
    act(() => result.current.pressDigit('9'))
    act(() => {
      void result.current.pressEquals() // first request, stays pending
    })
    await act(async () => result.current.pressSqrt()) // second request wins

    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(result.current.state.display).toBe('3')
    expect(result.current.state.error).toBeNull()
  })

  it('chains operators by evaluating the pending expression first', async () => {
    calculateMock.mockResolvedValue(5)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('2'))
    await act(async () => result.current.pressOperator('add'))
    act(() => result.current.pressDigit('3'))
    await act(async () => result.current.pressOperator('multiply'))

    expect(calculateMock).toHaveBeenCalledWith('add', 2, 3, expect.any(AbortSignal))
    expect(result.current.state.display).toBe('5')

    calculateMock.mockResolvedValue(20)
    act(() => result.current.pressDigit('4'))
    await act(async () => result.current.pressEquals())
    expect(calculateMock).toHaveBeenLastCalledWith('multiply', 5, 4, expect.any(AbortSignal))
    expect(result.current.state.display).toBe('20')
  })

  it('applies sqrt to the current entry immediately', async () => {
    calculateMock.mockResolvedValue(3)
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('9'))
    await act(async () => result.current.pressSqrt())

    expect(calculateMock).toHaveBeenCalledWith('sqrt', 9, undefined, expect.any(AbortSignal))
    expect(result.current.state.display).toBe('3')
  })

  it('shows the backend error message on domain errors', async () => {
    calculateMock.mockRejectedValue(
      new CalculatorApiError('division_by_zero', 'cannot divide by zero'),
    )
    const { result } = renderHook(() => useCalculator())

    act(() => result.current.pressDigit('8'))
    await act(async () => result.current.pressOperator('divide'))
    act(() => result.current.pressDigit('0'))
    await act(async () => result.current.pressEquals())

    expect(result.current.state.error).toBe('cannot divide by zero')
  })

  it('does nothing on equals without a pending operation', async () => {
    const { result } = renderHook(() => useCalculator())
    act(() => result.current.pressDigit('7'))
    await act(async () => result.current.pressEquals())
    expect(calculateMock).not.toHaveBeenCalled()
    expect(result.current.state.display).toBe('7')
  })
})
