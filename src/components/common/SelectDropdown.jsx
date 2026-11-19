import React, { forwardRef } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';

/**
 * Enterprise Select Dropdown Component
 * Styled for clean form density and ERP workflows.
 */
const SelectDropdown = forwardRef(function SelectDropdown(
  {
    label,
    id,
    name,
    options = [],
    value,
    defaultValue,
    onChange,
    placeholder = 'Select an option...',
    error,
    helperText,
    required = false,
    disabled = false,
    className = '',
    selectClassName = '',
    ...props
  },
  ref
) {
  const selectId = id || name || `select-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className={`w-full text-left ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative rounded">
        <select
          ref={ref}
          id={selectId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={`w-full appearance-none rounded border bg-white py-2 pl-3 pr-9 text-xs text-slate-900 transition-colors focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30'
              : 'border-slate-300 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]'
          } ${selectClassName}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => {
            const optVal = typeof opt === 'object' ? opt.value : opt;
            const optLabel = typeof opt === 'object' ? opt.label : opt;
            return (
              <option key={optVal} value={optVal}>
                {optLabel}
              </option>
            );
          })}
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
          {error ? (
            <AlertCircle className="h-4 w-4 text-rose-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-rose-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default SelectDropdown;
