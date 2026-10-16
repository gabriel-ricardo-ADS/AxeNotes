// Fluxos das telas de autenticação com o Supabase falso. Todos os dados são fictícios.
import { AuthError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, type InitialEntry } from 'react-router'
import { AppRoutes } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import {
  emitAuthEvent,
  fakeAuth,
  fakeSession,
  mockProfile,
  resetFakeSupabase,
} from '@/test/fake-supabase'
import { installMatchMedia } from '@/test/match-media'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/fake-supabase')).fakeSupabase,
}))

const EMAIL = 'ana@exemplo.test'
const PASSWORD = 'senha-forte-123'

function authError(code: string, status = 400) {
  return { data: {}, error: new AuthError('mensagem do servidor', status, code) }
}

function renderAt(initial: InitialEntry) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initial]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  emitAuthEvent('INITIAL_SESSION', null)
}

const heading = (name: string) => screen.getByRole('heading', { level: 1, name })

beforeEach(() => {
  resetFakeSupabase()
  mockProfile('Ana Teste')
  installMatchMedia(true)
})

describe('sign in', () => {
  it('validates the fields before calling the server', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument()
    expect(fakeAuth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in with the normalized e-mail and opens the app', async () => {
    const user = userEvent.setup()
    fakeAuth.signInWithPassword.mockImplementationOnce(() => {
      emitAuthEvent('SIGNED_IN', fakeSession())
      return Promise.resolve({ data: {}, error: null })
    })
    renderAt('/entrar')

    await user.type(screen.getByLabelText('E-mail'), ' ANA@Exemplo.test ')
    await user.type(screen.getByLabelText('Senha'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(fakeAuth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD })
    expect(await screen.findByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()
  })

  it('shows a generic message for wrong credentials, without the server text', async () => {
    const user = userEvent.setup()
    fakeAuth.signInWithPassword.mockResolvedValueOnce(authError('invalid_credentials'))
    renderAt('/entrar')

    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.type(screen.getByLabelText('Senha'), 'errada-123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
    expect(screen.queryByText(/servidor/)).not.toBeInTheDocument()
  })

  it('shows a rate-limit message', async () => {
    const user = userEvent.setup()
    fakeAuth.signInWithPassword.mockResolvedValueOnce(authError('over_request_rate_limit', 429))
    renderAt('/entrar')

    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.type(screen.getByLabelText('Senha'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas')
  })

  it('takes an unconfirmed account to the code screen with resend available', async () => {
    const user = userEvent.setup()
    fakeAuth.signInWithPassword.mockResolvedValueOnce(authError('email_not_confirmed'))
    renderAt('/entrar')

    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.type(screen.getByLabelText('Senha'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirme seu e-mail' }),
    ).toBeVisible()
    expect(screen.getByText(/ana@exemplo\.test/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeEnabled()
  })

  it('lets the user show and hide the password', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')
    const field = screen.getByLabelText('Senha')

    expect(field).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))

    expect(field).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('sign up and e-mail code', () => {
  async function fillSignUp(user: ReturnType<typeof userEvent.setup>, password = PASSWORD) {
    await user.type(screen.getByLabelText('Nome'), '  Ana Teste ')
    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.type(screen.getByLabelText('Senha'), password)
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
  }

  it('rejects a short password without calling the server', async () => {
    const user = userEvent.setup()
    renderAt('/criar-conta')

    await fillSignUp(user, '1234567')

    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(fakeAuth.signUp).not.toHaveBeenCalled()
  })

  it('creates the account with the display name and goes to the code screen', async () => {
    const user = userEvent.setup()
    renderAt('/criar-conta')

    await fillSignUp(user)

    expect(fakeAuth.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      options: { data: { display_name: 'Ana Teste' } },
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirme seu e-mail' }),
    ).toBeVisible()
    // Acabou de enviar: o reenvio só libera depois da espera.
    expect(screen.getByRole('button', { name: /Reenviar em \d+ s/ })).toBeDisabled()
  })

  it('verifies the code as soon as the 6 digits are typed and opens the app', async () => {
    const user = userEvent.setup()
    fakeAuth.verifyOtp.mockImplementationOnce(() => {
      emitAuthEvent('SIGNED_IN', fakeSession())
      return Promise.resolve({ data: {}, error: null })
    })
    renderAt({ pathname: '/codigo', state: { email: EMAIL, sent: true } })

    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123456')

    expect(fakeAuth.verifyOtp).toHaveBeenCalledTimes(1)
    expect(fakeAuth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: '123456',
      type: 'signup',
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()
  })

  it('shows an invalid-code message and clears the field to try again', async () => {
    const user = userEvent.setup()
    fakeAuth.verifyOtp.mockResolvedValueOnce(authError('otp_expired', 403))
    renderAt({ pathname: '/codigo', state: { email: EMAIL, sent: true } })
    const field = screen.getByLabelText('Código de 6 dígitos')

    await user.type(field, '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado')
    expect(field).toHaveValue('')

    await user.type(field, '123456')
    expect(fakeAuth.verifyOtp).toHaveBeenCalledTimes(2)
  })

  it('asks for the e-mail when the screen is reopened without navigation state', async () => {
    const user = userEvent.setup()
    renderAt('/codigo')

    expect(heading('Confirme seu e-mail')).toBeVisible()
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123456')
    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument()
    expect(fakeAuth.verifyOtp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(fakeAuth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: '123456',
      type: 'signup',
    })
  })

  it('resends the code and then waits before allowing another', async () => {
    const user = userEvent.setup()
    renderAt({ pathname: '/codigo', state: { email: EMAIL } })

    await user.click(screen.getByRole('button', { name: 'Reenviar código' }))

    expect(fakeAuth.resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL })
    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um novo código')
    expect(screen.getByRole('button', { name: /Reenviar em \d+ s/ })).toBeDisabled()
  })

  it('handles the e-mail rate limit on resend', async () => {
    const user = userEvent.setup()
    fakeAuth.resend.mockResolvedValueOnce(authError('over_email_send_rate_limit', 429))
    renderAt({ pathname: '/codigo', state: { email: EMAIL } })

    await user.click(screen.getByRole('button', { name: 'Reenviar código' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas')
    expect(screen.getByRole('button', { name: /Reenviar em \d+ s/ })).toBeDisabled()
  })
})

describe('password recovery', () => {
  const codeField = () => screen.getByLabelText('Código de 6 dígitos')

  async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('E-mail'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Enviar código' }))
    await screen.findByLabelText('Código de 6 dígitos')
  }

  it('goes e-mail → code → new password → app', async () => {
    const user = userEvent.setup()
    fakeAuth.verifyOtp.mockImplementationOnce(() => {
      // O código aceito já abre sessão; a tela de recuperação não pode ser abandonada.
      emitAuthEvent('SIGNED_IN', fakeSession())
      emitAuthEvent('PASSWORD_RECOVERY', fakeSession())
      return Promise.resolve({ data: {}, error: null })
    })
    renderAt('/recuperar-senha')

    await reachCodeStep(user)
    expect(fakeAuth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL)

    await user.type(codeField(), '654321')
    expect(fakeAuth.verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: '654321',
      type: 'recovery',
    })

    // Com sessão, mas ainda na recuperação: pede a nova senha.
    expect(await screen.findByRole('heading', { level: 1, name: 'Nova senha' })).toBeVisible()

    await user.type(screen.getByLabelText('Nova senha'), 'outra-senha-456')
    await user.click(screen.getByRole('button', { name: 'Salvar e entrar' }))

    expect(fakeAuth.updateUser).toHaveBeenCalledWith({ password: 'outra-senha-456' })
    // A senha mudou: as sessões dos outros aparelhos são encerradas (a deste continua).
    expect(fakeAuth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Página inicial' })).toBeVisible()
  })

  it('shows the same screen whether or not the account exists', async () => {
    const user = userEvent.setup()
    renderAt('/recuperar-senha')

    await reachCodeStep(user)

    expect(screen.getByText(/Se ana@exemplo\.test estiver correto/)).toBeInTheDocument()
  })

  it('keeps the user on the code step after a wrong code', async () => {
    const user = userEvent.setup()
    fakeAuth.verifyOtp.mockResolvedValueOnce(authError('otp_expired', 403))
    renderAt('/recuperar-senha')
    await reachCodeStep(user)

    await user.type(codeField(), '111111')

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou expirado')
    expect(codeField()).toHaveValue('')
  })

  it('rejects a weak new password and reports a server-side rejection', async () => {
    const user = userEvent.setup()
    fakeAuth.verifyOtp.mockImplementationOnce(() => {
      emitAuthEvent('SIGNED_IN', fakeSession())
      return Promise.resolve({ data: {}, error: null })
    })
    fakeAuth.updateUser.mockResolvedValueOnce(authError('same_password', 422))
    renderAt('/recuperar-senha')
    await reachCodeStep(user)
    await user.type(codeField(), '654321')
    await screen.findByRole('heading', { level: 1, name: 'Nova senha' })

    await user.type(screen.getByLabelText('Nova senha'), '123')
    await user.click(screen.getByRole('button', { name: 'Salvar e entrar' }))
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(fakeAuth.updateUser).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Nova senha'))
    await user.type(screen.getByLabelText('Nova senha'), 'mesma-senha-123')
    await user.click(screen.getByRole('button', { name: 'Salvar e entrar' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A nova senha precisa ser diferente')
    })
    expect(heading('Nova senha')).toBeVisible()
  })
})
