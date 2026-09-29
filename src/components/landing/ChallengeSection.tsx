import React from 'react';
import { ArrowDown, Copy, Check } from 'lucide-react';

export function ChallengeSection() {
  return (
    <section className="py-16 sm:py-24 border-t border-[#E5E5DE] bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            The Everyday Reality
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Spreadsheets get messy fast.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 leading-relaxed font-sans">
            Duplicates. Inconsistent names. Broken formats. Missing values. Different ways of writing the same thing.
            TidyRow turns the mess into data you can actually use.
          </p>
        </div>

        {/* 3 Concrete Visual Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Duplicates */}
          <div className="rounded-2xl border border-[#E5E5DE] bg-[#F7F5EF]/50 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#202522] text-white">
                  <Copy className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-sans font-bold text-base text-[#202522]">
                  Duplicates
                </h3>
              </div>
              <p className="text-xs text-[#202522]/70 mb-4 font-sans">
                Repeated exports and copy-pasted leads inflate numbers and break email campaigns.
              </p>
            </div>

            {/* Visual transformation: 3 rows collapsing into 1 clean record */}
            <div className="rounded-xl border border-[#E5E5DE] bg-white p-3 space-y-2">
              <div className="font-mono text-[11px] space-y-1">
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 line-through opacity-60 flex justify-between">
                  <span>alex@co.org · TX</span>
                  <span>dup #1</span>
                </div>
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 line-through opacity-60 flex justify-between">
                  <span>alex@co.org · TX</span>
                  <span>dup #2</span>
                </div>
              </div>
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3 w-3 text-[#2F8F6B]" />
              </div>
              <div className="p-2 rounded bg-emerald-50 border border-emerald-300 font-mono text-[11px] text-[#202522] font-semibold flex justify-between items-center">
                <span>alex@co.org · Texas</span>
                <span className="text-[10px] text-[#2F8F6B] bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                  Unique (1) ✓
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Inconsistent Names */}
          <div className="rounded-2xl border border-[#E5E5DE] bg-[#F7F5EF]/50 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2F8F6B] text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-sans font-bold text-base text-[#202522]">
                  Inconsistent Names
                </h3>
              </div>
              <p className="text-xs text-[#202522]/70 mb-4 font-sans">
                Different users enter names in lowercase, ALL CAPS, or typo-ridden variations.
              </p>
            </div>

            {/* Visual transformation: name casing standardizing */}
            <div className="rounded-xl border border-[#E5E5DE] bg-white p-3 space-y-2">
              <div className="font-mono text-[11px] space-y-1">
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 flex justify-between">
                  <span>rahul sharma</span>
                  <span className="text-[10px] text-amber-700">lowercase</span>
                </div>
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 flex justify-between">
                  <span>RAHUL SHARMA</span>
                  <span className="text-[10px] text-amber-700">caps</span>
                </div>
              </div>
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3 w-3 text-[#2F8F6B]" />
              </div>
              <div className="p-2 rounded bg-emerald-50 border border-emerald-300 font-mono text-[11px] text-[#202522] font-semibold flex justify-between items-center">
                <span>Rahul Sharma</span>
                <span className="text-[10px] text-[#2F8F6B] bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                  Title Case ✓
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Broken Formats */}
          <div className="rounded-2xl border border-[#E5E5DE] bg-[#F7F5EF]/50 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4D7CFE] text-white">
                  <span className="text-xs font-mono font-bold">#</span>
                </span>
                <h3 className="font-sans font-bold text-base text-[#202522]">
                  Broken Formats
                </h3>
              </div>
              <p className="text-xs text-[#202522]/70 mb-4 font-sans">
                Dates and phone numbers written in four different formats can't be imported into CRMs.
              </p>
            </div>

            {/* Visual transformation: mixed phones into standardized format */}
            <div className="rounded-xl border border-[#E5E5DE] bg-white p-3 space-y-2">
              <div className="font-mono text-[11px] space-y-1">
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 flex justify-between">
                  <span>(555) 234-5678</span>
                  <span className="text-[10px] text-amber-700">US parens</span>
                </div>
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 flex justify-between">
                  <span>5552345678</span>
                  <span className="text-[10px] text-amber-700">raw digits</span>
                </div>
              </div>
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3 w-3 text-[#2F8F6B]" />
              </div>
              <div className="p-2 rounded bg-emerald-50 border border-emerald-300 font-mono text-[11px] text-[#202522] font-semibold flex justify-between items-center">
                <span>+1 555-234-5678</span>
                <span className="text-[10px] text-[#2F8F6B] bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                  E.164 Clean ✓
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
