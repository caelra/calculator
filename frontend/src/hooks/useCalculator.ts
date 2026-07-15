import { useCallback, useEffect, useReducer, useRef } from 'react'
import { calculate, CalculatorApiError } from '../api/client'
import type { BinaryOperation, Operation } from '../types'

const MAX_ENTRY_LENGTH = 15

export interface CalculatorState {
  /** Current entry or last result, as displayed. */
  display: string
  /** Left operand captured when an operator was pressed. */
  previous: number | null
  pendingOp: BinaryOperation | null
  /** When true the next digit replaces the display instead of appending. */
  overwrite: boolean
  error: string | null
  loading: boolean
}

export const initialState: CalculatorState = {
  display: '0',
  previous: null,
  pendingOp: null,
  overwrite: false,
  error: null,
  loading: false,
}

export type CalculatorAction =
  | { type: 'DIGIT'; digit: string }
  | { type: 'DECIMAL' }
  | { type: 'TOGGLE_SIGN' }
  | { type: 'BACKSPACE' }
  | { type: 'CLEAR' }
  | { type: 'SET_OPERATOR'; operator: BinaryOperation }
  | { type: 'EVALUATE_START' }
  | { type: 'EVALUATE_SUCCESS'; result: number }
  | { type: 'EVALUATE_FAILURE'; message: string }

// Trims float noise (0.30000000000000004 -> 0.3) for display.
function formatResult(result: number): string {
  return String(Number(result.toPrecision(12)))
}

export function reducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'DIGIT': {
      if (state.overwrite || state.error) {
        return { ...state, display: action.digit, overwrite: false, error: null }
      }
      if (state.display.length >= MAX_ENTRY_LENGTH) return state
      const display = state.display === '0' ? action.digit : state.display + action.digit
      return { ...state, display }
    }
    case 'DECIMAL': {
      if (state.overwrite || state.error) {
        return { ...state, display: '0.', overwrite: false, error: null }
      }
      if (state.display.includes('.') || state.display.length >= MAX_ENTRY_LENGTH) return state
      return { ...state, display: state.display + '.' }
    }
    case 'TOGGLE_SIGN': {
      if (state.display === '0') return state
      const display = state.display.startsWith('-')
        ? state.display.slice(1)
        : '-' + state.display
      return { ...state, display }
    }
    case 'BACKSPACE': {
      if (state.overwrite || state.error) return state
      const trimmed = state.display.slice(0, -1)
      return { ...state, display: trimmed === '' || trimmed === '-' ? '0' : trimmed }
    }
    case 'CLEAR':
      return initialState
    case 'SET_OPERATOR':
      return {
        ...state,
        previous: parseFloat(state.display),
        pendingOp: action.operator,
        overwrite: true,
        error: null,
      }
    case 'EVALUATE_START':
      return { ...state, loading: true, error: null }
    case 'EVALUATE_SUCCESS':
      return {
        ...state,
        display: formatResult(action.result),
        previous: null,
        pendingOp: null,
        overwrite: true,
        loading: false,
      }
    case 'EVALUATE_FAILURE':
      return {
        ...state,
        error: action.message,
        previous: null,
        pendingOp: null,
        overwrite: true,
        loading: false,
      }
  }
}

export function useCalculator() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  const evaluate = useCallback(
    async (operation: Operation, a: number, b?: number): Promise<number | null> => {
      // A newer evaluation supersedes whatever is still in flight.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      dispatch({ type: 'EVALUATE_START' })
      try {
        const result = await calculate(operation, a, b, controller.signal)
        if (controller.signal.aborted) return null // superseded or cleared
        dispatch({ type: 'EVALUATE_SUCCESS', result })
        return result
      } catch (err) {
        if (controller.signal.aborted) return null // cancellation is not an error
        const message =
          err instanceof CalculatorApiError ? err.message : 'Something went wrong'
        dispatch({ type: 'EVALUATE_FAILURE', message })
        return null
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [],
  )

  const pressDigit = useCallback(
    (digit: string) => dispatch({ type: 'DIGIT', digit }),
    [],
  )
  const pressDecimal = useCallback(() => dispatch({ type: 'DECIMAL' }), [])
  const toggleSign = useCallback(() => dispatch({ type: 'TOGGLE_SIGN' }), [])
  const backspace = useCallback(() => dispatch({ type: 'BACKSPACE' }), [])
  const clear = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'CLEAR' })
  }, [])

  const pressOperator = useCallback(
    async (operator: BinaryOperation) => {
      // Chained expression (2 + 3 *): evaluate the pending part first so the
      // new operator applies to its result.
      if (state.pendingOp && state.previous !== null && !state.overwrite) {
        const result = await evaluate(state.pendingOp, state.previous, parseFloat(state.display))
        if (result === null) return
      }
      dispatch({ type: 'SET_OPERATOR', operator })
    },
    [state.pendingOp, state.previous, state.overwrite, state.display, evaluate],
  )

  const pressEquals = useCallback(async () => {
    if (state.pendingOp === null || state.previous === null) return
    await evaluate(state.pendingOp, state.previous, parseFloat(state.display))
  }, [state.pendingOp, state.previous, state.display, evaluate])

  const pressSqrt = useCallback(async () => {
    await evaluate('sqrt', parseFloat(state.display))
  }, [state.display, evaluate])

  return {
    state,
    pressDigit,
    pressDecimal,
    pressOperator,
    pressEquals,
    pressSqrt,
    toggleSign,
    backspace,
    clear,
  }
}
