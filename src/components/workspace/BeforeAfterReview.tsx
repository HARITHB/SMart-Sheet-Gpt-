import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  X,
  FileText,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertTriangle,
  UploadCloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportChangeLogCsv, type ChangeRecord } from '@/lib/changelog';
import type { DatasetAnalysis } from '@/lib/analyzer';

interface BeforeAfterReviewProps {
  fileName: string;
  headers: string[];
  originalRows: Record<string, string>[];
  currentRows: Record<string, string>[];
  beforeAnalysis?: DatasetAnalysis;
  afterAnalysis?: DatasetAnalysis;
  changeLog: ChangeRecord[];
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
  onExport: () => void;
}

export function BeforeAfterReview({
  fileName,
  headers,
  originalRows,
  currentRows,
  beforeAnalysis,
  afterAnalysis,
  changeLog,
  onUndo,
  onReset,
  onClose,
  onExport,
}: BeforeAfterReviewProps) {
  const [page, setPage] = useState(1);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const rowsPerPage = 20;

  // Identify rows with changes
  const changedRowIndices = useMemo(() => {
    const indices: number[] = [];
    const minRows = Math.min(originalRows.length, currentRows.length);
    for (let i = 0; i < minRows; i++) {
      let isDifferent = false;
      for (const h of headers) {
        if ((originalRows[i]?.[h] ?? '') !== (currentRows[i]?.[h] ?? '')) {
          isDifferent = true;
          break;
        }
      }
      if (isDifferent) indices.push(i);
    }
    return indices;
  }, [originalRows, currentRows, headers]);

  const displayedIndices = useMemo(() => {
    if (onlyChanged) return changedRowIndices;
    return Array.from({ length: currentRows.length }, (_, i) => i);
  }, [onlyChanged, changedRowIndices, currentRows.length]);

  const totalPages = Math.max(1, Math.ceil(displayedIndices.length / rowsPerPage));
  const pageIndices = displayedIndices.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const rowsRemoved = Math.max(0, originalRows.length - currentRows.length);
  const modifiedCellsCount = changeLog.filter((c) => c.rowNumber > 0).length;

  return (
    <div className="rounded-2xl border-2 border-[#2F8F6B]/40 bg-white p-5 sm:p-6 shadow-sm mb-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5DE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#2F8F6B] uppercase">
              Step 05 — Verify & Diff
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5E5DE]" />
            <span className="font-mono text-xs text-[#202522]/60">
              Live Before vs After Verification
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#202522] font-sans mt-0.5">
            Cleaning complete. Your spreadsheet is ready.
          </h2>
          <p className="text-xs text-[#202522]/70 font-sans mt-0.5">
            Review exactly what changed, what remains, and download your clean spreadsheet.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            className="h-8 gap-1.5 px-3 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522] hover:bg-[#F0EEE6] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Undo Step</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportChangeLogCsv(fileName, changeLog)}
            className="h-8 gap-1.5 px-3 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522] hover:bg-[#F0EEE6] cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5 text-[#2F8F6B]" />
            <span>Download Change Log (CSV)</span>
          </Button>

          <Button
            size="sm"
            onClick={onExport}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white cursor-pointer shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Cleaned Spreadsheet</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="h-8 gap-1.5 px-3 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522]/70 hover:text-[#202522] cursor-pointer"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Clean Another File</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 gap-1 px-2.5 text-xs font-sans border-[#E5E5DE] bg-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close Diff</span>
          </Button>
        </div>
      </div>

      {/* Validation Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-[#E5E5DE] text-xs font-sans">
        <div className="p-3 rounded-xl bg-[#F7F5EF] border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Rows Remaining</span>
          <span className="text-base font-extrabold text-[#202522] font-mono mt-0.5 block">
            {currentRows.length.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            {originalRows.length.toLocaleString()} originally uploaded
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#2F8F6B]/5 border border-[#2F8F6B]/20">
          <span className="text-[#2F8F6B] block font-sans font-medium">Cell Changes Applied</span>
          <span className="text-base font-extrabold text-[#2F8F6B] font-mono mt-0.5 block">
            {modifiedCellsCount.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#2F8F6B]/70 font-mono mt-0.5 block">
            Across {headers.length} columns
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F5EF] border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Duplicates Resolved</span>
          <span className="text-base font-extrabold text-[#202522] font-mono mt-0.5 block">
            {rowsRemoved.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            Unique records preserved
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#2F8F6B]/10 border border-[#2F8F6B]/30">
          <span className="text-[#2F8F6B] block font-sans font-medium">Post-Clean Status</span>
          <span className="text-sm font-bold text-[#2F8F6B] font-sans mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{afterAnalysis?.statusLabel || 'Data checks passed'}</span>
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            {afterAnalysis?.flags.length || 0} items for human review
          </span>
        </div>
      </div>

      {/* Filter and Table Controls */}
      <div className="pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setOnlyChanged(!onlyChanged);
                setPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-sans font-semibold border transition-all cursor-pointer',
                onlyChanged
                  ? 'bg-[#202522] text-white border-[#202522]'
                  : 'bg-white text-[#202522] border-[#E5E5DE] hover:bg-[#F0EEE6]'
              )}
            >
              <Filter className="h-3 w-3" />
              <span>Only Changed Rows ({changedRowIndices.length})</span>
            </button>
            <span className="text-[#202522]/60 font-mono text-[11px]">
              Showing {displayedIndices.length} total rows
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#202522]/60">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-7 px-2 text-xs border-[#E5E5DE] bg-white cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-7 px-2 text-xs border-[#E5E5DE] bg-white cursor-pointer"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Diff Table */}
        <div className="max-h-[380px] overflow-auto rounded-xl border border-[#E5E5DE] bg-white">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-[#F7F5EF] border-b border-[#E5E5DE] z-10">
              <tr>
                <th className="p-2.5 text-center text-[#202522]/50 w-12 border-r border-[#E5E5DE]">
                  #
                </th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="p-2.5 text-left font-semibold text-[#202522] border-r border-[#E5E5DE] last:border-r-0 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageIndices.map((origIdx, rIdx) => {
                const originalRow = originalRows[origIdx];
                const currentRow = currentRows[origIdx];

                return (
                  <tr
                    key={origIdx}
                    className={cn(
                      'border-b border-[#E5E5DE] hover:bg-[#F7F5EF]/60 transition-colors',
                      rIdx % 2 === 0 ? 'bg-white' : 'bg-[#F7F5EF]/30'
                    )}
                  >
                    <td className="p-2 text-center text-[#202522]/50 border-r border-[#E5E5DE] bg-[#F7F5EF]/40 font-mono text-[11px]">
                      {origIdx + 1}
                    </td>

                    {headers.map((h) => {
                      const oldVal = originalRow?.[h] ?? '';
                      const newVal = currentRow?.[h] ?? '';
                      const isChanged = oldVal !== newVal;

                      return (
                        <td
                          key={h}
                          className={cn(
                            'p-2 border-r border-[#E5E5DE] last:border-r-0 whitespace-nowrap text-xs',
                            isChanged
                              ? 'bg-emerald-50 text-emerald-950 font-semibold'
                              : 'text-[#202522]'
                          )}
                        >
                          {isChanged ? (
                            <div className="flex items-center gap-1.5">
                              <span className="line-through text-red-600/70 text-[11px]">
                                {oldVal || '—'}
                              </span>
                              <ArrowRight className="h-2.5 w-2.5 text-[#2F8F6B]" />
                              <span className="text-[#2F8F6B] font-bold">{newVal || '—'}</span>
                            </div>
                          ) : (
                            newVal || <span className="text-[#202522]/30 italic">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
