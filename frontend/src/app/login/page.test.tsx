import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

vi.mock('@/context/auth-context');
vi.mock('next/navigation');
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseRouter = vi.mocked(useRouter);
const mockPush = vi.fn();
const mockApplySession = vi.fn();

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockPush.mockReset();
  mockApplySession.mockReset();
  mockedUseRouter.mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
  mockedUseAuth.mockReturnValue({ user: null, applySession: mockApplySession, logout: vi.fn() });
});

test('submits credentials, applies the session, and redirects to /browse', async () => {
  const session = {
    user: { id: 'u1', email: 'a@x.com', role: 'BUYER' as const, isEmailVerified: true, createdAt: '', companyName: null },
    accessToken: 'token',
    refreshToken: 'refresh',
  };
  mockedApiFetch.mockResolvedValueOnce(session);
  render(<LoginPage />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), 'a@x.com');
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByText('Login'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/auth/login', {
    method: 'POST',
    body: { email: 'a@x.com', password: 'Password123!' },
    auth: false,
  });
  expect(mockApplySession.mock.calls[0][0]).toEqual(session);
  expect(mockPush.mock.calls[0]).toEqual(['/browse']);
});

test('shows a field error on VALIDATION_ERROR', async () => {
  mockedApiFetch.mockRejectedValueOnce(
    new ApiClientError(400, 'VALIDATION_ERROR', 'Invalid', [{ path: 'email', message: 'Invalid email' }]),
  );
  render(<LoginPage />);
  const user = userEvent.setup();

  // Syntactically valid (passes the input's own type="email" client-side check) so the test
  // reaches the component's handling of the server's rejection, not a client-side one.
  await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByText('Login'));

  expect(await screen.findByText('Invalid email')).toBeInTheDocument();
  expect(mockApplySession.mock.calls).toHaveLength(0);
  expect(mockPush.mock.calls).toHaveLength(0);
});

test('shows a generic form error for a non-field ApiClientError', async () => {
  mockedApiFetch.mockRejectedValueOnce(new ApiClientError(401, 'UNAUTHORIZED', 'Invalid credentials'));
  render(<LoginPage />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), 'a@x.com');
  await user.type(screen.getByLabelText('Password'), 'wrong');
  await user.click(screen.getByText('Login'));

  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
});

test('Google and Microsoft buttons are disabled', () => {
  render(<LoginPage />);
  expect(screen.getByText('Google').closest('button')).toBeDisabled();
  expect(screen.getByText('Microsoft').closest('button')).toBeDisabled();
});
