import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Columns,
  Hash,
  Type,
  Calendar,
  Binary,
  Mail,
  Phone,
  HelpCircle,
  Filter,
  X,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DatasetAnalysis, ColumnProfile } from '@/lib/analyzer';

interface DataHealthReportProps {
  analysis: DatasetAnalysis;
  onFilterByColumn?: (column: string) => void;
  onFilterByIssue?: (issueId: string) => void;
  activeIssueFilter?: string | null;
  onClearIssueFilter?: () => void;
  isSampled?: boolean;
  sampleSize?: number;
  totalRows?: number;
}

export function DataHealthReport({
  analysis,
  onFilterByColumn,
  onFilterByIssue,
  activeIssueFilter,
  onClearIssueFilter,
  isSampled,
  sampleSize,
  totalRows,
}: DataHealthReportProps) {
  const [selectedProfileColumn, setSelectedProfileColumn] = useState<ColumnProfile | null>(null);

  const getDimensionColor = (score: number) => {
    if (score >= 90) return 'text-[#2F8F6B] bg-[#2F8F6B]/10 border-[#2F8F6B]/30';
    if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 90) return 'bg-[#2F8F6B]';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="rounded-2xl border border-[#E5E5DE] bg-white p-5 sm:p-6 shadow-xs mb-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E5DE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#2F8F6B] uppercase flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              <span>Data Quality Engine 2.0</span>
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5E5DE]" />
            <span className="font-mono text-xs text-[#202522]/60">
              Live Health Audit
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#202522] font-sans mt-0.5">
            Dataset Health & Column Profiling
          </h2>
          <p className="text-[11px] text-[#202522]/60 font-sans mt-0.5">
            Quality assessment based on structural and heuristic checks. Not an absolute guarantee.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSampled && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-sans">
              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
              <span>Sampled ({sampleSize ?? 1000} of {totalRows ?? 'all'} rows)</span>
            </div>
          )}
          {activeIssueFilter && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#202522] text-white text-xs font-sans">
              <Filter className="h-3 w-3" />
              <span>Filtered by issue</span>
              <button
                onClick={onClearIssueFilter}
                className="hover:text-red-300 ml-1 cursor-pointer"
                title="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]">
            <span className="text-xs font-sans text-[#202522]/70">Overall Readiness:</span>
            <span className="font-mono text-sm font-extrabold text-[#202522]">
              {analysis.dimensions.overall}%
            </span>
          </div>
        </div>
      </div>

      {/* 4 Core Dimensions: Completeness, Validity, Consistency, Uniqueness */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-[#E5E5DE]">
        {/* Completeness */}
        <div className="p-3.5 rounded-xl bg-[#F7F5EF]/60 border border-[#E5E5DE] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-sans text-[#202522]/70 mb-1">
              <span>Completeness</span>
              <span className="font-mono font-bold text-[#202522]">
                {analysis.dimensions.completeness}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#E5E5DE] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreBarColor(analysis.dimensions.completeness)}`}
                style={{ width: `${analysis.dimensions.completeness}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#202522]/60 font-sans">
            {analysis.emptyCells + analysis.explicitPlaceholderCells > 0
              ? `${analysis.emptyCells + analysis.explicitPlaceholderCells} missing or empty cells`
              : 'Zero empty fields'}
          </p>
        </div>

        {/* Validity */}
        <div className="p-3.5 rounded-xl bg-[#F7F5EF]/60 border border-[#E5E5DE] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-sans text-[#202522]/70 mb-1">
              <span>Validity</span>
              <span className="font-mono font-bold text-[#202522]">
                {analysis.dimensions.validity}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#E5E5DE] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreBarColor(analysis.dimensions.validity)}`}
                style={{ width: `${analysis.dimensions.validity}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#202522]/60 font-sans">
            {analysis.brokenFormatsCount > 0
              ? `${analysis.brokenFormatsCount} format anomalies`
              : 'Syntax & format checks passed'}
          </p>
        </div>

        {/* Consistency */}
        <div className="p-3.5 rounded-xl bg-[#F7F5EF]/60 border border-[#E5E5DE] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-sans text-[#202522]/70 mb-1">
              <span>Consistency</span>
              <span className="font-mono font-bold text-[#202522]">
                {analysis.dimensions.consistency}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#E5E5DE] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreBarColor(analysis.dimensions.consistency)}`}
                style={{ width: `${analysis.dimensions.consistency}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#202522]/60 font-sans">
            {analysis.inconsistentCaseCount + analysis.whitespaceIssuesCount > 0
              ? `${analysis.inconsistentCaseCount + analysis.whitespaceIssuesCount} casing & whitespace errors`
              : 'Uniform casing & spaces'}
          </p>
        </div>

        {/* Uniqueness */}
        <div className="p-3.5 rounded-xl bg-[#F7F5EF]/60 border border-[#E5E5DE] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-sans text-[#202522]/70 mb-1">
              <span>Uniqueness</span>
              <span className="font-mono font-bold text-[#202522]">
                {analysis.dimensions.uniqueness}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#E5E5DE] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreBarColor(analysis.dimensions.uniqueness)}`}
                style={{ width: `${analysis.dimensions.uniqueness}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#202522]/60 font-sans">
            {analysis.normalizedDuplicateRows > 0
              ? `${analysis.normalizedDuplicateRows} duplicate rows`
              : 'All records distinct'}
          </p>
        </div>
      </div>

      {/* Column Quality Profiles Row */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="font-sans font-semibold text-[#202522] flex items-center gap-1.5">
            <Columns className="h-3.5 w-3.5 text-[#202522]/70" />
            <span>Column Quality Profiles (Click column to view profile & issues)</span>
          </span>
          <span className="text-[11px] font-mono text-[#202522]/50">
            {analysis.columnProfiles.length} columns profiled
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {analysis.columnProfiles.map((col) => {
            const isSelected = selectedProfileColumn?.columnName === col.columnName;

            return (
              <button
                key={col.columnName}
                onClick={() => setSelectedProfileColumn(isSelected ? null : col)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#202522] bg-[#202522] text-white shadow-xs'
                    : 'border-[#E5E5DE] bg-white hover:border-[#202522]/40 hover:bg-[#F7F5EF]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={`font-sans font-bold text-xs truncate max-w-[100px] ${
                        isSelected ? 'text-white' : 'text-[#202522]'
                      }`}
                    >
                      {col.columnName}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[#E5E5DE]/80 text-[#202522]/70'
                      }`}
                    >
                      {col.inferredType}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className={isSelected ? 'text-white/70' : 'text-[#202522]/50'}>
                      Quality:
                    </span>
                    <span
                      className={`font-bold ${
                        isSelected
                          ? 'text-[#2F8F6B]'
                          : col.columnScore >= 80
                          ? 'text-[#2F8F6B]'
                          : 'text-amber-600'
                      }`}
                    >
                      {col.columnScore}/100
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] font-mono flex items-center justify-between">
                  <span
                    className={
                      col.issues.length > 0
                        ? isSelected
                          ? 'text-amber-300 font-semibold'
                          : 'text-amber-600 font-semibold'
                        : isSelected
                        ? 'text-emerald-300'
                        : 'text-[#2F8F6B]'
                    }
                  >
                    {col.issues.length > 0 ? `${col.issues.length} issue(s)` : 'Clean ✓'}
                  </span>
                  <ChevronRight
                    className={`h-3 w-3 ${isSelected ? 'text-white/60' : 'text-[#202522]/30'}`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Column Profile Drawer / Panel */}
        {selectedProfileColumn && (
          <div className="mt-4 p-4 rounded-xl border border-[#202522]/30 bg-[#F7F5EF] animate-fade-in text-xs font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5DE]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#202522]">
                  Column Profile: "{selectedProfileColumn.columnName}"
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-[#E5E5DE] text-[#202522]/80 uppercase">
                  Type: {selectedProfileColumn.inferredType} ({selectedProfileColumn.typeConfidence}% confidence)
                </span>
              </div>
              <button
                onClick={() => setSelectedProfileColumn(null)}
                className="text-[#202522]/50 hover:text-[#202522] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 py-3 border-b border-[#E5E5DE] font-mono text-[11px]">
              <div className="p-2.5 rounded bg-white border border-[#E5E5DE]">
                <span className="text-[#202522]/50 block">Completeness</span>
                <span className="text-sm font-bold text-[#202522]">
                  {selectedProfileColumn.completenessScore}%
                </span>
                <span className="text-[10px] text-[#202522]/60 block mt-0.5">
                  {selectedProfileColumn.emptyCount} empty values
                </span>
              </div>

              <div className="p-2.5 rounded bg-white border border-[#E5E5DE]">
                <span className="text-[#202522]/50 block">Validity</span>
                <span className="text-sm font-bold text-[#202522]">
                  {selectedProfileColumn.validityScore}%
                </span>
                <span className="text-[10px] text-[#202522]/60 block mt-0.5">
                  {selectedProfileColumn.invalidCount} invalid formats
                </span>
              </div>

              <div className="p-2.5 rounded bg-white border border-[#E5E5DE]">
                <span className="text-[#202522]/50 block">Uniqueness</span>
                <span className="text-sm font-bold text-[#202522]">
                  {selectedProfileColumn.uniquenessScore}%
                </span>
                <span className="text-[10px] text-[#202522]/60 block mt-0.5">
                  {selectedProfileColumn.duplicateCount} repeated values
                </span>
              </div>

              <div className="p-2.5 rounded bg-white border border-[#E5E5DE]">
                <span className="text-[#202522]/50 block">Overall Score</span>
                <span className="text-sm font-bold text-[#2F8F6B]">
                  {selectedProfileColumn.columnScore}/100
                </span>
                <span className="text-[10px] text-[#202522]/60 block mt-0.5">
                  Evaluated across {selectedProfileColumn.totalCount} values
                </span>
              </div>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-mono text-[11px] text-[#202522]/60 mr-2">Sample values:</span>
                <span className="font-mono text-[11px] text-[#202522]">
                  {selectedProfileColumn.sampleValues.slice(0, 4).join(', ') || 'No values'}
                </span>
              </div>

              {selectedProfileColumn.issues.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-800 text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Issues: {selectedProfileColumn.issues.join(' · ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
