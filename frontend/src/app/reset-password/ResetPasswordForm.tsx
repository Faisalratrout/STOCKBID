'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export const ResetPasswordForm = () => {
  const router = useRouter();
  const token = useSearchParams().get('token');

  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!token) return;
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        auth: false,
      });
      router.push('/login');
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

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-2xl font-semibold text-neutral-900">Reset link invalid</h2>
        <p className="text-sm text-neutral-700">
          This reset link is missing its token. Request a new one from the forgot password page.
        </p>
        <Link href="/forgot-password" className="inline-block text-sm font-medium text-black underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      <h2 className="text-2xl font-semibold text-neutral-900">Set a new password</h2>

      <Input
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        required
      />

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Reset password
      </Button>
    </form>
  );
};
