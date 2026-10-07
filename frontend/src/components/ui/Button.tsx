import { type ComponentProps } from 'react';

type Variant = 'primary' | 'secondary';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-400',
  secondary:
    'bg-white text-black border border-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400',
};

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  isLoading?: boolean;
}

export const Button = ({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) => (
  <button
    disabled={disabled || isLoading}
    className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
    {...props}
  >
    {isLoading ? 'Loading…' : children}
  </button>
);
