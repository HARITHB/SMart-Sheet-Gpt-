import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { TidyRowLogo } from '@/components/ui/TidyRowLogo';

interface NavbarProps {
  onOpenApp: () => void;
}

export function Navbar({ onOpenApp }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E5DE] bg-[#F7F5EF]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
        {/* Brand */}
        <a href="#/" className="flex items-center group">
          <TidyRowLogo size="md" />
        </a>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#202522]/80">
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
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Button
            onClick={onOpenApp}
            className="h-9 px-4 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-medium text-xs sm:text-sm shadow-2xs gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Clean my spreadsheet</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
