import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export function CapabilitiesSection() {
  const capabilities = [
    {
      title: 'Remove duplicates',
      desc: 'Find repeated records and clean them up.',
      before: 'john@co.org · 2x',
      after: 'john@co.org (unique)',
      highlight: '#2F8F6B',
    },
    {
      title: 'Standardize data',
      desc: 'Turn inconsistent values into one consistent format.',
      before: 'Hyd / HYD / hyd.',
      after: 'Hyderabad',
      highlight: '#2F8F6B',
    },
    {
      title: 'Fix formatting',
      desc: 'Normalize dates, numbers, currencies and text.',
      before: '2024/01/15 · 01-15-24',
      after: '2024-01-15',
      highlight: '#2F8F6B',
    },
    {
      title: 'Detect missing information',
      desc: 'Identify incomplete records for review.',
      before: 'null / na / - / [blank]',
      after: '— (Flagged placeholder)',
      highlight: '#4D7CFE',
    },
    {
      title: 'Clean column structures',
      desc: 'Make inconsistent column names easier to work with.',
      before: 'Cust_Name / CUST ID',
      after: 'customer_name / customer_id',
      highlight: '#202522',
    },
    {
      title: 'Tell TidyRow what you want',
      desc: 'Describe the cleanup in plain English and review proposed actions before they are applied.',
      before: '"Extract 5-digit zip codes"',
      after: '94103, 10018, 78704',
      highlight: '#4D7CFE',
      isAi: true,
    },
  ];

  return (
    <section id="capabilities" className="py-16 sm:py-24 bg-white border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            Capabilities
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            From messy to tidy.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            Six specialized workflows designed to solve the most common spreadsheet head-aches automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="rounded-2xl border border-[#E5E5DE] bg-[#F7F5EF]/50 p-5 flex flex-col justify-between hover:border-[#202522]/30 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-sans font-bold text-base text-[#202522]">
                    {cap.title}
                  </h3>
                  {cap.isAi && (
                    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4D7CFE]/10 text-[#4D7CFE] border border-[#4D7CFE]/20">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#202522]/70 leading-relaxed font-sans mb-4">
                  {cap.desc}
                </p>
              </div>

              {/* Miniature before/after example */}
              <div className="rounded-xl border border-[#E5E5DE] bg-white p-2.5 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-[#202522]/60 bg-amber-50/60 border border-amber-200/60 px-2 py-1 rounded">
                  <span className="truncate max-w-[170px]">{cap.before}</span>
                  <span className="text-[9px] uppercase font-sans text-amber-800 font-semibold">raw</span>
                </div>
                <div className="flex items-center justify-between text-[#202522] bg-[#2F8F6B]/5 border border-[#2F8F6B]/20 px-2 py-1 rounded font-medium">
                  <span className="truncate max-w-[170px]">{cap.after}</span>
                  <span className="text-[9px] uppercase font-sans text-[#2F8F6B] font-bold">tidy ✓</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
