import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CodeInput } from '@/features/auth/components/CodeInput'

function Harness({ onComplete }: { onComplete: (code: string) => void }) {
  const [value, setValue] = useState('')
  return <CodeInput value={value} onChange={setValue} onComplete={onComplete} />
}

const input = () => screen.getByLabelText('Código de 6 dígitos')

describe('CodeInput', () => {
  it('has the attributes iOS and the numeric keypad need', () => {
    render(<Harness onComplete={vi.fn()} />)

    expect(input()).toHaveAttribute('inputmode', 'numeric')
    expect(input()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input()).toHaveAttribute('pattern', '[0-9]*')
  })

  it('keeps only digits', async () => {
    const user = userEvent.setup()
    render(<Harness onComplete={vi.fn()} />)

    await user.type(input(), '1a2-b3')

    expect(input()).toHaveValue('123')
  })

  it('limits the code to 6 digits', async () => {
    const user = userEvent.setup()
    render(<Harness onComplete={vi.fn()} />)

    await user.type(input(), '12345678')

    expect(input()).toHaveValue('123456')
  })

  it('accepts a pasted code with spaces and completes once', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)

    await user.click(input())
    await user.paste('123 456')

    expect(input()).toHaveValue('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('does not complete before 6 digits and completes again after being edited', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)

    await user.type(input(), '12345')
    expect(onComplete).not.toHaveBeenCalled()

    await user.type(input(), '6')
    expect(onComplete).toHaveBeenCalledTimes(1)

    await user.type(input(), '{Backspace}7')
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith('123457')
  })

  it('shows the error linked to the field', () => {
    render(<CodeInput value="" onChange={vi.fn()} error="Digite os 6 dígitos do código." />)

    expect(input()).toHaveAccessibleDescription('Digite os 6 dígitos do código.')
    expect(input()).toBeInvalid()
  })
})
