import { useEffect } from 'react'
import { useCalculator } from '../hooks/useCalculator'
import type { BinaryOperation } from '../types'
import { Display } from './Display'
import { Keypad } from './Keypad'

const KEY_OPERATORS: Record<string, BinaryOperation> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
  '%': 'percentage',
}

export function Calculator() {
  const {
    state,
    pressDigit,
    pressDecimal,
    pressOperator,
    pressEquals,
    pressSqrt,
    toggleSign,
    backspace,
    clear,
  } = useCalculator()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { key } = event
      if (/^[0-9]$/.test(key)) {
        pressDigit(key)
      } else if (key === '.') {
        pressDecimal()
      } else if (key in KEY_OPERATORS) {
        event.preventDefault()
        void pressOperator(KEY_OPERATORS[key])
      } else if (key === 'Enter' || key === '=') {
        event.preventDefault()
        void pressEquals()
      } else if (key === 'Escape') {
        clear()
      } else if (key === 'Backspace') {
        backspace()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pressDigit, pressDecimal, pressOperator, pressEquals, clear, backspace])

  return (
    <div className="calculator" aria-label="Calculator">
      <Display
        value={state.display}
        previous={state.previous}
        pendingOp={state.pendingOp}
        error={state.error}
        loading={state.loading}
      />
      <Keypad
        onDigit={pressDigit}
        onDecimal={pressDecimal}
        onOperator={(op) => void pressOperator(op)}
        onEquals={() => void pressEquals()}
        onSqrt={() => void pressSqrt()}
        onToggleSign={toggleSign}
        onBackspace={backspace}
        onClear={clear}
      />
    </div>
  )
}
