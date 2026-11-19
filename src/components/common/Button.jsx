import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Enterprise Button Component
 * Inspired by academic ERP systems: clean geometry, restrained elevation, clear focus states.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon: Icon,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  isLoading = false,
  disabled = false,
  type = 'button',
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-colors duration-150 rounded border focus:outline-none focus:ring-2 focus:ring-offset-1 select-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const variants = {
    primary:
      'bg-[#1E3A5F] hover:bg-[#152A45] active:bg-[#0F1D30] text-white border-transparent shadow-xs focus:ring-[#1E3A5F]/40',
    secondary:
      'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border-slate-300 shadow-xs focus:ring-slate-300',
    outline:
      'bg-transparent hover:bg-[#EBF2FA] active:bg-[#D9E6F5] text-[#1E3A5F] border-[#1E3A5F] focus:ring-[#1E3A5F]/30',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white border-transparent shadow-xs focus:ring-rose-500/40',
    ghost:
      'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 border-transparent focus:ring-slate-300',
  };

  const sizes = {
    sm: 'h-8 px-2.5 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-xs font-medium gap-2',
    lg: 'h-10 px-4 text-sm font-medium gap-2.5',
  };

  const ResolvedLeftIcon = LeftIcon || Icon;

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : ResolvedLeftIcon ? (
        <ResolvedLeftIcon className="w-3.5 h-3.5 shrink-0" />
      ) : null}

      <span>{children}</span>

      {!isLoading && RightIcon && (
        <RightIcon className="w-3.5 h-3.5 shrink-0" />
      )}
    </button>
  );
}
