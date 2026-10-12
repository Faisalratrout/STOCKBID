import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './page';
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

test('defaults to Buyer and switches to Seller on click', async () => {
  render(<RegisterPage />);
  const user = userEvent.setup();

  expect(screen.getByText('Buyer')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Seller')).toHaveAttribute('aria-pressed', 'false');

  await user.click(screen.getByText('Seller'));
  expect(screen.getByText('Seller')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Buyer')).toHaveAttribute('aria-pressed', 'false');
});

test('the submit button is disabled until the terms checkbox is checked', async () => {
  render(<RegisterPage />);
  const user = userEvent.setup();

  expect(screen.getByText('Create Account')).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  expect(screen.getByText('Create Account')).not.toBeDisabled();
});

test('submits the selected role, applies the session, and redirects to /browse', async () => {
  const session = {
    user: { id: 'u1', email: 's@x.com', role: 'SELLER' as const, isEmailVerified: false, createdAt: '', companyName: 'Acme' },
    accessToken: 'token',
    refreshToken: 'refresh',
  };
  mockedApiFetch.mockResolvedValueOnce(session);
  render(<RegisterPage />);
  const user = userEvent.setup();

  await user.click(screen.getByText('Seller'));
  await user.type(screen.getByLabelText('Company name'), 'Acme');
  await user.type(screen.getByLabelText('Email'), 's@x.com');
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByText('Create Account'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/auth/register', {
    method: 'POST',
    body: { email: 's@x.com', password: 'Password123!', role: 'SELLER', companyName: 'Acme' },
    auth: false,
  });
  expect(mockApplySession.mock.calls[0][0]).toEqual(session);
  expect(mockPush.mock.calls[0]).toEqual(['/browse']);
});

test('shows a field error on VALIDATION_ERROR', async () => {
  mockedApiFetch.mockRejectedValueOnce(
    new ApiClientError(400, 'VALIDATION_ERROR', 'Invalid', [
      { path: 'email', message: 'Email already registered' },
    ]),
  );
  render(<RegisterPage />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Company name'), 'Acme');
  await user.type(screen.getByLabelText('Email'), 'taken@example.com');
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByText('Create Account'));

  expect(await screen.findByText('Email already registered')).toBeInTheDocument();
});
