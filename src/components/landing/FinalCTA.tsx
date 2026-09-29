import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

interface FinalCTAProps {
  onOpenApp: () => void;
}

export function FinalCTA({ onOpenApp }: FinalCTAProps) {
  return (
    <section className="py-16 sm:py-24 bg-white border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-3xl border border-[#E5E5DE] bg-[#F7F5EF] p-8 sm:p-14 text-center relative overflow-hidden shadow-xs">
          <div className="max-w-2xl mx-auto relative z-10">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5DE] bg-white px-3 py-1 text-xs font-mono font-semibold text-[#2F8F6B] mb-4">
              <Sparkles className="h-3 w-3" />
              <span>Free to start · Instant in-browser cleaning</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight font-sans">
              Ready to tidy your spreadsheet?
            </h2>

            <p className="mt-4 text-sm sm:text-base text-[#202522]/75 font-sans leading-relaxed">
              Upload your file, review detected issues, apply standard or AI cleanups, and download your pristine dataset in seconds.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={onOpenApp}
                className="w-full sm:w-auto h-12 px-8 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-sm shadow-sm gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>Clean my spreadsheet</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-4 text-[11px] text-[#202522]/60 font-mono">
              No account required for instant file cleaning
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
