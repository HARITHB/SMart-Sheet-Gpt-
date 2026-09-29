import React from 'react';
import { TidyRowLogo } from '@/components/ui/TidyRowLogo';

interface FooterProps {
  onOpenApp: () => void;
}

export function Footer({ onOpenApp }: FooterProps) {
  return (
    <footer className="border-t border-[#E5E5DE] bg-[#F7F5EF] py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-[#E5E5DE]/80">
          <div className="flex items-center gap-3">
            <TidyRowLogo size="sm" />
            <span className="text-xs text-[#202522]/50 font-sans border-l border-[#E5E5DE] pl-3">
              Clean messy spreadsheets without doing the cleanup yourself.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-sans text-[#202522]/70">
            <a href="#overview" className="hover:text-[#202522] transition-colors">
              Overview
            </a>
            <a href="#products" className="hover:text-[#202522] transition-colors">
              Products
            </a>
            <a href="#capabilities" className="hover:text-[#202522] transition-colors">
              Capabilities
            </a>
            <a href="#workflow" className="hover:text-[#202522] transition-colors">
              Workflow
            </a>
            <button
              onClick={onOpenApp}
              className="text-[#2F8F6B] font-semibold hover:underline cursor-pointer"
            >
              Open Application
            </button>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#202522]/60 font-sans">
          <p>© {new Date().getFullYear()} TidyRow. All rights reserved.</p>
          <p className="font-mono">TidyRow Brand Palette: Cream · Charcoal · Green · Blue · Soft Grey</p>
        </div>
      </div>
    </footer>
  );
}
