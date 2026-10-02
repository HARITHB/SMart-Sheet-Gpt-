import React, { useState } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Wand2,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DESTINATION_PACKS,
  evaluateDestinationReadiness,
  exportDestinationReadyCsv,
  type DestinationPack,
  type ReadinessEvaluation,
} from '@/lib/destinationReadiness';
import type { CleaningStep } from '@/lib/workflows';

interface DestinationReadinessCardProps {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  onApplyDestinationFixes: (pack: DestinationPack, mapping: Record<string, string>, steps: CleaningStep[]) => void;
}

export function DestinationReadinessCard({
  headers,
  rows,
  fileName,
  onApplyDestinationFixes,
}: DestinationReadinessCardProps) {
  const [selectedPackId, setSelectedPackId] = useState<string>('hubspot_crm');

  const currentPack =
    DESTINATION_PACKS.find((p) => p.id === selectedPackId) || DESTINATION_PACKS[0];

  const evaluation: ReadinessEvaluation = evaluateDestinationReadiness(
    headers,
    rows,
    currentPack
  );

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-[#2F8F6B] bg-[#2F8F6B]/10 border-[#2F8F6B]/30';
    if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-300';
    return 'text-rose-700 bg-rose-50 border-rose-300';
  };

  const getBarColor = (score: number) => {
    if (score >= 90) return 'bg-[#2F8F6B]';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="rounded-2xl border-2 border-[#4D7CFE]/30 bg-white p-5 sm:p-6 shadow-xs mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5DE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#4D7CFE] uppercase flex items-center gap-1">
              <Compass className="h-3.5 w-3.5" />
              <span>Commercial Differentiator</span>
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5E5DE]" />
            <span className="font-mono text-xs text-[#202522]/60">
              System-Specific Data Preparation
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#202522] font-sans mt-0.5">
            Destination Readiness & Schema Packs
          </h2>
          <p className="text-xs text-[#202522]/70 font-sans mt-0.5">
            What are you trying to use this spreadsheet for? Select your destination system to verify readiness.
          </p>
        </div>

        {/* Destination Selector Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {DESTINATION_PACKS.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedPackId(pack.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
                selectedPackId === pack.id
                  ? 'bg-[#4D7CFE] text-white shadow-2xs'
                  : 'bg-[#F7F5EF] text-[#202522]/70 hover:bg-[#EFECE3]'
              }`}
            >
              {pack.badge}
            </button>
          ))}
        </div>
      </div>

      {/* Readiness Overview Panel */}
      <div className="py-4 border-b border-[#E5E5DE]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#202522] font-sans">
                {currentPack.name}
              </span>
              <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {currentPack.category} Pack
              </span>
            </div>
            <p className="text-xs text-[#202522]/70 font-sans mt-1 max-w-2xl leading-relaxed">
              {currentPack.description}
            </p>
          </div>

          {/* Readiness Meter Gauge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-[10px] font-mono text-[#202522]/60 uppercase block">
                Destination Readiness
              </span>
              <span
                className={`font-mono text-2xl font-extrabold block ${
                  evaluation.readinessScore >= 90
                    ? 'text-[#2F8F6B]'
                    : evaluation.readinessScore >= 70
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              >
                {evaluation.readinessScore}% Ready
              </span>
            </div>

            <div className="w-24 sm:w-32">
              <div className="h-3 w-full bg-[#F7F5EF] border border-[#E5E5DE] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getBarColor(
                    evaluation.readinessScore
                  )}`}
                  style={{ width: `${evaluation.readinessScore}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-[#202522]/50 block mt-1 text-center">
                {evaluation.mappedFieldCount} of {evaluation.totalFieldsCount} fields mapped
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Blocking Issues & Passed Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 border-b border-[#E5E5DE] text-xs font-sans">
        {/* Blocking Issues */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              <span>
                Needs Attention for {currentPack.systemName} ({evaluation.blockingIssues.length})
              </span>
            </span>
            <span className="text-[10px] font-mono text-[#202522]/50">
              Must resolve prior to import
            </span>
          </div>

          {evaluation.blockingIssues.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#2F8F6B]/10 text-[#2F8F6B] flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Zero blocking issues! All destination constraints satisfied.</span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[160px] overflow-auto">
              {evaluation.blockingIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-rose-200 bg-rose-50/60 flex items-start gap-2"
                >
                  <span className="font-mono text-[10px] text-rose-700 font-bold mt-0.5">
                    0{idx + 1}.
                  </span>
                  <div className="flex-1">
                    <span className="font-semibold text-rose-900 block">{issue.field}:</span>
                    <span className="text-rose-800 text-[11px] leading-tight block">
                      {issue.issue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Passed Checks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Passed Destination Checks ({evaluation.passedChecks.length})</span>
            </span>
            <span className="text-[10px] font-mono text-[#202522]/50">
              Validated automatically
            </span>
          </div>

          <div className="space-y-1.5 max-h-[160px] overflow-auto">
            {evaluation.passedChecks.map((check, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 flex items-center gap-2 text-emerald-900 text-[11px]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{check}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span className="text-[#202522]/60 font-mono text-[11px]">
          Target: {currentPack.systemName} standard import CSV specification
        </span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              onApplyDestinationFixes(
                currentPack,
                evaluation.mapping,
                evaluation.autoFixSteps
              )
            }
            className="h-9 px-4 bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white font-semibold text-xs cursor-pointer shadow-2xs gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>Make Ready for {currentPack.systemName}</span>
          </Button>

          <Button
            size="sm"
            onClick={() =>
              exportDestinationReadyCsv(fileName, rows, currentPack, evaluation.mapping)
            }
            className="h-9 px-4 bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-xs cursor-pointer shadow-2xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download {currentPack.systemName}-Ready CSV</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
