import { useId, type ComponentProps } from 'react';

interface InputProps extends ComponentProps<'input'> {
  label: string;
  error?: string;
}

export const Input = ({ label, error, id, ...props }: InputProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <br />
      <input id={inputId} aria-invalid={Boolean(error)} {...props} />
      {error && <p>{error}</p>}
    </div>
  );
};
