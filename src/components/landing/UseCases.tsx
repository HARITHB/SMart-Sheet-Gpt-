import React from 'react';
import { Users, Briefcase, DollarSign, Megaphone, FlaskConical, Store } from 'lucide-react';

export function UseCases() {
  const useCases = [
    {
      title: 'Sales',
      desc: 'Turn messy lead lists into cleaner CRM-ready data without duplicate accounts or broken contact details.',
      icon: Users,
    },
    {
      title: 'Operations',
      desc: 'Clean recurring operational spreadsheets, supply chain schedules, and shipment logs with consistent rules.',
      icon: Briefcase,
    },
    {
      title: 'Finance',
      desc: 'Standardize reporting and transaction data, reconciling vendor naming discrepancies and dates.',
      icon: DollarSign,
    },
    {
      title: 'Marketing',
      desc: 'Prepare customer and campaign datasets, extract postal codes for geo-targeting, and remove email typos.',
      icon: Megaphone,
    },
    {
      title: 'Research',
      desc: 'Normalize research and survey data, categorize respondent sentiment, and handle incomplete fields.',
      icon: FlaskConical,
    },
    {
      title: 'Small business',
      desc: 'Turn messy CSV exports from POS systems and online stores into usable business records.',
      icon: Store,
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-[#F7F5EF] border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            Real-World Impact
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Built for people who work with spreadsheets every day.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            Whether you manage thousands of customer leads or daily inventory logs, TidyRow cuts hours of manual edits down to seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl border border-[#E5E5DE] bg-white p-6 shadow-2xs hover:border-[#202522]/30 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2F8F6B]/10 text-[#2F8F6B] mb-3.5">
                <uc.icon className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-sans font-bold text-base text-[#202522] mb-1.5">
                {uc.title}
              </h3>
              <p className="text-xs text-[#202522]/70 leading-relaxed font-sans">
                {uc.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
