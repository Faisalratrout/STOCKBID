'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        auth: false,
      });
      // Backend deliberately never reveals whether the email is registered,
      // so the success state is the same either way.
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <div className="hidden w-1/2 flex-col justify-center bg-neutral-900 px-16 text-white md:flex">
        <h1 className="text-2xl font-bold tracking-tight">STOCKBID</h1>
        <p className="mt-4 max-w-sm text-neutral-300">We&apos;ll help you get back in.</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-semibold text-neutral-900">Forgot your password?</h2>

          {submitted ? (
            <>
              <p className="text-sm text-neutral-700">
                If that email is registered, a reset link has been sent. Check your inbox.
              </p>
              <Link href="/login" className="inline-block text-sm font-medium text-black underline">
                Back to login
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-neutral-600">
                Enter the email on your account and we&apos;ll send a link to reset your password.
              </p>

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <Button type="submit" isLoading={isSubmitting} className="w-full">
                Send reset link
              </Button>

              <p className="text-center text-sm text-neutral-600">
                <Link href="/login" className="font-medium text-black underline">
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
