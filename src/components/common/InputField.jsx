import React, { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Institutional Form Input Field
 * Clean rectangular input with subtle borders and clear focus states.
 */
const InputField = forwardRef(function InputField(
  {
    label,
    id,
    name,
    type = 'text',
    placeholder,
    value,
    defaultValue,
    onChange,
    error,
    helperText,
    required = false,
    disabled = false,
    prefixIcon: PrefixIcon,
    suffixIcon: SuffixIcon,
    suffixButton,
    className = '',
    inputClassName = '',
    ...props
  },
  ref
) {
  const autoId = useId();
  const inputId = id || name || autoId;

  return (
    <div className={`w-full text-left ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-slate-800 mb-1 select-none"
        >
          {label}
          {required && <span className="text-red-600 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        {PrefixIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <PrefixIcon className="h-4 w-4" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helperText ? `${inputId}-hint` : undefined}
          name={name}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full h-9 rounded-sm border bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
            PrefixIcon ? 'pl-8.5' : 'pl-3'
          } ${suffixButton || SuffixIcon || error ? 'pr-8.5' : 'pr-3'} ${
            error
              ? 'border-red-500 focus:border-red-600 focus:ring-1 focus:ring-red-600'
              : 'border-slate-300 focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F]'
          } ${inputClassName}`}
          {...props}
        />

        {error ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-red-600">
            <AlertCircle className="h-4 w-4" />
          </div>
        ) : suffixButton ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            {suffixButton}
          </div>
        ) : SuffixIcon ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
            <SuffixIcon className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-red-600">{error}</p>
      ) : helperText ? (
        <p id={`${inputId}-hint`} className="mt-1 text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default InputField;
