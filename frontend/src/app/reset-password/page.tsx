import { Suspense } from 'react';
import { ResetPasswordForm } from './ResetPasswordForm';

// useSearchParams (reading ?token=...) requires a Suspense boundary, or the
// production build fails — see frontend/AGENTS.md on checking Next's own docs
// before assuming an App Router API's behavior.
const ResetPasswordPage = () => (
  <div className="flex min-h-[calc(100vh-57px)]">
    <div className="hidden w-1/2 flex-col justify-center bg-neutral-900 px-16 text-white md:flex">
      <h1 className="text-2xl font-bold tracking-tight">STOCKBID</h1>
      <p className="mt-4 max-w-sm text-neutral-300">Almost there.</p>
    </div>

    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  </div>
);

export default ResetPasswordPage;
