import { type ComponentProps } from 'react';

interface ButtonProps extends ComponentProps<'button'> {
  isLoading?: boolean;
}

export const Button = ({ isLoading = false, disabled, children, ...props }: ButtonProps) => (
  <button disabled={disabled || isLoading} {...props}>
    {isLoading ? 'Loading…' : children}
  </button>
);
