'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { PublicUser } from '@/types/user';

interface RegisterResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

const RegisterPage = () => {
  const router = useRouter();
  const { applySession } = useAuth();

  const [role, setRole] = useState<'BUYER' | 'SELLER'>('BUYER');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      const data = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { email, password, role, companyName },
        auth: false,
      });
      applySession(data);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { path: string; message: string }[] | undefined;
        const next: Record<string, string> = {};
        for (const issue of details ?? []) next[issue.path] = issue.message;
        setFieldErrors(next);
      } else if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <div className="hidden w-1/2 flex-col justify-center bg-neutral-900 px-16 text-white md:flex">
        <h1 className="text-2xl font-bold tracking-tight">STOCKBID</h1>
        <p className="mt-4 max-w-sm text-neutral-300">
          Join a global marketplace for business stock.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900">Create your account</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['BUYER', 'SELLER'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                onClick={() => setRole(option)}
                className={`rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                  role === option
                    ? 'border-black bg-black text-white'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {option === 'BUYER' ? 'Buyer' : 'Seller'}
              </button>
            ))}
          </div>

          <Input
            label="Company name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            error={fieldErrors.companyName}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            required
          />

          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            I agree to the Terms &amp; Conditions
          </label>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" isLoading={isSubmitting} disabled={!agreed} className="w-full">
            Create Account
          </Button>

          <p className="text-center text-sm text-neutral-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-black underline">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
