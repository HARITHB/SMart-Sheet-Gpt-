import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BeforeAfterExample {
  id: string;
  category: string;
  label: string;
  column: string;
  detectionText: string;
  before: string[];
  after: string[];
}

export const BEFORE_AFTER_EXAMPLES: BeforeAfterExample[] = [
  {
    id: 'cities',
    category: 'City Normalization',
    label: 'Cities',
    column: 'City',
    detectionText: '4 mixed abbreviation & punctuation formats detected',
    before: ['Hyd', 'HYD', 'hyd.', 'Hyderabad'],
    after: ['Hyderabad', 'Hyderabad', 'Hyderabad', 'Hyderabad'],
  },
  {
    id: 'names',
    category: 'Name Normalization',
    label: 'Full Names',
    column: 'Customer Name',
    detectionText: '3 inconsistent letter cases detected across 50 rows',
    before: ['rahul', 'Rahul', 'RAHUL', 'rAHUL verma'],
    after: ['Rahul', 'Rahul', 'Rahul', 'Rahul Verma'],
  },
  {
    id: 'phones',
    category: 'Phone Normalization',
    label: 'Phone Numbers',
    column: 'Contact Phone',
    detectionText: 'Mixed country codes, spaces, and hyphens detected',
    before: ['9876543210', '+91 98765 43210', '91-98765-43210', '098765 43210'],
    after: ['+919876543210', '+919876543210', '+919876543210', '+919876543210'],
  },
  {
    id: 'addresses',
    category: 'Address Cleanup',
    label: 'Addresses & Zip',
    column: 'Delivery Address',
    detectionText: 'Unparsed street and missing postal code extraction',
    before: [
      '123 market st, san francisco ca 94103',
      '450 5th ave new york ny 10018-2001',
      '789 biscayne blvd miami fl',
    ],
    after: [
      '123 Market St, San Francisco, CA 94103',
      '450 5th Ave, New York, NY 10018',
      '789 Biscayne Blvd, Miami, FL 33132',
    ],
  },
];

interface BeforeAfterProps {
  className?: string;
  showTabs?: boolean;
}

export function BeforeAfter({ className, showTabs = true }: BeforeAfterProps) {
  const [activeTab, setActiveTab] = useState<string>('cities');
  const activeExample = BEFORE_AFTER_EXAMPLES.find((e) => e.id === activeTab) || BEFORE_AFTER_EXAMPLES[0];

  return (
    <section id="before-after" className={cn('py-12 sm:py-16', className)}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#202522] tracking-tight">
            See how TidyRow cleans messy rows
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#202522]/70 font-sans">
            Real data transformations: from inconsistent manual entries to validated, standardized datasets.
          </p>
        </div>

        {/* Tab selection */}
        {showTabs && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {BEFORE_AFTER_EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setActiveTab(example.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border',
                  activeTab === example.id
                    ? 'bg-[#202522] text-white border-[#202522] shadow-2xs'
                    : 'bg-white text-[#202522]/80 border-[#E5E5DE] hover:border-[#202522]/30 hover:bg-[#F0EEE6]'
                )}
              >
                {example.label}
              </button>
            ))}
          </div>
        )}

        {/* Main transformation display card */}
        <div className="rounded-2xl border border-[#E5E5DE] bg-white p-5 sm:p-8 shadow-sm">
          {/* Header pill & detector status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-[#E5E5DE]">
            <div>
              <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#202522]/50">
                Active Transformation
              </span>
              <h3 className="text-base font-bold text-[#202522]">{activeExample.category}</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-[#4D7CFE]/10 border border-[#4D7CFE]/20 px-3 py-1.5 text-xs font-mono text-[#4D7CFE]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{activeExample.detectionText}</span>
            </div>
          </div>

          {/* Before vs After side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            {/* Middle arrow indicator for desktop */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-[#202522] text-white items-center justify-center shadow-sm z-10">
              <ArrowRight className="h-4 w-4" />
            </div>

            {/* Before side */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200/60">
                <span className="flex items-center gap-1.5 text-xs font-sans font-bold text-amber-900 uppercase tracking-wider">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  MESSY INPUT (BEFORE)
                </span>
                <span className="text-[11px] font-mono text-amber-800">
                  Column: {activeExample.column}
                </span>
              </div>
              <div className="space-y-2">
                {activeExample.before.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded border border-amber-200 bg-white font-mono text-xs text-[#202522]"
                  >
                    <span>{val}</span>
                    <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                      raw #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* After side */}
            <div className="rounded-xl border border-[#2F8F6B]/30 bg-[#2F8F6B]/5 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#2F8F6B]/20">
                <span className="flex items-center gap-1.5 text-xs font-sans font-bold text-[#2F8F6B] uppercase tracking-wider">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F6B]" />
                  TIDY OUTPUT (AFTER)
                </span>
                <span className="text-[11px] font-mono text-[#2F8F6B] font-semibold">
                  Standardized ✓
                </span>
              </div>
              <div className="space-y-2">
                {activeExample.after.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded border border-[#2F8F6B]/30 bg-white font-mono text-xs text-[#202522] font-medium"
                  >
                    <span>{val}</span>
                    <span className="text-[10px] text-[#2F8F6B] bg-[#2F8F6B]/10 px-1.5 py-0.5 rounded font-semibold">
                      clean #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
