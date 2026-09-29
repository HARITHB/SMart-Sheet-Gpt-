import React from 'react';
import { UploadCloud, Search, CheckSquare, Download } from 'lucide-react';

export function WorkflowSteps() {
  const steps = [
    {
      num: '01',
      title: 'Upload',
      desc: 'Drop in your CSV or TSV file. Files up to 100MB are supported.',
      icon: UploadCloud,
      color: '#202522',
      preview: 'drag & drop .csv',
    },
    {
      num: '02',
      title: 'Understand',
      desc: 'TidyRow identifies duplicates, casing errors, missing values, and formatting issues.',
      icon: Search,
      color: '#4D7CFE',
      preview: 'calculated issue counts',
    },
    {
      num: '03',
      title: 'Review',
      desc: 'Choose which recommended changes to apply with one click or customize columns.',
      icon: CheckSquare,
      color: '#2F8F6B',
      preview: 'approve cleaning plan',
    },
    {
      num: '04',
      title: 'Download',
      desc: 'Get your clean, standardized spreadsheet ready for Excel, CRM, or data pipelines.',
      icon: Download,
      color: '#2F8F6B',
      preview: 'cleaned_data.csv ready',
    },
  ];

  return (
    <section id="workflow" className="py-16 sm:py-24 bg-white border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#2F8F6B]">
            How It Works
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Four steps from messy to tidy.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            A linear, predictable process that puts you in control of every data modification.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div
              key={step.num}
              className="rounded-2xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xl font-extrabold text-[#202522]/40">
                    {step.num}
                  </span>
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#E5E5DE] shadow-2xs"
                    style={{ color: step.color }}
                  >
                    <step.icon className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="font-sans font-bold text-base text-[#202522] mb-1.5">
                  {step.title}
                </h3>
                <p className="text-xs text-[#202522]/70 leading-relaxed font-sans mb-4">
                  {step.desc}
                </p>
              </div>

              {/* Concrete visual badge */}
              <div className="rounded-lg border border-[#E5E5DE] bg-white px-2.5 py-1.5 font-mono text-[10px] text-[#202522]/80 text-center">
                {step.preview}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
