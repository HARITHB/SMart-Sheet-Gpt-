import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Type,
  Wand2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Bookmark,
  Layers,
  ChevronRight,
  Info,
  Check,
  Sliders,
  Users,
} from 'lucide-react';
import type { DatasetAnalysis, FuzzyDuplicateCandidate } from '@/lib/analyzer';
import type { CleaningStep, CleaningWorkflow } from '@/lib/workflows';

interface CleaningPlanProps {
  fileName: string;
  analysis: DatasetAnalysis;
  headers: string[];
  onApplyAllRecommended: () => void;
  onRemoveDuplicates: () => void;
  onStandardizeTitleCase: () => void;
  onTrimWhitespace: () => void;
  onStandardizePlaceholders: () => void;
  onOpenAiClean: () => void;
  onOpenSchemaMapping: () => void;
  onExecutePlan: (steps: CleaningStep[]) => void;
  savedWorkflows: CleaningWorkflow[];
  onApplyWorkflow: (workflow: CleaningWorkflow) => void;
  onSaveCurrentAsWorkflow: (name: string, description: string, steps: CleaningStep[]) => void;
  hasAppliedCleanups: boolean;
}

export function CleaningPlan({
  fileName,
  analysis,
  headers,
  onApplyAllRecommended,
  onRemoveDuplicates,
  onStandardizeTitleCase,
  onTrimWhitespace,
  onStandardizePlaceholders,
  onOpenAiClean,
  onOpenSchemaMapping,
  onExecutePlan,
  savedWorkflows,
  onApplyWorkflow,
  onSaveCurrentAsWorkflow,
  hasAppliedCleanups,
}: CleaningPlanProps) {
  const [activeTab, setActiveTab] = useState<'diagnosis' | 'plan' | 'fuzzy' | 'workflows'>('diagnosis');
  const [naturalCommand, setNaturalCommand] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [saveWorkflowName, setSaveWorkflowName] = useState('');
  const [showSaveWorkflowInput, setShowSaveWorkflowInput] = useState(false);

  // Staged cleaning plan derived dynamically from detected issues
  const [stagedSteps, setStagedSteps] = useState<CleaningStep[]>([
    {
      id: 'step_trim',
      title: 'Trim invisible whitespace & normalize repeated spaces',
      action: 'trim',
      enabled: analysis.whitespaceIssuesCount > 0,
      deterministic: true,
      reason: 'Removes trailing tabs and excess spaces causing formula and lookup errors',
      confidence: 'high',
    },
    {
      id: 'step_dedup',
      title: 'Remove exact & normalized duplicate rows',
      action: 'deduplicate',
      enabled: analysis.normalizedDuplicateRows > 0,
      deterministic: true,
      reason: 'Eliminates duplicate records that inflate counts and skew reporting',
      confidence: 'high',
    },
    {
      id: 'step_case',
      title: 'Standardize text and contact names to Title Case',
      action: 'titlecase',
      enabled: analysis.inconsistentCaseCount > 0,
      deterministic: true,
      reason: 'Converts inconsistent ALL-CAPS and lowercase into clean professional casing',
      confidence: 'high',
    },
    {
      id: 'step_placeholders',
      title: 'Standardize explicit missing markers ("null", "na", "-") to "—"',
      action: 'fill_missing',
      enabled: analysis.explicitPlaceholderCells > 0,
      deterministic: true,
      reason: 'Normalizes mixed null notations without altering genuinely blank cells',
      confidence: 'high',
    },
  ]);

  const toggleStep = (id: string) => {
    setStagedSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleGeneratePlanFromInstruction = async () => {
    if (!naturalCommand.trim()) return;
    setIsGeneratingPlan(true);

    try {
      const res = await fetch('/api/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: naturalCommand.trim(),
          headers,
        }),
      });

      const data = await res.json();
      if (data?.steps && Array.isArray(data.steps)) {
        setStagedSteps(
          data.steps.map((st: any, idx: number) => ({
            id: st.id || `custom_step_${idx}`,
            title: st.title || 'Data cleanup step',
            action: st.action || 'trim',
            column: st.column,
            columns: st.columns,
            enabled: st.enabled !== false,
            deterministic: st.deterministic !== false,
            reason: st.reason || 'Requested by natural-language instruction',
            confidence: st.confidence || 'high',
          }))
        );
        setActiveTab('plan');
      }
    } catch (err) {
      console.error('Plan generation error:', err);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleSaveWorkflow = () => {
    if (!saveWorkflowName.trim()) return;
    onSaveCurrentAsWorkflow(
      saveWorkflowName.trim(),
      `Custom workflow with ${stagedSteps.filter((s) => s.enabled).length} steps`,
      stagedSteps.filter((s) => s.enabled)
    );
    setSaveWorkflowName('');
    setShowSaveWorkflowInput(false);
  };

  const hasIssues = analysis.issues.length > 0;

  return (
    <div className="rounded-2xl border border-[#E5E5DE] bg-white p-5 sm:p-6 shadow-xs mb-6">
      {/* Top Header: Understand & Review */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5DE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#4D7CFE] uppercase">
              Step 02 & 03 — Understand & Review
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5E5DE]" />
            <span className="font-mono text-xs text-[#202522]/60 truncate max-w-[200px]">
              {fileName}
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#202522] font-sans mt-0.5">
            Dataset Diagnosis & Review
          </h2>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Honest Status Badge (no fake 100% perfection claims) */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-sans font-semibold ${
              analysis.statusTone === 'clean'
                ? 'bg-[#2F8F6B]/10 border-[#2F8F6B]/30 text-[#2F8F6B]'
                : analysis.statusTone === 'attention'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-[#F7F5EF] border-[#E5E5DE] text-[#202522]'
            }`}
          >
            {analysis.statusTone === 'clean' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[#2F8F6B]" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>{analysis.statusLabel}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSchemaMapping}
            className="h-9 px-3 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522] hover:bg-[#F0EEE6] cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5 mr-1" />
            <span>Schema Mapping</span>
          </Button>

          {hasIssues && !hasAppliedCleanups && (
            <Button
              onClick={onApplyAllRecommended}
              className="h-9 px-4 rounded-lg bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-xs gap-1.5 cursor-pointer shadow-2xs"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Apply Recommended Cleanup</span>
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Row (Calculated live from uploaded data) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-4 border-b border-[#E5E5DE] text-xs font-sans">
        <div className="p-3 rounded-xl bg-[#F7F5EF]/70 border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Total Rows</span>
          <span className="text-base font-extrabold text-[#202522] font-mono mt-0.5 block">
            {analysis.totalRows.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F5EF]/70 border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Total Columns</span>
          <span className="text-base font-extrabold text-[#202522] font-mono mt-0.5 block">
            {analysis.totalColumns.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F5EF]/70 border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Duplicate Rows</span>
          <span
            className={`text-base font-extrabold font-mono mt-0.5 block ${
              analysis.normalizedDuplicateRows > 0 ? 'text-amber-600' : 'text-[#2F8F6B]'
            }`}
          >
            {analysis.normalizedDuplicateRows.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F5EF]/70 border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Inconsistent Casing</span>
          <span
            className={`text-base font-extrabold font-mono mt-0.5 block ${
              analysis.inconsistentCaseCount > 0 ? 'text-amber-600' : 'text-[#2F8F6B]'
            }`}
          >
            {analysis.inconsistentCaseCount.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#F7F5EF]/70 border border-[#E5E5DE]">
          <span className="text-[#202522]/60 block font-sans">Empty / Missing Cells</span>
          <span
            className={`text-base font-extrabold font-mono mt-0.5 block ${
              analysis.emptyCells + analysis.explicitPlaceholderCells > 0
                ? 'text-amber-600'
                : 'text-[#2F8F6B]'
            }`}
          >
            {(analysis.emptyCells + analysis.explicitPlaceholderCells).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Natural Language Cleaning Plan Generation Bar */}
      <div className="py-3.5 border-b border-[#E5E5DE]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4D7CFE]/10 text-[#4D7CFE] text-xs font-semibold shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Create Cleaning Plan:</span>
          </div>
          <input
            type="text"
            value={naturalCommand}
            onChange={(e) => setNaturalCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGeneratePlanFromInstruction();
            }}
            placeholder="e.g. 'Standardize all Indian phone numbers to +91 format', 'Make this CRM-ready'"
            className="flex-1 rounded-lg border border-[#E5E5DE] bg-white px-3 py-2 text-xs font-sans text-[#202522] focus:border-[#4D7CFE] focus:outline-none"
          />
          <Button
            size="sm"
            onClick={handleGeneratePlanFromInstruction}
            disabled={isGeneratingPlan || !naturalCommand.trim()}
            className="h-8.5 px-4 bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white text-xs font-medium shrink-0 cursor-pointer shadow-2xs"
          >
            {isGeneratingPlan ? 'Interpreting...' : 'Create Plan (AI-assisted)'}
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center justify-between pt-3 pb-2 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('diagnosis')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
              activeTab === 'diagnosis'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            Detected Issues ({analysis.issues.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
              activeTab === 'plan'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            Review Cleaning Plan ({stagedSteps.filter((s) => s.enabled).length} steps)
          </button>
          {analysis.fuzzyDuplicates.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('fuzzy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fuzzy'
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
              }`}
            >
              <Users className="h-3 w-3" />
              <span>Potential Duplicates ({analysis.fuzzyDuplicates.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('workflows')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
              activeTab === 'workflows'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            Saved Workflows ({savedWorkflows.length})
          </button>
        </div>

        {activeTab === 'plan' && (
          <div className="flex items-center gap-2">
            {!showSaveWorkflowInput ? (
              <button
                type="button"
                onClick={() => setShowSaveWorkflowInput(true)}
                className="text-xs font-sans text-[#2F8F6B] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Bookmark className="h-3 w-3" />
                <span>Save as Repeatable Workflow</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Workflow Name (e.g. CRM Clean)"
                  value={saveWorkflowName}
                  onChange={(e) => setSaveWorkflowName(e.target.value)}
                  className="rounded border border-[#E5E5DE] px-2 py-0.5 text-xs font-sans"
                />
                <Button size="sm" onClick={handleSaveWorkflow} className="h-6 px-2 text-[10px] bg-[#2F8F6B] text-white">
                  Save
                </Button>
                <button onClick={() => setShowSaveWorkflowInput(false)} className="text-[10px] text-gray-500">
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab 1: Issue Diagnosis */}
      {activeTab === 'diagnosis' && (
        <div className="pt-2 space-y-4">
          {analysis.issues.length === 0 ? (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-[#2F8F6B]/10 border border-[#2F8F6B]/20 text-[#2F8F6B] text-xs font-sans font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Data checks passed! No duplicate rows, casing anomalies, or irregular formatting detected.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.issues.map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/40 p-3.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-sans font-bold text-xs text-[#202522] flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        {issue.title}
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                        {issue.count} rows
                      </span>
                    </div>
                    <p className="text-[11px] text-[#202522]/70 font-sans leading-relaxed">
                      {issue.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#E5E5DE] flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#202522]/50">
                      Recommendation:
                    </span>
                    {issue.type === 'duplicates' && (
                      <button
                        onClick={onRemoveDuplicates}
                        className="text-xs font-sans font-semibold text-[#2F8F6B] hover:underline cursor-pointer"
                      >
                        Remove Duplicates →
                      </button>
                    )}
                    {issue.type === 'inconsistent_casing' && (
                      <button
                        onClick={onStandardizeTitleCase}
                        className="text-xs font-sans font-semibold text-[#2F8F6B] hover:underline cursor-pointer"
                      >
                        Apply Title Case →
                      </button>
                    )}
                    {issue.type === 'whitespace' && (
                      <button
                        onClick={onTrimWhitespace}
                        className="text-xs font-sans font-semibold text-[#2F8F6B] hover:underline cursor-pointer"
                      >
                        Trim Whitespace →
                      </button>
                    )}
                    {issue.type === 'missing_values' && (
                      <button
                        onClick={onStandardizePlaceholders}
                        className="text-xs font-sans font-semibold text-[#2F8F6B] hover:underline cursor-pointer"
                      >
                        Standardize Placeholders →
                      </button>
                    )}
                    {issue.type === 'broken_formats' && (
                      <button
                        onClick={onOpenAiClean}
                        className="text-xs font-sans font-semibold text-[#4D7CFE] hover:underline cursor-pointer"
                      >
                        Create Cleaning Plan →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attention Flags: "Flag it. Don't guess." */}
          {analysis.flags.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#E5E5DE]">
              <span className="text-xs font-mono uppercase text-[#202522]/60 font-bold block mb-2">
                Flagged for Human Attention ("Flag it. Don't guess."):
              </span>
              <div className="space-y-2">
                {analysis.flags.map((flag) => (
                  <div
                    key={flag.id}
                    className="p-3 rounded-lg border border-amber-200/80 bg-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-amber-900 font-sans mr-2">
                        {flag.column}:
                      </span>
                      <span className="text-amber-800 font-sans">{flag.issue}</span>
                      {flag.sampleValue && (
                        <span className="ml-2 font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-900">
                          e.g. "{flag.sampleValue}"
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-[#202522]/60 shrink-0">
                      Recommendation: {flag.recommendation}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Structured Cleaning Plan (Review Before Apply) */}
      {activeTab === 'plan' && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#202522]/70 font-sans">
            <p>
              Inspect each proposed action. Uncheck any step you wish to skip:
            </p>
            <span className="font-mono text-[11px] text-[#202522]/50">
              Target columns & confidence visible below
            </span>
          </div>

          <div className="space-y-2">
            {stagedSteps.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => toggleStep(step.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  step.enabled
                    ? 'border-[#2F8F6B]/40 bg-[#2F8F6B]/5'
                    : 'border-[#E5E5DE] bg-white opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={() => toggleStep(step.id)}
                  className="mt-0.5 rounded border-[#E5E5DE] text-[#2F8F6B] focus:ring-[#2F8F6B] cursor-pointer"
                />

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-[#202522]/50 font-bold">
                      0{idx + 1}.
                    </span>
                    <span className="font-sans font-bold text-xs text-[#202522]">
                      {step.title}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold ${
                        step.deterministic
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {step.deterministic ? 'Deterministic' : 'AI-assisted'}
                    </span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      Confidence: High
                    </span>
                  </div>
                  <p className="text-[11px] text-[#202522]/70 font-sans mt-1">
                    {step.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-[#E5E5DE]">
            <span className="text-xs font-mono text-[#202522]/60">
              {stagedSteps.filter((s) => s.enabled).length} of {stagedSteps.length} steps selected
            </span>
            <Button
              onClick={() => onExecutePlan(stagedSteps.filter((s) => s.enabled))}
              disabled={stagedSteps.filter((s) => s.enabled).length === 0}
              className="h-9 px-5 bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white font-semibold text-xs cursor-pointer shadow-2xs gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply Approved Cleaning</span>
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: Potential Fuzzy Duplicates Review (Suggestions only!) */}
      {activeTab === 'fuzzy' && (
        <div className="pt-2 space-y-3">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-sans flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <span className="font-bold">Fuzzy Duplicate Review: </span>
              These records share key identifiers (e.g. matching email) but have differing attributes. TidyRow presents them for human review and never silently deletes them.
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-auto">
            {analysis.fuzzyDuplicates.map((cand) => (
              <div
                key={cand.id}
                className="p-3.5 rounded-xl border border-[#E5E5DE] bg-white text-xs font-sans flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="font-mono text-[11px] font-semibold text-[#202522] mb-1">
                    Matching Field: <span className="text-[#2F8F6B]">{cand.field}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 font-mono text-[11px]">
                    <div className="p-2 rounded bg-[#F7F5EF] border border-[#E5E5DE]">
                      <span className="text-[#202522]/50 block">Record #{cand.rowAIndex + 1}</span>
                      <span className="text-[#202522] font-semibold">{cand.valueA}</span>
                    </div>
                    <div className="p-2 rounded bg-[#F7F5EF] border border-[#E5E5DE]">
                      <span className="text-[#202522]/50 block">Record #{cand.rowBIndex + 1}</span>
                      <span className="text-[#202522] font-semibold">{cand.valueB}</span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#202522]/70 font-sans">
                    {cand.similarityReason}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    Needs human decision
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Saved Workflows (Repeatability) */}
      {activeTab === 'workflows' && (
        <div className="pt-2 space-y-3">
          <p className="text-xs text-[#202522]/70 font-sans">
            Repeatable cleaning workflows. Run one on this dataset with one click:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedWorkflows.map((wf) => (
              <div
                key={wf.id}
                className="p-4 rounded-xl border border-[#E5E5DE] bg-white hover:border-[#2F8F6B]/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-sans font-bold text-xs text-[#202522] flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#2F8F6B]" />
                      {wf.name}
                    </span>
                    {wf.isPreset ? (
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        Built-in
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#202522]/70 font-sans leading-relaxed mb-3">
                    {wf.description}
                  </p>
                  <div className="text-[10px] font-mono text-[#202522]/50">
                    {wf.steps.length} sequential cleaning steps
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => onApplyWorkflow(wf)}
                  className="mt-3 w-full h-8 text-xs font-semibold bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white cursor-pointer"
                >
                  <span>Run This Workflow</span>
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
