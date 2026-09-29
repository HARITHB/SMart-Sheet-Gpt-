import React, { useRef } from 'react';
import { UploadCloud, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TidyRowIcon } from '@/components/ui/TidyRowLogo';

interface UploadZoneProps {
  isDragging: boolean;
  isParsing: boolean;
  parseError: string | null;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileSelect: (file: File) => void;
  onLoadSample: (name: string, content: string) => void;
  sampleEcommerce: string;
  sampleSalesLeads: string;
  sampleReviews: string;
}

export function UploadZone({
  isDragging,
  isParsing,
  parseError,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onLoadSample,
  sampleEcommerce,
  sampleSalesLeads,
  sampleReviews,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center pt-8 pb-16 animate-fade-in w-full max-w-4xl mx-auto px-4">
      {/* Top Tagline */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#E5E5DE] bg-white px-3.5 py-1 text-xs font-mono font-medium text-[#202522] shadow-2xs">
        <TidyRowIcon size={16} />
        <span>Step 01 — Upload Spreadsheet</span>
      </div>

      <h2 className="text-2xl sm:text-4xl font-extrabold text-[#202522] tracking-tight text-center font-sans">
        Drop your messy spreadsheet here.
      </h2>
      <p className="mt-2.5 max-w-lg text-center text-sm text-[#202522]/70 font-sans">
        TidyRow automatically parses your dataset in memory, inspects column types, and creates an instant reviewable cleaning plan.
      </p>

      {/* Upload Dropzone Card */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'mt-8 group relative flex min-h-[250px] w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300',
          'bg-white shadow-sm',
          isDragging
            ? 'scale-[1.01] border-[#2F8F6B] bg-[#2F8F6B]/5 ring-4 ring-[#2F8F6B]/10'
            : 'border-[#E5E5DE] hover:border-[#202522]/40 hover:bg-[#F0EEE6]/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />

        {/* Dual-tone upload icon */}
        <div
          className={cn(
            'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 shadow-2xs',
            isDragging
              ? 'scale-110 bg-[#2F8F6B] text-white'
              : 'bg-[#2F8F6B]/10 text-[#2F8F6B] group-hover:scale-105 group-hover:bg-[#2F8F6B] group-hover:text-white'
          )}
        >
          <UploadCloud className="h-7 w-7" />
        </div>

        <p className="text-base font-semibold text-[#202522] font-sans">
          {isDragging ? 'Drop your spreadsheet here' : 'Drag & drop your CSV or TSV file'}
        </p>
        <p className="mt-1 text-xs text-[#202522]/60 font-sans">
          or <span className="font-semibold text-[#2F8F6B] hover:underline">browse files</span> from your device
        </p>
        <p className="mt-3 text-[11px] font-mono text-[#202522]/50">
          Supports .csv, .tsv up to 100MB
        </p>

        {isParsing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 backdrop-blur-sm z-20">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#2F8F6B] border-t-transparent" />
            <p className="text-sm font-medium text-[#202522] font-sans">
              Parsing full dataset into memory...
            </p>
          </div>
        )}
      </div>

      {/* Sample datasets */}
      <div className="mt-7 flex flex-col items-center gap-3 w-full">
        <span className="text-xs font-mono font-medium text-[#202522]/60">
          Want to test it first? Try a sample dataset:
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample('ecommerce_orders.csv', sampleEcommerce);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5DE] bg-white px-3.5 py-1.5 text-xs font-medium text-[#202522] shadow-2xs transition-all hover:border-[#2F8F6B] hover:bg-[#F0EEE6] cursor-pointer active:scale-95"
          >
            <span>🛍️</span>
            <span>E-commerce Orders (Messy Addresses)</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample('sales_leads.csv', sampleSalesLeads);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5DE] bg-white px-3.5 py-1.5 text-xs font-medium text-[#202522] shadow-2xs transition-all hover:border-[#2F8F6B] hover:bg-[#F0EEE6] cursor-pointer active:scale-95"
          >
            <span>👥</span>
            <span>Sales Leads (Inconsistent Names)</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample('customer_reviews.csv', sampleReviews);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5DE] bg-white px-3.5 py-1.5 text-xs font-medium text-[#202522] shadow-2xs transition-all hover:border-[#2F8F6B] hover:bg-[#F0EEE6] cursor-pointer active:scale-95"
          >
            <span>⭐</span>
            <span>Customer Reviews (Sentiment)</span>
          </button>
        </div>
      </div>

      {parseError && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 animate-slide-up">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
}
