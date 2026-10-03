import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  History,
  RotateCcw,
  GitCommit,
  ArrowRight,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  SplitSquareVertical,
} from 'lucide-react';
import type { DatasetVersion } from '@/lib/core/types';
import type { VersionComparisonResult } from '@/lib/core/transaction';

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: DatasetVersion[];
  currentVersionNumber: number;
  onRestoreVersion: (versionNumber: number) => void;
  onCompareVersions: (v1: number, v2: number) => VersionComparisonResult;
}

export function VersionHistoryModal({
  open,
  onOpenChange,
  versions,
  currentVersionNumber,
  onRestoreVersion,
  onCompareVersions,
}: VersionHistoryModalProps) {
  const [selectedCompareVersion, setSelectedCompareVersion] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<VersionComparisonResult | null>(null);

  const handleSelectCompare = (vNum: number) => {
    if (vNum === currentVersionNumber) {
      setSelectedCompareVersion(null);
      setCompareResult(null);
      return;
    }
    setSelectedCompareVersion(vNum);
    const res = onCompareVersions(vNum, currentVersionNumber);
    setCompareResult(res);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white border border-[#E5E5DE] shadow-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#202522] text-white">
              <History className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="font-sans font-bold text-lg text-[#202522]">
                Version History & Immutability Ledger
              </DialogTitle>
              <DialogDescription className="text-xs text-[#202522]/70 font-sans">
                Every transformation creates an immutable snapshot. Restoring a prior state appends a new version without erasing audit history.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-2 text-xs font-sans">
          {/* Comparison Panel if active */}
          {compareResult && selectedCompareVersion !== null && (
            <div className="p-4 rounded-xl border border-[#4D7CFE]/30 bg-[#4D7CFE]/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#202522] flex items-center gap-1.5">
                  <SplitSquareVertical className="h-4 w-4 text-[#4D7CFE]" />
                  <span>
                    Diff: Version v{selectedCompareVersion} vs Current (v{currentVersionNumber})
                  </span>
                </span>
                <button
                  onClick={() => {
                    setSelectedCompareVersion(null);
                    setCompareResult(null);
                  }}
                  className="text-[#202522]/50 hover:text-[#202522] cursor-pointer"
                  aria-label="Close comparison"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded bg-white border border-[#E5E5DE]">
                  <span className="text-[#202522]/60 block text-[10px]">Row Count Delta</span>
                  <span className="font-bold text-[#202522]">
                    {compareResult.rowCountBefore} → {compareResult.rowCountAfter}
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E5E5DE]">
                  <span className="text-[#202522]/60 block text-[10px]">Modified Rows</span>
                  <span className="font-bold text-[#2F8F6B]">
                    {compareResult.modifiedRows.length} rows
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E5E5DE]">
                  <span className="text-[#202522]/60 block text-[10px]">Changed Cells</span>
                  <span className="font-bold text-[#4D7CFE]">
                    {compareResult.diffCount} cells
                  </span>
                </div>
              </div>

              {compareResult.modifiedRows.length > 0 && (
                <div className="max-h-[140px] overflow-auto rounded-lg border border-[#E5E5DE] bg-white p-2">
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {compareResult.modifiedRows.slice(0, 10).map((mr) => (
                      <div key={mr.rowId} className="flex items-center justify-between text-[#202522]/80">
                        <span>Row ({mr.rowId}):</span>
                        <div className="space-x-2">
                          {mr.changes.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-[#F7F5EF] px-1.5 py-0.5 rounded text-[10px]">
                              <span className="text-[#202522]/50">{c.column}:</span>
                              <span className="line-through text-red-600/70">{c.before || '—'}</span>
                              <ArrowRight className="h-2 w-2 text-[#2F8F6B]" />
                              <span className="text-[#2F8F6B] font-semibold">{c.after || '—'}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {compareResult.modifiedRows.length > 10 && (
                      <div className="text-[10px] text-[#202522]/50 pt-1 text-center italic">
                        ...and {compareResult.modifiedRows.length - 10} more modified rows
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Versions Timeline List */}
          <div className="space-y-2.5">
            <span className="font-mono text-[11px] text-[#202522]/60 uppercase block font-semibold">
              Chronological Version Chain ({versions.length} versions recorded)
            </span>

            {[...versions].reverse().map((ver) => {
              const isCurrent = ver.versionNumber === currentVersionNumber;
              const isCompared = selectedCompareVersion === ver.versionNumber;

              return (
                <div
                  key={ver.versionId}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-[#2F8F6B] bg-[#2F8F6B]/5 shadow-2xs'
                      : 'border-[#E5E5DE] bg-white hover:border-[#202522]/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold shrink-0 mt-0.5 ${
                        isCurrent
                          ? 'bg-[#2F8F6B] text-white'
                          : 'bg-[#F7F5EF] text-[#202522]/70 border border-[#E5E5DE]'
                      }`}
                    >
                      v{ver.versionNumber}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#202522] text-xs">
                          {ver.label || (ver.versionNumber === 0 ? 'Initial Import' : `Version ${ver.versionNumber}`)}
                        </span>
                        {isCurrent && (
                          <span className="font-mono text-[10px] font-semibold text-[#2F8F6B] bg-[#2F8F6B]/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Active Master
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[#202522]/60 font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(ver.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span>•</span>
                        <span>{ver.rows.length.toLocaleString()} rows</span>
                        <span>•</span>
                        <span>{ver.headers.filter((h) => h !== '_tr_id').length} columns</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrent && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectCompare(ver.versionNumber)}
                          className={`h-7 px-2.5 text-xs font-sans border-[#E5E5DE] cursor-pointer ${
                            isCompared ? 'bg-[#4D7CFE]/10 border-[#4D7CFE] text-[#4D7CFE]' : 'bg-white text-[#202522]'
                          }`}
                        >
                          <SplitSquareVertical className="h-3 w-3 mr-1" />
                          <span>{isCompared ? 'Comparing' : 'Compare'}</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onRestoreVersion(ver.versionNumber);
                            onOpenChange(false);
                          }}
                          className="h-7 px-2.5 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522] hover:bg-[#F0EEE6] hover:text-[#2F8F6B] cursor-pointer gap-1"
                        >
                          <RotateCcw className="h-3 w-3 text-[#2F8F6B]" />
                          <span>Restore v{ver.versionNumber}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-[#E5E5DE]">
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs bg-[#202522] text-white hover:bg-[#202522]/90 cursor-pointer"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
