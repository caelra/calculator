import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalculatorApiError } from '../api/client'
import { Calculator } from './Calculator'

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/client')>()
  return { ...original, calculate: vi.fn() }
})

import { calculate } from '../api/client'
const calculateMock = vi.mocked(calculate)

beforeEach(() => {
  calculateMock.mockReset()
})

describe('Calculator', () => {
  it('renders a zero display initially', () => {
    render(<Calculator />)
    expect(screen.getByRole('status')).toHaveTextContent('0')
  })

  it('computes 1 + 2 = 3 through the backend', async () => {
    calculateMock.mockResolvedValue(3)
    const user = userEvent.setup()
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: 'add' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))

    expect(calculateMock).toHaveBeenCalledWith('add', 1, 2)
    expect(screen.getByRole('status')).toHaveTextContent('3')
  })

  it('shows an error banner on division by zero', async () => {
    calculateMock.mockRejectedValue(
      new CalculatorApiError('division_by_zero', 'cannot divide by zero'),
    )
    const user = userEvent.setup()
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'divide' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))

    expect(screen.getByRole('alert')).toHaveTextContent('cannot divide by zero')
  })

  it('supports keyboard input', async () => {
    calculateMock.mockResolvedValue(11)
    const user = userEvent.setup()
    render(<Calculator />)

    await user.keyboard('5{+}6{Enter}')

    expect(calculateMock).toHaveBeenCalledWith('add', 5, 6)
    expect(screen.getByRole('status')).toHaveTextContent('11')
  })

  it('applies square root from the keypad', async () => {
    calculateMock.mockResolvedValue(3)
    const user = userEvent.setup()
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: 'square root' }))

    expect(calculateMock).toHaveBeenCalledWith('sqrt', 9)
    expect(screen.getByRole('status')).toHaveTextContent('3')
  })

  it('computes percentage, power, subtract and multiply from the keypad', async () => {
    const user = userEvent.setup()
    render(<Calculator />)

    calculateMock.mockResolvedValue(50)
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'percentage' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))
    expect(calculateMock).toHaveBeenLastCalledWith('percentage', 25, 200)

    calculateMock.mockResolvedValue(8)
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'power' }))
    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))
    expect(calculateMock).toHaveBeenLastCalledWith('power', 2, 3)

    calculateMock.mockResolvedValue(4)
    await user.click(screen.getByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: 'subtract' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))
    expect(calculateMock).toHaveBeenLastCalledWith('subtract', 6, 2)

    calculateMock.mockResolvedValue(12)
    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'multiply' }))
    await user.click(screen.getByRole('button', { name: '4' }))
    await user.click(screen.getByRole('button', { name: 'equals' }))
    expect(calculateMock).toHaveBeenLastCalledWith('multiply', 3, 4)
  })

  it('edits the entry with decimal, sign toggle and backspace', async () => {
    const user = userEvent.setup()
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: 'decimal' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByRole('status')).toHaveTextContent('1.5')

    await user.click(screen.getByRole('button', { name: 'toggle sign' }))
    expect(screen.getByRole('status')).toHaveTextContent('-1.5')

    await user.click(screen.getByRole('button', { name: 'backspace' }))
    expect(screen.getByRole('status')).toHaveTextContent('-1.')
  })

  it('supports Escape, Backspace and decimal keys', async () => {
    const user = userEvent.setup()
    render(<Calculator />)

    await user.keyboard('12{Backspace}')
    expect(screen.getByRole('status')).toHaveTextContent(/^1$/)

    await user.keyboard('.5')
    expect(screen.getByRole('status')).toHaveTextContent('1.5')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('status')).toHaveTextContent(/^0$/)
  })

  it('clears with the C button', async () => {
    const user = userEvent.setup()
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '7' }))
    await user.click(screen.getByRole('button', { name: 'clear' }))

    expect(screen.getByRole('status')).toHaveTextContent('0')
  })
})
