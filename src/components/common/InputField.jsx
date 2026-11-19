import React, { forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Enterprise Form Input Field
 * Features label, helper caption, validation error styling, and prefix/suffix slot.
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
    className = '',
    inputClassName = '',
    ...props
  },
  ref
) {
  const inputId = id || name || `input-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className={`w-full text-left ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative rounded">
        {PrefixIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <PrefixIcon className="h-4 w-4" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full rounded border bg-white py-2 text-xs text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
            PrefixIcon ? 'pl-9' : 'pl-3'
          } ${SuffixIcon || error ? 'pr-9' : 'pr-3'} ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
              : 'border-slate-300 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]'
          } ${inputClassName}`}
          {...props}
        />

        {error ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-rose-500">
            <AlertCircle className="h-4 w-4" />
          </div>
        ) : SuffixIcon ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
            <SuffixIcon className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-rose-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default InputField;
