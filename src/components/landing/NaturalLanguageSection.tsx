import React, { useState } from 'react';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NaturalLanguageSectionProps {
  onOpenAppWithInstruction?: (instruction: string) => void;
}

export function NaturalLanguageSection({ onOpenAppWithInstruction }: NaturalLanguageSectionProps) {
  const examplePrompts = [
    'Make this spreadsheet ready for Salesforce.',
    'Remove duplicate customers.',
    'Standardize all Indian phone numbers.',
    'Convert all dates to DD/MM/YYYY.',
  ];

  const [prompt, setPrompt] = useState(examplePrompts[0]);

  return (
    <section className="py-16 sm:py-24 bg-[#F7F5EF] border-t border-[#E5E5DE]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#4D7CFE]">
            Natural Language
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#202522] tracking-tight">
            Just tell TidyRow what you want.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#202522]/75 font-sans">
            TidyRow turns your instruction into a cleaning plan you can review before it runs.
          </p>
        </div>

        {/* Interactive command input card */}
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#E5E5DE] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 focus-within:border-[#4D7CFE] transition-colors">
            <div className="flex items-center gap-2 px-3 py-2 text-[#4D7CFE] shrink-0">
              <Sparkles className="h-4 w-4" />
              <span className="font-mono text-xs font-semibold">TidyRow Prompt:</span>
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Standardize all phone numbers or remove duplicates..."
              className="flex-1 bg-transparent px-2 py-2 text-xs sm:text-sm font-sans text-[#202522] focus:outline-none"
            />
            {onOpenAppWithInstruction && (
              <Button
                onClick={() => onOpenAppWithInstruction(prompt)}
                className="h-9 px-4 rounded-lg bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white font-medium text-xs gap-1.5 cursor-pointer"
              >
                <span>Try In App</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Quick clickable prompt chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#202522]/60 font-sans">Try an instruction:</span>
            {examplePrompts.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="px-2.5 py-1 rounded-full border border-[#E5E5DE] bg-white hover:border-[#4D7CFE]/40 hover:bg-[#4D7CFE]/5 text-[11px] font-sans text-[#202522]/80 transition-colors cursor-pointer"
              >
                "{example}"
              </button>
            ))}
          </div>

          {/* Visual connection: Instruction -> Cleaning Plan -> Cleaned Result */}
          <div className="mt-8 pt-6 border-t border-[#E5E5DE] grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/50 p-4">
              <span className="text-[10px] font-mono uppercase font-bold text-[#4D7CFE]">
                Generated Cleaning Plan
              </span>
              <ul className="mt-2 space-y-1.5 font-sans text-xs text-[#202522]">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F6B]" />
                  <span>Parse phone column to E.164 international</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F6B]" />
                  <span>Split Full Name into First and Last Name</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F6B]" />
                  <span>Deduplicate by email address signature</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#2F8F6B]/30 bg-[#2F8F6B]/5 p-4 font-mono text-[11px]">
              <span className="text-[10px] font-mono uppercase font-bold text-[#2F8F6B]">
                Immediate Preview Result
              </span>
              <div className="mt-2 space-y-1 bg-white p-2 rounded border border-[#2F8F6B]/20">
                <div className="text-[#202522] flex justify-between">
                  <span>First: Jane</span>
                  <span className="text-[#2F8F6B]">Last: Smith</span>
                </div>
                <div className="text-[#202522] flex justify-between">
                  <span>Phone: +1 555-234-5678</span>
                  <span className="text-[#2F8F6B]">Clean ✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
