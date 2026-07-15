import type { BinaryOperation } from '../types'

const OPERATOR_SYMBOLS: Record<BinaryOperation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percentage: '%',
}

interface DisplayProps {
  value: string
  previous: number | null
  pendingOp: BinaryOperation | null
  error: string | null
  loading: boolean
}

export function Display({ value, previous, pendingOp, error, loading }: DisplayProps) {
  return (
    <div className="display">
      <div className="display-expression">
        {previous !== null && pendingOp !== null
          ? `${previous} ${OPERATOR_SYMBOLS[pendingOp]}`
          : ' '}
      </div>
      <output role="status" className="display-value" aria-live="polite">
        {loading ? '…' : value}
      </output>
      {error && (
        <div role="alert" className="display-error">
          {error}
        </div>
      )}
    </div>
  )
}
