import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
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
  Layers,
  UploadCloud,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { parseExcelFile } from '@/lib/excel';
import { mergeDatasets, type MergeConfig, type MergeResult } from '@/lib/datasetMerge';

interface MultiFileMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryFileName: string;
  primaryHeaders: string[];
  primaryRows: Record<string, string>[];
  onMergeComplete: (result: MergeResult, secondaryFileName: string) => void;
}

export function MultiFileMergeDialog({
  open,
  onOpenChange,
  primaryFileName,
  primaryHeaders,
  primaryRows,
  onMergeComplete,
}: MultiFileMergeDialogProps) {
  const [secondaryFile, setSecondaryFile] = useState<{
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);

  const [primaryKey, setPrimaryKey] = useState<string>(primaryHeaders[0] || '');
  const [secondaryKey, setSecondaryKey] = useState<string>('');
  const [joinType, setJoinType] = useState<MergeConfig['joinType']>('full_outer');
  const [conflictResolution, setConflictResolution] =
    useState<MergeConfig['conflictResolution']>('prefer_primary');
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-suggest join keys based on matching names
  const handleFileLoaded = (fileName: string, headers: string[], rows: Record<string, string>[]) => {
    setSecondaryFile({ fileName, headers, rows });
    setErrorMsg(null);

    // Look for matching key like email, phone, id
    const candidatePrimary = primaryHeaders.find((h) =>
      headers.some((s) => s.toLowerCase() === h.toLowerCase())
    );
    if (candidatePrimary) {
      setPrimaryKey(candidatePrimary);
      const candidateSecondary = headers.find(
        (s) => s.toLowerCase() === candidatePrimary.toLowerCase()
      );
      if (candidateSecondary) setSecondaryKey(candidateSecondary);
    } else {
      setSecondaryKey(headers[0] || '');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMsg(null);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const parsed = await parseExcelFile(file);
        handleFileLoaded(parsed.fileName, parsed.headers, parsed.rows);
      } else {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const headers = results.meta.fields ?? [];
            handleFileLoaded(file.name, headers, results.data);
            setIsParsing(false);
          },
          error: (err) => {
            setErrorMsg(err.message);
            setIsParsing(false);
          },
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to read file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteMerge = () => {
    if (!secondaryFile || !primaryKey || !secondaryKey) return;

    try {
      const result = mergeDatasets(
        primaryHeaders,
        primaryRows,
        secondaryFile.headers,
        secondaryFile.rows,
        {
          primaryKey,
          secondaryKey,
          joinType,
          conflictResolution,
        }
      );

      onMergeComplete(result, secondaryFile.fileName);
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Dataset merge failed due to conflict');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border border-[#E5E5DE] shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#202522] text-white">
              <Layers className="h-4 w-4" />
            </div>
            <DialogTitle className="font-sans font-bold text-lg text-[#202522]">
              Multi-File Dataset Merging
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#202522]/70 font-sans">
            Merge a secondary spreadsheet into your master dataset. Match records by email, phone, or ID, and resolve field conflicts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs font-sans">
          {/* Master file indicator */}
          <div className="p-3 rounded-xl bg-[#F7F5EF] border border-[#E5E5DE] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#2F8F6B]" />
              <div>
                <span className="font-bold text-[#202522] block">Primary Dataset: {primaryFileName}</span>
                <span className="text-[11px] text-[#202522]/60 font-mono">
                  {primaryRows.length.toLocaleString()} rows · {primaryHeaders.length} columns
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              Active Master
            </span>
          </div>

          {/* Secondary File Upload / Selection */}
          {!secondaryFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#E5E5DE] hover:border-[#4D7CFE] rounded-xl p-6 text-center cursor-pointer bg-white transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <UploadCloud className="h-8 w-8 text-[#4D7CFE] mx-auto mb-2" />
              <p className="font-semibold text-[#202522]">
                {isParsing ? 'Reading secondary file...' : 'Choose or drop secondary file to merge'}
              </p>
              <p className="text-[11px] text-[#202522]/60 mt-1 font-mono">
                Supports .csv, .tsv, .xlsx (e.g. leads_part2.csv, march_orders.xlsx)
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#4D7CFE]/5 border border-[#4D7CFE]/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#4D7CFE]" />
                <div>
                  <span className="font-bold text-[#202522] block">
                    Incoming File: {secondaryFile.fileName}
                  </span>
                  <span className="text-[11px] text-[#202522]/60 font-mono">
                    {secondaryFile.rows.length.toLocaleString()} rows · {secondaryFile.headers.length} columns
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSecondaryFile(null)}
                className="text-xs text-red-600 hover:underline cursor-pointer"
              >
                Change file
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Merge Configurations */}
          {secondaryFile && (
            <div className="space-y-3 pt-2 border-t border-[#E5E5DE]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Primary Key */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#202522] mb-1">
                    Primary Join Key Column:
                  </label>
                  <select
                    value={primaryKey}
                    onChange={(e) => setPrimaryKey(e.target.value)}
                    className="w-full rounded-md border border-[#E5E5DE] bg-white px-2 py-1.5 text-xs font-mono text-[#202522]"
                  >
                    {primaryHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Secondary Key */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#202522] mb-1">
                    Incoming Join Key Column:
                  </label>
                  <select
                    value={secondaryKey}
                    onChange={(e) => setSecondaryKey(e.target.value)}
                    className="w-full rounded-md border border-[#E5E5DE] bg-white px-2 py-1.5 text-xs font-mono text-[#202522]"
                  >
                    {secondaryFile.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* Join Type */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#202522] mb-1">
                    Join Operation:
                  </label>
                  <select
                    value={joinType}
                    onChange={(e) => setJoinType(e.target.value as any)}
                    className="w-full rounded-md border border-[#E5E5DE] bg-white px-2 py-1.5 text-xs font-sans text-[#202522]"
                  >
                    <option value="full_outer">Combine All (Full Outer Join)</option>
                    <option value="left">Enrich Primary Only (Left Join)</option>
                    <option value="inner">Matched Records Only (Inner Join)</option>
                  </select>
                </div>

                {/* Conflict Resolution */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#202522] mb-1">
                    Conflict Resolution (Differing Values):
                  </label>
                  <select
                    value={conflictResolution}
                    onChange={(e) => setConflictResolution(e.target.value as any)}
                    className="w-full rounded-md border border-[#E5E5DE] bg-white px-2 py-1.5 text-xs font-sans text-[#202522]"
                  >
                    <option value="prefer_primary">Keep Primary Master Value</option>
                    <option value="prefer_secondary">Overwrite with Incoming Value</option>
                    <option value="combine">Combine Both (Value A | Value B)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-3">
          <span className="text-[11px] font-mono text-[#202522]/60">
            Original datasets remain preserved in version history.
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-[#E5E5DE] text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteMerge}
              disabled={!secondaryFile}
              className="bg-[#202522] hover:bg-[#202522]/90 text-white text-xs font-semibold cursor-pointer shadow-2xs gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Execute Merge</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
