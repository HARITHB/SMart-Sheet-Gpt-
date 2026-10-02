import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Sparkles, Wand2 } from 'lucide-react';

interface ProductFamilyProps {
  onOpenApp: (mode?: 'clean' | 'transform') => void;
}

export function ProductFamily({ onOpenApp }: ProductFamilyProps) {
  return (
    <section id="products" className="py-16 sm:py-24 bg-[#F7F5EF] border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            Subscription Plans
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Simple, honest pricing. Start free.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            Choose the plan that matches your spreadsheet cleanup volume. No hidden tiers.
          </p>
        </div>

        {/* Exactly 2 subscription plans: Free ($0) and Pro ($5/month) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Plan 01: Free ($0) */}
          <div className="rounded-2xl border-2 border-[#2F8F6B] bg-white p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-1 rounded-md bg-[#2F8F6B]/10 text-[#2F8F6B] text-xs font-bold font-mono">
                  Free Plan
                </span>
                <span className="text-xs font-sans font-semibold text-[#2F8F6B]">
                  Core Workflow
                </span>
              </div>

              <h3 className="text-2xl font-extrabold text-[#202522] font-sans">
                TidyRow Free
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#202522] font-mono">$0</span>
                <span className="text-xs text-[#202522]/60 font-sans">/ forever</span>
              </div>

              <p className="mt-3 text-xs text-[#202522]/75 leading-relaxed font-sans">
                For users who want to clean spreadsheets occasionally and try the core TidyRow workflow.
              </p>

              {/* Concrete transformation visual */}
              <div className="mt-5 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3 font-mono text-[10px]">
                <div className="text-[10px] text-[#202522]/60 uppercase font-sans font-bold mb-1.5 flex justify-between">
                  <span>Row Deduplication & Trimming</span>
                  <span className="text-[#2F8F6B]">Resolved</span>
                </div>
                <div className="space-y-1">
                  <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] flex justify-between">
                    <span>1. Sarah Jenkins</span>
                    <span className="text-[#2F8F6B]">✓ Valid</span>
                  </div>
                  <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] flex justify-between">
                    <span>2. Robert Chen</span>
                    <span className="text-[#2F8F6B]">✓ Valid</span>
                  </div>
                </div>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-[#202522]/80 font-sans">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>CSV, TSV, and real Excel (.xlsx) support</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Full dataset health report & quality scoring</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Exact & normalized duplicate removal</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Title casing & invisible whitespace trimming</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Instant preview & clean spreadsheet export</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => onOpenApp('clean')}
              className="mt-8 w-full h-11 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-xs sm:text-sm gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Start Free</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Plan 02: Pro ($5/month) */}
          <div className="rounded-2xl border-2 border-[#4D7CFE] bg-white p-6 sm:p-8 flex flex-col justify-between shadow-xs relative">
            <div className="absolute -top-3 right-6 bg-[#4D7CFE] text-white text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-2xs">
              Popular
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-1 rounded-md bg-[#4D7CFE]/10 text-[#4D7CFE] text-xs font-bold font-mono">
                  Pro Plan
                </span>
                <span className="text-xs font-sans font-semibold text-[#4D7CFE]">
                  Advanced & Destination-Ready
                </span>
              </div>

              <h3 className="text-2xl font-extrabold text-[#202522] font-sans">
                TidyRow Pro
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#202522] font-mono">$5</span>
                <span className="text-xs text-[#202522]/60 font-sans">/ month</span>
              </div>

              <p className="mt-3 text-xs text-[#202522]/75 leading-relaxed font-sans">
                For users who need advanced cleaning, natural-language transformations, change history and higher processing capacity.
              </p>

              {/* Concrete transformation visual: natural language to structured destination-ready */}
              <div className="mt-5 rounded-xl border border-[#4D7CFE]/30 bg-[#4D7CFE]/5 p-3 font-mono text-[10px]">
                <div className="text-[10px] text-[#4D7CFE] uppercase font-sans font-bold mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>HubSpot & Salesforce Ready</span>
                  </span>
                  <span className="text-[#2F8F6B] font-semibold">98% Ready</span>
                </div>
                <div className="px-2 py-1.5 rounded bg-white border border-[#4D7CFE]/20 text-[#202522] font-sans text-[11px] mb-1.5">
                  "Format phone numbers and validate CRM emails"
                </div>
                <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] text-[10px] flex justify-between">
                  <span>j.doe@acme.io</span>
                  <span className="text-[#2F8F6B] font-semibold">+1 (555) 234-5678</span>
                </div>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-[#202522]/80 font-sans">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Everything in Free, plus:</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Destination Readiness (HubSpot, Salesforce, Shopify)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Natural-language cleaning plans before execution</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Canonical dictionary standardizer (Cities, States, Suffixes)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Multi-file merging & full change-log CSV audit exports</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Save repeatable workflows & automated recipes</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => onOpenApp('transform')}
              className="mt-8 w-full h-11 rounded-lg bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white font-semibold text-xs sm:text-sm gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Start Pro ($5/mo)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
