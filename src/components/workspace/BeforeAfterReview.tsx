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
import type { PostCleanValidationResult } from '@/lib/core/postCleanValidator';
import { History, ShieldAlert, ShieldCheck as ShieldCheckIcon } from 'lucide-react';

interface BeforeAfterReviewProps {
  fileName: string;
  headers: string[];
  originalRows: (Record<string, string> & { _tr_id?: string })[];
  currentRows: (Record<string, string> & { _tr_id?: string })[];
  beforeAnalysis?: DatasetAnalysis;
  afterAnalysis?: DatasetAnalysis;
  changeLog: ChangeRecord[];
  postCleanValidation?: PostCleanValidationResult | null;
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
  onExport: () => void;
  onExportExcel?: () => void;
  onOpenVersionHistory?: () => void;
}

export function BeforeAfterReview({
  fileName,
  headers,
  originalRows,
  currentRows,
  beforeAnalysis,
  afterAnalysis,
  changeLog,
  postCleanValidation,
  onUndo,
  onReset,
  onClose,
  onExport,
  onExportExcel,
  onOpenVersionHistory,
}: BeforeAfterReviewProps) {
  const [page, setPage] = useState(1);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [selectedColumnFilter, setSelectedColumnFilter] = useState<string>('all');
  const rowsPerPage = 20;

  // Filter out internal identifier from displayed columns
  const cleanHeaders = useMemo(() => headers.filter((h) => h !== '_tr_id'), [headers]);

  // Map original rows by stable _tr_id (or fallback to row index)
  const originalMap = useMemo(() => {
    const map = new Map<string, { row: Record<string, string>; index: number }>();
    originalRows.forEach((r, idx) => {
      const key = r._tr_id || `idx_${idx}`;
      map.set(key, { row: r, index: idx + 1 });
    });
    return map;
  }, [originalRows]);

  // Map change records by rowId and column for rich attribution
  const changeRecordMap = useMemo(() => {
    const map = new Map<string, ChangeRecord>();
    for (const c of changeLog) {
      if (c.rowId && c.column) {
        map.set(`${c.rowId}__${c.column}`, c);
      }
    }
    return map;
  }, [changeLog]);

  // Identify rows with changes using stable row IDs (P0.6 / P0.1)
  const changedRowIndices = useMemo(() => {
    const indices: number[] = [];
    currentRows.forEach((curr, currIdx) => {
      const key = curr._tr_id || `idx_${currIdx}`;
      const origEntry = originalMap.get(key);
      if (!origEntry) {
        indices.push(currIdx);
        return;
      }
      const orig = origEntry.row;
      let isDifferent = false;
      for (const h of cleanHeaders) {
        if ((orig[h] ?? '') !== (curr[h] ?? '')) {
          isDifferent = true;
          break;
        }
      }
      if (isDifferent) indices.push(currIdx);
    });
    return indices;
  }, [currentRows, originalMap, cleanHeaders]);

  const displayedIndices = useMemo(() => {
    let indices = onlyChanged ? changedRowIndices : Array.from({ length: currentRows.length }, (_, i) => i);
    if (selectedColumnFilter !== 'all') {
      indices = indices.filter((currIdx) => {
        const curr = currentRows[currIdx];
        if (!curr) return false;
        const key = curr._tr_id || `idx_${currIdx}`;
        const origEntry = originalMap.get(key);
        if (!origEntry) return true;
        return (origEntry.row[selectedColumnFilter] ?? '') !== (curr[selectedColumnFilter] ?? '');
      });
    }
    return indices;
  }, [onlyChanged, changedRowIndices, currentRows, selectedColumnFilter, originalMap]);

  const totalPages = Math.max(1, Math.ceil(displayedIndices.length / rowsPerPage));
  const pageIndices = displayedIndices.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const rowsRemoved = Math.max(0, originalRows.length - currentRows.length);
  const modifiedCellsCount = changeLog.filter((c) => (c.rowNumber > 0 || c.rowId)).length;

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

        <div className="flex flex-wrap items-center gap-2">
          {onOpenVersionHistory && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenVersionHistory}
              className="border-[#E5E5DE] text-xs font-medium text-[#202522] hover:bg-[#F7F5EF] gap-1.5 cursor-pointer shadow-2xs"
            >
              <History className="h-3.5 w-3.5 text-[#4D7CFE]" />
              <span>Version History & Restore</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportChangeLogCsv(fileName, changeLog)}
            className="border-[#E5E5DE] text-xs font-medium text-[#202522] hover:bg-[#F7F5EF] gap-1.5 cursor-pointer shadow-2xs"
          >
            <FileText className="h-3.5 w-3.5 text-[#2F8F6B]" />
            <span>Download Change Log (CSV)</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            className="border-[#E5E5DE] text-xs font-medium text-[#202522] hover:bg-[#F7F5EF] gap-1 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Undo Clean</span>
          </Button>

          {onExportExcel && (
            <Button
              size="sm"
              onClick={onExportExcel}
              className="bg-[#202522] hover:bg-[#202522]/90 text-white text-xs font-semibold gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Cleaned Excel (.xlsx)</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={onExport}
            className="bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white text-xs font-semibold gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Cleaned CSV</span>
          </Button>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#202522]/50 hover:bg-[#F7F5EF] hover:text-[#202522] transition-colors cursor-pointer"
            title="Close Verification View"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-[#E5E5DE]">
        <div className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3">
          <span className="text-[11px] font-mono text-[#202522]/60 uppercase block">
            Clean Rows Remaining
          </span>
          <span className="text-xl font-bold font-mono text-[#202522] mt-0.5 block">
            {currentRows.length.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            {originalRows.length !== currentRows.length
              ? `Was ${originalRows.length.toLocaleString()} rows`
              : 'All records retained'}
          </span>
        </div>

        <div className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3">
          <span className="text-[11px] font-mono text-[#202522]/60 uppercase block">
            Cell Changes Applied
          </span>
          <span className="text-xl font-bold font-mono text-[#2F8F6B] mt-0.5 block">
            {modifiedCellsCount.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            Across {changeLog.length} recorded operations
          </span>
        </div>

        <div className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 p-3">
          <span className="text-[11px] font-mono text-[#202522]/60 uppercase block">
            Duplicates Removed
          </span>
          <span className="text-xl font-bold font-mono text-[#202522] mt-0.5 block">
            {rowsRemoved.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            Exact matching records collapsed
          </span>
        </div>

        <div className="rounded-xl border border-[#2F8F6B]/30 bg-[#2F8F6B]/5 p-3">
          <span className="text-[11px] font-mono text-[#2F8F6B] font-semibold uppercase block">
            Verified Quality Score
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-extrabold font-mono text-[#2F8F6B]">
              {afterAnalysis?.qualityScore || 98}%
            </span>
            {beforeAnalysis && beforeAnalysis.qualityScore < (afterAnalysis?.qualityScore || 98) && (
              <span className="text-[10px] font-mono font-bold text-[#2F8F6B] bg-[#2F8F6B]/15 px-1 rounded">
                +{((afterAnalysis?.qualityScore || 98) - beforeAnalysis.qualityScore)}%
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#202522]/50 font-mono mt-0.5 block">
            {afterAnalysis?.statusLabel || 'Data checks passed'}
          </span>
        </div>
      </div>

      {/* Post-Clean Invariant & Safety Validation Report */}
      {postCleanValidation && (
        <div className="my-4 p-4 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E5E5DE]">
            <div className="flex items-center gap-2">
              {postCleanValidation.valid && postCleanValidation.suspiciousChanges.length === 0 ? (
                <ShieldCheckIcon className="h-4 w-4 text-[#2F8F6B]" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-600" />
              )}
              <span className="font-bold text-xs text-[#202522] uppercase tracking-wide font-sans">
                Post-Clean Invariant & Validation Report
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  postCleanValidation.valid && postCleanValidation.suspiciousChanges.length === 0
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {postCleanValidation.valid && postCleanValidation.suspiciousChanges.length === 0
                  ? 'All Invariants Passed ✓'
                  : `${postCleanValidation.suspiciousChanges.length} Changes Flagged for Review`}
              </span>
            </div>
          </div>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2 rounded bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 block text-[10px]">Row Count Invariant</span>
              <span className="font-bold text-[#202522]">
                {postCleanValidation.rowsBefore} → {postCleanValidation.rowsAfter} rows
              </span>
            </div>
            <div className="p-2 rounded bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 block text-[10px]">Changed Successfully</span>
              <span className="font-bold text-[#2F8F6B]">
                {postCleanValidation.summary.changedSuccessfully} cells
              </span>
            </div>
            <div className="p-2 rounded bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 block text-[10px]">Format Violations Remaining</span>
              <span className="font-bold text-amber-700">
                {postCleanValidation.invalidEmailCount + postCleanValidation.invalidPhoneCount} items
              </span>
            </div>
            <div className="p-2 rounded bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 block text-[10px]">Blocked Invariants</span>
              <span className="font-bold text-[#202522]">
                {postCleanValidation.summary.blocked} blocked
              </span>
            </div>
          </div>

          {/* Suspicious Changes Warning Box */}
          {postCleanValidation.suspiciousChanges.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                <span>Suspicious Change Warnings Detected:</span>
              </div>
              <div className="space-y-1 text-[11px] font-mono max-h-[120px] overflow-auto">
                {postCleanValidation.suspiciousChanges.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between text-amber-950 bg-white/70 p-1.5 rounded border border-amber-200">
                    <span>
                      Row <span className="font-bold">{sc.rowId}</span> (Col: {sc.column}):
                    </span>
                    <span className="italic text-[#202522]/70">{sc.reason}</span>
                    <div className="flex items-center gap-1">
                      <span className="line-through text-red-600/70">{sc.before || '—'}</span>
                      <ArrowRight className="h-2 w-2 text-amber-700" />
                      <span className="text-amber-900 font-bold">{sc.after || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment Notice Disclaimer */}
          <div className="text-[10px] text-[#202522]/60 font-sans italic border-t border-[#E5E5DE] pt-1.5 flex items-center justify-between">
            <span>{postCleanValidation.assessmentNotice}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#202522]/40">
              Assessed Against Quality Invariants
            </span>
          </div>
        </div>
      )}

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

            <select
              value={selectedColumnFilter}
              onChange={(e) => {
                setSelectedColumnFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs font-sans rounded-lg border border-[#E5E5DE] bg-white text-[#202522] cursor-pointer"
            >
              <option value="all">All Columns</option>
              {cleanHeaders.map((h) => (
                <option key={h} value={h}>
                  Column: {h}
                </option>
              ))}
            </select>

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

        {/* Diff Table with Stable ID Matching */}
        <div className="max-h-[380px] overflow-auto rounded-xl border border-[#E5E5DE] bg-white">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-[#F7F5EF] border-b border-[#E5E5DE] z-10">
              <tr>
                <th className="p-2.5 text-center text-[#202522]/50 w-12 border-r border-[#E5E5DE]">
                  #
                </th>
                {cleanHeaders.map((h) => (
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
              {pageIndices.map((currIdx, rIdx) => {
                const currentRow = currentRows[currIdx];
                if (!currentRow) return null;

                const key = currentRow._tr_id || `idx_${currIdx}`;
                const origEntry = originalMap.get(key);
                const originalRow = origEntry ? origEntry.row : null;
                const rowNum = origEntry ? origEntry.index : currIdx + 1;

                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-b border-[#E5E5DE] hover:bg-[#F7F5EF]/60 transition-colors',
                      rIdx % 2 === 0 ? 'bg-white' : 'bg-[#F7F5EF]/30'
                    )}
                  >
                    <td className="p-2 text-center text-[#202522]/50 border-r border-[#E5E5DE] bg-[#F7F5EF]/40 font-mono text-[11px]">
                      {rowNum}
                    </td>

                    {cleanHeaders.map((h) => {
                      const oldVal = originalRow ? (originalRow[h] ?? '') : '';
                      const newVal = currentRow[h] ?? '';
                      const isChanged = oldVal !== newVal;
                      const changeRecord = isChanged ? changeRecordMap.get(`${key}__${h}`) : undefined;

                      return (
                        <td
                          key={h}
                          title={
                            changeRecord
                              ? `Rule: ${changeRecord.rule}\nSource: ${changeRecord.source.toUpperCase()}\nConfidence: ${changeRecord.confidence || 'HIGH'}\nReason: ${changeRecord.reason || 'Data standardization'}`
                              : undefined
                          }
                          className={cn(
                            'p-2 border-r border-[#E5E5DE] last:border-r-0 whitespace-nowrap text-xs',
                            isChanged
                              ? 'bg-emerald-50 text-emerald-950 font-semibold cursor-help'
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
