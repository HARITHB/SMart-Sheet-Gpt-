import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Check, ArrowDown } from 'lucide-react';
import { TidyRowIcon } from '@/components/ui/TidyRowLogo';

interface HeroProps {
  onOpenApp: () => void;
}

export function Hero({ onOpenApp }: HeroProps) {
  return (
    <section id="overview" className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
        {/* Top Tagline */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E5DE] bg-white/80 px-3.5 py-1 text-xs font-semibold text-[#202522] shadow-2xs backdrop-blur-xs mb-6">
          <TidyRowIcon size={16} />
          <span>MESSY → TIDY DATA TRANSFORMATION</span>
        </div>

        {/* Headline */}
        <h1 className="font-sans text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#202522] leading-[1.12] max-w-4xl mx-auto">
          Clean messy spreadsheets without doing the cleanup yourself.
        </h1>

        {/* Supporting Copy */}
        <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-[#202522]/75 leading-relaxed font-sans">
          Upload a CSV or TSV file and let TidyRow find duplicates, inconsistent values, formatting problems, and missing data—then give you a clean, usable spreadsheet.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <Button
            size="lg"
            onClick={onOpenApp}
            className="w-full sm:w-auto h-12 px-7 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-sm shadow-sm gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Clean my spreadsheet</span>
            <ArrowRight className="h-4 w-4" />
          </Button>

          <a
            href="#before-after"
            className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-6 rounded-lg border border-[#E5E5DE] bg-white hover:bg-[#F0EEE6] text-[#202522] font-medium text-sm transition-colors cursor-pointer"
          >
            See an example
          </a>
        </div>

        {/* Supported formats */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#202522]/60 font-mono">
          <span>Supported:</span>
          <span className="px-1.5 py-0.5 rounded bg-[#E5E5DE]/60 text-[#202522] font-semibold">.CSV</span>
          <span className="px-1.5 py-0.5 rounded bg-[#E5E5DE]/60 text-[#202522] font-semibold">.TSV</span>
          <span>· Up to 100MB</span>
        </div>

        {/* Hero Visual: BEFORE → TIDYROW → AFTER */}
        <div className="mt-12 sm:mt-16 mx-auto max-w-4xl rounded-2xl border border-[#E5E5DE] bg-white shadow-sm p-4 sm:p-6 text-left">
          <div className="flex items-center justify-between border-b border-[#E5E5DE] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#E5E5DE]" />
              <span className="h-3 w-3 rounded-full bg-[#E5E5DE]" />
              <span className="h-3 w-3 rounded-full bg-[#E5E5DE]" />
              <span className="ml-2 font-mono text-xs font-semibold text-[#202522]/60">
                demo_customers.csv
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#2F8F6B] font-semibold flex items-center gap-1">
              <Check className="h-3 w-3" /> Live Pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* 1. BEFORE */}
            <div className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#202522]/60">
                  1. Messy Input
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200">
                  Inconsistent
                </span>
              </div>
              <div className="font-mono text-xs space-y-1.5 bg-white p-2.5 rounded-lg border border-[#E5E5DE]">
                <div className="text-[#202522]/80 flex justify-between">
                  <span>1. Hyd</span>
                  <span className="text-amber-600 text-[10px]">abbrev</span>
                </div>
                <div className="text-[#202522]/80 flex justify-between">
                  <span>2. HYD</span>
                  <span className="text-amber-600 text-[10px]">uppercase</span>
                </div>
                <div className="text-[#202522]/80 flex justify-between">
                  <span>3. hyd.</span>
                  <span className="text-amber-600 text-[10px]">punctuation</span>
                </div>
              </div>
            </div>

            {/* 2. TIDYROW DETECT */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-[#4D7CFE]/30 bg-[#4D7CFE]/5 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4D7CFE] text-white shadow-2xs mb-2">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-xs font-sans font-bold text-[#4D7CFE] tracking-tight">
                TidyRow Engine
              </span>
              <p className="mt-1 font-mono text-[11px] text-[#202522]/70 leading-tight">
                Detecting 3 inconsistent city values → Normalizing
              </p>
              <ArrowDown className="h-3.5 w-3.5 text-[#4D7CFE] mt-2 md:rotate-[-90deg]" />
            </div>

            {/* 3. AFTER */}
            <div className="rounded-xl border border-[#2F8F6B]/30 bg-[#2F8F6B]/5 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#2F8F6B]">
                  3. Clean Result
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Standardized
                </span>
              </div>
              <div className="font-mono text-xs space-y-1.5 bg-white p-2.5 rounded-lg border border-[#2F8F6B]/20">
                <div className="text-[#202522] font-medium flex justify-between">
                  <span>1. Hyderabad</span>
                  <span className="text-[#2F8F6B] text-[10px]">✓</span>
                </div>
                <div className="text-[#202522] font-medium flex justify-between">
                  <span>2. Hyderabad</span>
                  <span className="text-[#2F8F6B] text-[10px]">✓</span>
                </div>
                <div className="text-[#202522] font-medium flex justify-between">
                  <span>3. Hyderabad</span>
                  <span className="text-[#2F8F6B] text-[10px]">✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
