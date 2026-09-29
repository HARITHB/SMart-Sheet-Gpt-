import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Sparkles, Layers } from 'lucide-react';

interface ProductFamilyProps {
  onOpenApp: (mode?: 'clean' | 'transform') => void;
}

export function ProductFamily({ onOpenApp }: ProductFamilyProps) {
  return (
    <section id="products" className="py-16 sm:py-24 bg-[#F7F5EF] border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            Product Family
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Built for everyday spreadsheet cleanup.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            Choose the cleaning tier that matches your workflow and spreadsheet volume.
          </p>
        </div>

        {/* Exactly 3 products */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Product 01: TidyRow Clean */}
          <div className="rounded-2xl border-2 border-[#2F8F6B] bg-white p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-1 rounded-md bg-[#2F8F6B]/10 text-[#2F8F6B] text-xs font-bold font-mono">
                  Product 01
                </span>
                <span className="text-xs font-sans font-semibold text-[#2F8F6B]">
                  Core Cleaning
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-[#202522] font-sans">
                TidyRow Clean
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-[#202522] font-mono">₹0</span>
                <span className="text-xs text-[#202522]/60 font-sans">/ free forever</span>
              </div>

              <p className="mt-3 text-xs text-[#202522]/75 leading-relaxed font-sans">
                The core spreadsheet-cleaning workflow. Upload a CSV file, identify common data-quality problems, approve the recommended cleanup, and download a cleaner version.
              </p>

              {/* Concrete transformation visual: compact spreadsheet card transitioning from inconsistent to aligned */}
              <div className="mt-5 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3 font-mono text-[10px]">
                <div className="text-[10px] text-[#202522]/60 uppercase font-sans font-bold mb-1.5 flex justify-between">
                  <span>Row Deduplication</span>
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

              <ul className="mt-5 space-y-2 text-xs text-[#202522]/80 font-sans">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Deduplicate and clean missing rows</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Standardize letter casing (Title / Upper)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
                  <span>Instant preview & unlimited export</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => onOpenApp('clean')}
              className="mt-6 w-full h-10 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-xs gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Start Free</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Product 02: TidyRow Transform */}
          <div className="rounded-2xl border-2 border-[#4D7CFE] bg-white p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-1 rounded-md bg-[#4D7CFE]/10 text-[#4D7CFE] text-xs font-bold font-mono">
                  Product 02
                </span>
                <span className="text-xs font-sans font-semibold text-[#4D7CFE]">
                  AI Instructions
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-[#202522] font-sans">
                TidyRow Transform
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-[#202522] font-mono">₹499</span>
                <span className="text-xs text-[#202522]/60 font-sans">/ month</span>
              </div>

              <p className="mt-3 text-xs text-[#202522]/75 leading-relaxed font-sans">
                A natural-language spreadsheet transformation workflow that lets users describe the outcome they want and turns the request into a reviewable cleaning plan.
              </p>

              {/* Concrete transformation visual: natural language instruction to structured result */}
              <div className="mt-5 rounded-xl border border-[#4D7CFE]/30 bg-[#4D7CFE]/5 p-3 font-mono text-[10px]">
                <div className="text-[10px] text-[#4D7CFE] uppercase font-sans font-bold mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  <span>Natural Language Plan</span>
                </div>
                <div className="px-2 py-1.5 rounded bg-white border border-[#4D7CFE]/20 text-[#202522] font-sans text-[11px] mb-1.5">
                  "Split address into City and Zip"
                </div>
                <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] text-[10px] flex justify-between">
                  <span>San Francisco, CA</span>
                  <span className="text-[#4D7CFE] font-semibold">94103</span>
                </div>
              </div>

              <ul className="mt-5 space-y-2 text-xs text-[#202522]/80 font-sans">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Prompt-guided data transformation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Batch AI processing (100 rows/batch)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#4D7CFE] shrink-0" />
                  <span>Automated sentiment analysis</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => onOpenApp('transform')}
              className="mt-6 w-full h-10 rounded-lg bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white font-semibold text-xs gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Explore Transform</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Product 03: TidyRow Business */}
          <div className="rounded-2xl border-2 border-[#202522] bg-white p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-1 rounded-md bg-[#202522]/10 text-[#202522] text-xs font-bold font-mono">
                  Product 03
                </span>
                <span className="text-xs font-sans font-semibold text-[#202522]">
                  High Capacity
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-[#202522] font-sans">
                TidyRow Business
              </h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-[#202522] font-mono">₹1,999</span>
                <span className="text-xs text-[#202522]/60 font-sans">/ month</span>
              </div>

              <p className="mt-3 text-xs text-[#202522]/75 leading-relaxed font-sans">
                A higher-usage TidyRow workspace for teams that repeatedly prepare spreadsheet data and need greater processing capacity and workflow controls.
              </p>

              {/* Concrete transformation visual: processing queue with multiple jobs */}
              <div className="mt-5 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3 font-mono text-[10px]">
                <div className="text-[10px] text-[#202522]/60 uppercase font-sans font-bold mb-1.5 flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>Batch Queue (High Volume)</span>
                </div>
                <div className="space-y-1">
                  <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] flex justify-between">
                    <span>crm_leads_50k.csv</span>
                    <span className="text-[#2F8F6B]">Ready ✓</span>
                  </div>
                  <div className="px-2 py-1 rounded bg-white border border-[#E5E5DE] flex justify-between">
                    <span>orders_q3_40k.csv</span>
                    <span className="text-[#4D7CFE]">Processing...</span>
                  </div>
                </div>
              </div>

              <ul className="mt-5 space-y-2 text-xs text-[#202522]/80 font-sans">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#202522] shrink-0" />
                  <span>Up to 100MB per file processing</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#202522] shrink-0" />
                  <span>Sequential batching for 40,000+ rows</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#202522] shrink-0" />
                  <span>High capacity & priority queues</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => onOpenApp('clean')}
              className="mt-6 w-full h-10 rounded-lg bg-[#202522] hover:bg-[#202522]/90 text-white font-semibold text-xs gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>Contact for Teams</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
