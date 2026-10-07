import { useId, type ComponentProps } from 'react';

interface InputProps extends ComponentProps<'input'> {
  label: string;
  error?: string;
}

export const Input = ({ label, error, id, className = '', ...props }: InputProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition-colors focus:border-black focus:ring-1 focus:ring-black ${
          error ? 'border-red-500' : 'border-neutral-300'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};
