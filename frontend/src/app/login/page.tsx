'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { PublicUser } from '@/types/user';

interface LoginResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

const LoginPage = () => {
  const router = useRouter();
  const { applySession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      const data = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      applySession(data);
      router.push('/browse');
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
          Welcome back. Let&apos;s grow your business.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-semibold text-neutral-900">Login to your account</h2>

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <div>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              required
            />
            <Link
              href="/forgot-password"
              className="mt-1 inline-block text-sm text-neutral-600 hover:text-black"
            >
              Forgot password?
            </Link>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Login
          </Button>

          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200" />
            or continue with
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled
              title="Not available yet"
              className="w-full"
            >
              Google
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled
              title="Not available yet"
              className="w-full"
            >
              Microsoft
            </Button>
          </div>

          <p className="text-center text-sm text-neutral-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-black underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
