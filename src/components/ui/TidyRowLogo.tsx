import React from 'react';
import { cn } from '@/lib/utils';

interface TidyRowIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

export function TidyRowIcon({ size = 32, className, ...props }: TidyRowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 select-none', className)}
      aria-label="TidyRow Icon"
      {...props}
    >
      {/* Outer squircle container */}
      <rect x="4" y="4" width="92" height="92" rx="24" fill="#202522" />

      {/* Top-Left: Warm muted grey drawer */}
      <rect x="15" y="15" width="31" height="31" rx="8" fill="#B9BBB3" />
      {/* Top-Left handle */}
      <rect x="25" y="28" width="11" height="5" rx="2.5" fill="#FFFFFF" />

      {/* Top-Right: Green drawer */}
      <rect x="54" y="15" width="31" height="31" rx="8" fill="#2F8F6B" />
      {/* Top-Right handle */}
      <rect x="64" y="28" width="11" height="5" rx="2.5" fill="#FFFFFF" />

      {/* Bottom-Left: Green drawer */}
      <rect x="15" y="54" width="31" height="31" rx="8" fill="#2F8F6B" />
      {/* Bottom-Left handle */}
      <rect x="25" y="67" width="11" height="5" rx="2.5" fill="#FFFFFF" />

      {/* Bottom-Right: Vibrant Blue drawer */}
      <rect x="54" y="54" width="31" height="31" rx="8" fill="#4D7CFE" />
      {/* Bottom-Right handle */}
      <rect x="64" y="67" width="11" height="5" rx="2.5" fill="#FFFFFF" />
    </svg>
  );
}

interface TidyRowLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  iconOnly?: boolean;
  taglineText?: string;
}

export function TidyRowLogo({
  size = 'md',
  showTagline = false,
  className,
  iconOnly = false,
  taglineText,
}: TidyRowLogoProps) {
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <TidyRowIcon size={iconSizes[size]} className="transition-transform group-hover:scale-105 duration-200" />
      {!iconOnly && (
        <div className="flex flex-col">
          <div className={cn('font-sans font-extrabold tracking-tight leading-none flex items-center', textSizes[size])}>
            <span className="text-[#202522]">Tidy</span>
            <span className="text-[#2F8F6B]">Row</span>
          </div>
          {showTagline && (
            <span className="text-[11px] text-[#202522]/60 font-sans mt-0.5">
              {taglineText || 'Clean messy spreadsheets'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
