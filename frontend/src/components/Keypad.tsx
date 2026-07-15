import type { BinaryOperation } from '../types'

export interface KeypadHandlers {
  onDigit: (digit: string) => void
  onDecimal: () => void
  onOperator: (op: BinaryOperation) => void
  onEquals: () => void
  onSqrt: () => void
  onToggleSign: () => void
  onBackspace: () => void
  onClear: () => void
}

interface KeyDef {
  label: string
  /** Accessible name; defaults to label. */
  name?: string
  className?: string
  onPress: (h: KeypadHandlers) => void
}

const KEYS: KeyDef[] = [
  { label: 'C', name: 'clear', className: 'key-fn', onPress: (h) => h.onClear() },
  { label: '±', name: 'toggle sign', className: 'key-fn', onPress: (h) => h.onToggleSign() },
  { label: '⌫', name: 'backspace', className: 'key-fn', onPress: (h) => h.onBackspace() },
  { label: '÷', name: 'divide', className: 'key-op', onPress: (h) => h.onOperator('divide') },

  { label: '√', name: 'square root', className: 'key-fn', onPress: (h) => h.onSqrt() },
  { label: 'xʸ', name: 'power', className: 'key-fn', onPress: (h) => h.onOperator('power') },
  { label: '%', name: 'percentage', className: 'key-fn', onPress: (h) => h.onOperator('percentage') },
  { label: '×', name: 'multiply', className: 'key-op', onPress: (h) => h.onOperator('multiply') },

  { label: '7', onPress: (h) => h.onDigit('7') },
  { label: '8', onPress: (h) => h.onDigit('8') },
  { label: '9', onPress: (h) => h.onDigit('9') },
  { label: '−', name: 'subtract', className: 'key-op', onPress: (h) => h.onOperator('subtract') },

  { label: '4', onPress: (h) => h.onDigit('4') },
  { label: '5', onPress: (h) => h.onDigit('5') },
  { label: '6', onPress: (h) => h.onDigit('6') },
  { label: '+', name: 'add', className: 'key-op', onPress: (h) => h.onOperator('add') },

  { label: '1', onPress: (h) => h.onDigit('1') },
  { label: '2', onPress: (h) => h.onDigit('2') },
  { label: '3', onPress: (h) => h.onDigit('3') },
  { label: '=', name: 'equals', className: 'key-eq', onPress: (h) => h.onEquals() },

  { label: '0', className: 'key-zero', onPress: (h) => h.onDigit('0') },
  { label: '.', name: 'decimal', onPress: (h) => h.onDecimal() },
]

export function Keypad(handlers: KeypadHandlers) {
  return (
    <div className="keypad">
      {KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          className={`key ${key.className ?? ''}`}
          aria-label={key.name ?? key.label}
          onClick={() => key.onPress(handlers)}
        >
          {key.label}
        </button>
      ))}
    </div>
  )
}
