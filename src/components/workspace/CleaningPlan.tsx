import React, { useState, useMemo } from 'react';
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
  BookOpen,
  SplitSquareVertical,
} from 'lucide-react';
import type { DatasetAnalysis } from '@/lib/analyzer';
import type { CleaningStep, CleaningWorkflow } from '@/lib/workflows';
import { STANDARD_RECIPES, type CleaningRecipe } from '@/lib/core/recipes';
import { resolveEntities, type EntityResolutionReport, type EntityResolutionGroup } from '@/lib/core/entityResolution';

interface CleaningPlanProps {
  fileName: string;
  analysis: DatasetAnalysis;
  headers: string[];
  rows?: (Record<string, string> & { _tr_id?: string })[];
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
  onApplyRecipe?: (recipe: CleaningRecipe) => void;
  onSaveCurrentAsWorkflow: (name: string, description: string, steps: CleaningStep[]) => void;
  hasAppliedCleanups: boolean;
}

export function CleaningPlan({
  fileName,
  analysis,
  headers,
  rows,
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
  onApplyRecipe,
  onSaveCurrentAsWorkflow,
  hasAppliedCleanups,
}: CleaningPlanProps) {
  const [activeTab, setActiveTab] = useState<'diagnosis' | 'plan' | 'entities' | 'workflows'>('diagnosis');
  const [naturalCommand, setNaturalCommand] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [saveWorkflowName, setSaveWorkflowName] = useState('');
  const [showSaveWorkflowInput, setShowSaveWorkflowInput] = useState(false);

  // Map rows by _tr_id for fast lookup in entity groups
  const rowMap = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    if (rows) {
      for (const r of rows) {
        if (r._tr_id) map.set(r._tr_id, r);
      }
    }
    return map;
  }, [rows]);

  // Compute entity resolution groups across dataset
  const entityReport = useMemo<EntityResolutionReport>(() => {
    if (!rows || rows.length === 0) {
      return {
        totalRows: 0,
        totalGroups: 0,
        exactDuplicateCount: 0,
        normalizedDuplicateCount: 0,
        fuzzyDuplicateCount: 0,
        likelySameEntityCount: 0,
        unresolvedCount: 0,
        groups: [],
        assessmentNotice: '',
      };
    }
    return resolveEntities(headers, rows as any);
  }, [headers, rows]);

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
          {(entityReport.groups.length > 0 || analysis.fuzzyDuplicates.length > 0) && (
            <button
              type="button"
              onClick={() => setActiveTab('entities')}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'entities'
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
              }`}
            >
              <Users className="h-3 w-3" />
              <span>Duplicate & Entity Resolution ({entityReport.groups.length || analysis.fuzzyDuplicates.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('workflows')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'workflows'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            <BookOpen className="h-3 w-3" />
            <span>Recipes & Workflows ({STANDARD_RECIPES.length + savedWorkflows.length})</span>
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

      {/* Tab 3: Duplicate & Entity Resolution Explainability */}
      {activeTab === 'entities' && (
        <div className="pt-2 space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-sans flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div>
              <span className="font-bold">Transparent Duplicate & Entity Explainability: </span>
              TidyRow classifies record matches into exact, normalized, fuzzy, and conflicting entities. Exact and normalized duplicates can be safely auto-merged, while records with conflicting field values require human review.
            </div>
          </div>

          {/* Quick Summary Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2.5 rounded-lg bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 text-[10px] block">Total Duplicate Groups</span>
              <span className="font-bold text-[#202522] text-sm">{entityReport.groups.length} groups</span>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 text-[10px] block">Safe to Auto-Merge</span>
              <span className="font-bold text-[#2F8F6B] text-sm">
                {entityReport.exactDuplicateCount + entityReport.normalizedDuplicateCount} (Exact & Norm)
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-[#E5E5DE]">
              <span className="text-[#202522]/60 text-[10px] block">Manual Review Required</span>
              <span className="font-bold text-amber-700 text-sm">
                {entityReport.fuzzyDuplicateCount + entityReport.likelySameEntityCount} (Conflicts/Fuzzy)
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-[#E5E5DE] flex items-center justify-between">
              <div>
                <span className="text-[#202522]/60 text-[10px] block">Safe Dedup Action</span>
                <span className="text-xs font-sans text-[#202522]">Merge Safe Matches</span>
              </div>
              <Button
                size="sm"
                onClick={onRemoveDuplicates}
                className="h-7 px-2.5 text-[11px] bg-[#2F8F6B] text-white hover:bg-[#2F8F6B]/90 cursor-pointer"
              >
                Auto-Merge Safe
              </Button>
            </div>
          </div>

          {/* Groups List */}
          <div className="space-y-3 max-h-[380px] overflow-auto">
            {entityReport.groups.length === 0 && analysis.fuzzyDuplicates.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#202522]/60 bg-[#F7F5EF] rounded-xl border border-[#E5E5DE]">
                No duplicate records or conflicting entities detected.
              </div>
            ) : (
              entityReport.groups.map((grp) => {
                const survivorRow = rowMap.get(grp.survivorRowId);
                const candidateRows = grp.matchedRowIds
                  .map((id) => rowMap.get(id))
                  .filter((r): r is Record<string, string> => Boolean(r));

                return (
                  <div
                    key={grp.groupId}
                    className={`p-3.5 rounded-xl border bg-white text-xs font-sans space-y-2.5 ${
                      grp.safeToAutoMerge ? 'border-[#E5E5DE]' : 'border-amber-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#E5E5DE]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            grp.category === 'exact_duplicate'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                              : grp.category === 'normalized_duplicate'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : grp.category === 'likely_same_entity'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-50 text-blue-900 border border-blue-200'
                          }`}
                        >
                          {grp.category.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[#202522]/70 text-[11px]">
                          Matched on: <span className="font-mono font-semibold text-[#202522]">{grp.matchingFields.join(', ')}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {grp.safeToAutoMerge ? (
                          <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Safe to Auto-Merge
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Review Required Before Merging
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Explainability Reason */}
                    <p className="text-[11px] text-[#202522]/80 leading-relaxed font-sans">
                      {grp.reason}
                    </p>

                    {/* Survivor vs Candidate rows */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2 rounded bg-emerald-50/60 border border-emerald-200">
                        <span className="text-emerald-900 font-bold block mb-1">
                          Survivor Record ({grp.survivorRowId || 'Primary'}):
                        </span>
                        <div className="text-[#202522] space-y-0.5 truncate">
                          {grp.matchingFields.map((f) => (
                            <div key={f} className="truncate">
                              <span className="text-[#202522]/60">{f}:</span> {survivorRow ? survivorRow[f] || '—' : '—'}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-2 rounded bg-[#F7F5EF] border border-[#E5E5DE]">
                        <span className="text-[#202522]/70 font-bold block mb-1">
                          Candidate Records ({candidateRows.length}):
                        </span>
                        <div className="text-[#202522] space-y-0.5 truncate">
                          {candidateRows.slice(0, 2).map((cand, ci) => (
                            <div key={ci} className="truncate">
                              {grp.matchingFields.map((f) => (
                                <span key={f} className="mr-2">
                                  <span className="text-[#202522]/60">{f}:</span> {cand[f] || '—'}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Conflicting Fields Box if any */}
                    {grp.conflicts.length > 0 && (
                      <div className="p-2.5 rounded bg-amber-50 border border-amber-200 space-y-1">
                        <span className="font-semibold text-amber-900 text-[11px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-amber-700" />
                          Conflicting Field Values Detected:
                        </span>
                        <div className="space-y-1 text-[11px] font-mono">
                          {grp.conflicts.map((conf, ci) => (
                            <div key={ci} className="flex items-center justify-between bg-white/80 p-1 rounded border border-amber-100">
                              <span className="font-semibold text-[#202522]">{conf.column}:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-800">Survivor: "{conf.survivorValue}"</span>
                                <span>vs</span>
                                <span className="text-red-700">Candidate: "{conf.candidateValue}"</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Recipes & Workflows (Standard Quality Recipes + Custom Workflows) */}
      {activeTab === 'workflows' && (
        <div className="pt-2 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-sans text-[#202522] uppercase tracking-wide flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-[#2F8F6B]" />
                <span>Standard Cleaning Recipes (Deterministic Industry Presets)</span>
              </span>
              <span className="text-[10px] font-mono text-[#202522]/50">
                {STANDARD_RECIPES.length} standard recipes
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STANDARD_RECIPES.map((recipe) => (
                <div
                  key={recipe.recipeId}
                  className="p-3.5 rounded-xl border border-[#E5E5DE] bg-white hover:border-[#2F8F6B]/40 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-sans font-bold text-xs text-[#202522]">
                        {recipe.name}
                      </span>
                      <span className="font-mono text-[9px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded uppercase">
                        {recipe.targetDomain}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#202522]/70 font-sans leading-relaxed mb-2.5">
                      {recipe.description}
                    </p>
                    <div className="space-y-1 mb-3">
                      <span className="text-[10px] font-mono text-[#202522]/50 uppercase block">Steps:</span>
                      {recipe.steps.map((st) => (
                        <div key={st.stepId} className="text-[10px] font-mono text-[#202522]/80 flex items-center gap-1">
                          <span className="text-[#2F8F6B] font-bold">✓</span>
                          <span>{st.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      if (onApplyRecipe) {
                        onApplyRecipe(recipe);
                      }
                    }}
                    className="w-full h-7.5 text-xs font-semibold bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white cursor-pointer"
                  >
                    <span>Execute Recipe</span>
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5E5DE]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-sans text-[#202522] uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#4D7CFE]" />
                <span>Custom Saved Workflows ({savedWorkflows.length})</span>
              </span>
            </div>

            {savedWorkflows.length === 0 ? (
              <p className="text-xs text-[#202522]/60 italic font-sans">
                No custom workflows saved yet. Create a cleaning plan and click "Save as Repeatable Workflow".
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {savedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-3.5 rounded-xl border border-[#E5E5DE] bg-white hover:border-[#2F8F6B]/40 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-sans font-bold text-xs text-[#202522] flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-[#2F8F6B]" />
                          {wf.name}
                        </span>
                        <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                          {wf.isPreset ? 'Built-in' : 'Custom'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#202522]/70 font-sans leading-relaxed mb-2">
                        {wf.description}
                      </p>
                      <div className="text-[10px] font-mono text-[#202522]/50">
                        {wf.steps.length} sequential cleaning steps
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => onApplyWorkflow(wf)}
                      className="mt-2.5 w-full h-7.5 text-xs font-semibold bg-[#202522] hover:bg-[#202522]/90 text-white cursor-pointer"
                    >
                      <span>Run This Workflow</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
