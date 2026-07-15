/** Wire names of the operations supported by the backend. */
export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percentage'

export const BINARY_OPERATIONS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'percentage',
] as const satisfies readonly Operation[]

export type BinaryOperation = (typeof BINARY_OPERATIONS)[number]

export interface CalculateResponse {
  result: number
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}
