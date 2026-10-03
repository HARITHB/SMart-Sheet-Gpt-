import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  Activity,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Lock,
  ChevronDown,
  Layers,
  FileCheck2,
  X,
  RefreshCw,
  Share2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { authService, AuthSession, WorkspaceRole } from '@/lib/saas/auth';
import { workspaceService, Workspace } from '@/lib/saas/workspace';
import { meteringService, WorkspaceUsageSummary } from '@/lib/saas/metering';
import { jobQueueService, BackgroundJob } from '@/lib/saas/jobs';
import { sessionRecoveryService, SessionCheckpoint } from '@/lib/saas/sessionRecovery';
import { DataLifecycleService, PurgeCertificate } from '@/lib/saas/privacy';
import { persistenceService } from '@/lib/saas/persistence';
import { scanDatasetForPii, maskSensitiveValue, PiiScanResult } from '@/lib/saas/security';
import { UpgradePlanModal } from './UpgradePlanModal';
import { AutomationIntegrationsModal } from './AutomationIntegrationsModal';
import { PlanId } from '@/lib/saas/commercial';

interface SaasFoundationBarProps {
  currentSession: AuthSession | null;
  onSessionChange: (session: AuthSession) => void;
  onRestoreSessionCheckpoint?: (checkpoint: SessionCheckpoint) => void;
  headers?: string[];
  rows?: Record<string, string>[];
}

export function SaasFoundationBar({
  currentSession,
  onSessionChange,
  onRestoreSessionCheckpoint,
  headers = [],
  rows = [],
}: SaasFoundationBarProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWs, setCurrentWs] = useState<Workspace | null>(null);
  const [usageSummary, setUsageSummary] = useState<WorkspaceUsageSummary | null>(null);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [recoverableCheckpoint, setRecoverableCheckpoint] = useState<SessionCheckpoint | null>(null);

  // Modals
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [piiScanResult, setPiiScanResult] = useState<PiiScanResult | null>(null);
  const [purgeCert, setPurgeCert] = useState<PurgeCertificate | null>(null);

  // Initialize and load SaaS foundation state
  useEffect(() => {
    async function loadData() {
      if (!currentSession) return;

      const wsList = await workspaceService.listUserWorkspaces(currentSession.principal.id);
      setWorkspaces(wsList);

      const activeWs = (await workspaceService.getWorkspace(currentSession.workspaceId)) || wsList[0];
      setCurrentWs(activeWs);

      const summary = await meteringService.getUsageSummary(activeWs.id, activeWs.tier);
      setUsageSummary(summary);

      const jobList = await jobQueueService.listJobs(activeWs.id);
      setJobs(jobList);

      // Check session recovery
      if (sessionRecoveryService.hasRecoverableSession(activeWs.id)) {
        const cp = sessionRecoveryService.getRecoverableSession(activeWs.id);
        setRecoverableCheckpoint(cp);
      }
    }

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [currentSession]);

  const handleRoleChange = async (newRole: WorkspaceRole) => {
    try {
      const updated = await authService.switchRole(newRole);
      onSessionChange(updated);
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  const handleWorkspaceChange = async (wsId: string) => {
    try {
      const updated = await authService.switchWorkspace(wsId);
      onSessionChange(updated);
    } catch (err) {
      console.error('Failed to change workspace:', err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await jobQueueService.cancelJob(jobId, 'Cancelled by user from monitor');
    if (currentWs) {
      const jobList = await jobQueueService.listJobs(currentWs.id);
      setJobs(jobList);
    }
  };

  const handleScanPii = () => {
    if (headers.length === 0 || rows.length === 0) return;
    const res = scanDatasetForPii(headers, rows);
    setPiiScanResult(res);
  };

  const handleHardPurge = async () => {
    if (!currentWs || !currentSession) return;
    try {
      const lifecycle = new DataLifecycleService(persistenceService);
      const cert = await lifecycle.executeHardPurge(
        currentWs.id,
        'current_dataset',
        currentSession.principal.id
      );
      setPurgeCert(cert);
    } catch (err) {
      console.error('Purge failed:', err);
    }
  };

  if (!currentSession) return null;

  const currentRole = currentSession.principal.role;
  const isViewer = currentRole === 'viewer';
  const activeJobCount = jobs.filter((j) => j.status === 'processing' || j.status === 'queued').length;

  return (
    <>
      {/* Session Recovery Banner (if recoverable checkpoint exists) */}
      {recoverableCheckpoint && onRestoreSessionCheckpoint && (
        <div className="bg-[#4D7CFE]/10 border-b border-[#4D7CFE]/20 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-sans text-[#202522]">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-[#4D7CFE] animate-pulse" />
            <span>
              <strong>Unsaved Session Recovered:</strong> You have an uncommitted dataset ({recoverableCheckpoint.fileName}) with{' '}
              {recoverableCheckpoint.rows.length} rows from {new Date(recoverableCheckpoint.lastSavedAt).toLocaleTimeString()}.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                onRestoreSessionCheckpoint(recoverableCheckpoint);
                setRecoverableCheckpoint(null);
              }}
              className="h-7 px-3 text-xs bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white cursor-pointer"
            >
              Restore Session
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                sessionRecoveryService.discardCheckpoint();
                setRecoverableCheckpoint(null);
              }}
              className="h-7 px-2.5 text-xs border-[#E5E5DE] bg-white cursor-pointer hover:bg-[#F0EEE6]"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* SaaS Foundation Bar */}
      <div className="border-b border-[#E5E5DE] bg-[#F0EEE6]/70 px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-sans text-[#202522]">
        {/* Left: Workspace & Role Switcher */}
        <div className="flex items-center gap-3">
          {/* Workspace Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 font-medium hover:text-[#4D7CFE] transition-colors cursor-pointer bg-white/70 px-2 py-0.5 rounded border border-[#E5E5DE]"
              >
                <Users className="h-3.5 w-3.5 text-[#202522]/70" />
                <span>{currentWs?.name || 'Workspace'}</span>
                <span
                  className={`font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    currentWs?.tier === 'pro'
                      ? 'text-[#4D7CFE] bg-[#4D7CFE]/15'
                      : 'text-[#2F8F6B] bg-[#2F8F6B]/15'
                  }`}
                >
                  {currentWs?.tier === 'pro' ? 'Pro ($5/mo)' : 'Free ($0)'}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-white border border-[#E5E5DE] shadow-md z-50">
              <DropdownMenuLabel className="text-xs font-mono text-[#202522]/60">
                Workspaces (Isolated)
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#E5E5DE]" />
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => handleWorkspaceChange(ws.id)}
                  className={`text-xs cursor-pointer ${ws.id === currentWs?.id ? 'font-bold bg-[#F7F5EF]' : ''}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{ws.name}</span>
                    <span className="text-[10px] uppercase font-mono text-[#4D7CFE]">
                      {ws.tier === 'pro' ? 'Pro ($5/mo)' : 'Free ($0)'}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Upgrade Button if on Free Plan */}
          {currentWs?.tier !== 'pro' && (
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="flex items-center gap-1 font-semibold text-[11px] bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white px-2.5 py-1 rounded transition-colors cursor-pointer shadow-2xs"
              title="Unlock 100k rows/file, natural-language plans & HubSpot/Salesforce readiness"
            >
              <Sparkles className="h-3 w-3" />
              <span>Upgrade to Pro ($5/mo)</span>
            </button>
          )}

          {/* Role Switcher (RBAC) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`flex items-center gap-1 font-medium transition-colors cursor-pointer px-2 py-0.5 rounded border ${
                  isViewer
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white/70 border-[#E5E5DE] text-[#202522]'
                }`}
                title="Switch active role to test RBAC enforcement"
              >
                <User className="h-3.5 w-3.5 opacity-70" />
                <span className="capitalize">{currentRole}</span>
                {isViewer && <Lock className="h-3 w-3 text-amber-700 ml-0.5" />}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-white border border-[#E5E5DE] shadow-md z-50">
              <DropdownMenuLabel className="text-xs font-mono text-[#202522]/60">
                RBAC Role Switcher
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#E5E5DE]" />
              {(['owner', 'admin', 'editor', 'viewer', 'service_account'] as WorkspaceRole[]).map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`capitalize text-xs cursor-pointer ${r === currentRole ? 'font-bold bg-[#F7F5EF]' : ''}`}
                >
                  <span>{r}</span>
                  {r === 'viewer' && <span className="text-[10px] text-amber-700 ml-auto">Read-only</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isViewer && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
              <ShieldAlert className="h-3 w-3" />
              Viewer: Edits and cleaning disabled by RBAC
            </span>
          )}
        </div>

        {/* Right: Usage Metering, Background Jobs, Security & Privacy */}
        <div className="flex items-center gap-2">
          {/* Usage Metering Widget */}
          {usageSummary && (
            <button
              type="button"
              onClick={() => setShowUsageModal(true)}
              className="flex items-center gap-1.5 bg-white/70 hover:bg-white px-2 py-0.5 rounded border border-[#E5E5DE] text-[11px] font-mono cursor-pointer transition-colors"
              title="View Centralized Usage & Quota Status"
            >
              <Activity className="h-3 w-3 text-[#2F8F6B]" />
              <span>
                {usageSummary.rowsProcessed.toLocaleString()} /{' '}
                {usageSummary.quotas.rows_processed.limit.toLocaleString()} rows
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  usageSummary.quotas.rows_processed.warningLevel === 'ok'
                    ? 'bg-[#2F8F6B]'
                    : usageSummary.quotas.rows_processed.warningLevel === 'warning_80'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
              />
            </button>
          )}

          {/* Background Jobs Indicator */}
          <button
            type="button"
            onClick={() => setShowJobsModal(true)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-sans cursor-pointer transition-colors ${
              activeJobCount > 0
                ? 'bg-[#4D7CFE]/15 border-[#4D7CFE]/40 text-[#4D7CFE] font-medium'
                : 'bg-white/70 hover:bg-white border-[#E5E5DE] text-[#202522]/80'
            }`}
            title="View Background Jobs Queue"
          >
            <Clock className={`h-3 w-3 ${activeJobCount > 0 ? 'animate-spin' : ''}`} />
            <span>Jobs</span>
            {activeJobCount > 0 && (
              <span className="font-mono bg-[#4D7CFE] text-white px-1 py-0.2 rounded-full text-[10px]">
                {activeJobCount}
              </span>
            )}
          </button>

          {/* Security & Privacy Settings */}
          <button
            type="button"
            onClick={() => setShowSecurityModal(true)}
            className="flex items-center gap-1 bg-white/70 hover:bg-white px-2 py-0.5 rounded border border-[#E5E5DE] text-[11px] cursor-pointer transition-colors"
            title="Security baseline, formula injection guard, and data retention policy"
          >
            <ShieldCheck className="h-3 w-3 text-[#2F8F6B]" />
            <span className="hidden md:inline">Governance</span>
          </button>

          {/* Automation, APIs & Integrations */}
          <button
            type="button"
            onClick={() => setShowAutomationModal(true)}
            className="flex items-center gap-1 bg-white/70 hover:bg-white px-2 py-0.5 rounded border border-[#E5E5DE] text-[11px] cursor-pointer transition-colors"
            title="APIs, webhooks, versioned workflows, batch processing, Zapier/Make and integrations"
          >
            <Share2 className="h-3 w-3 text-[#4D7CFE]" />
            <span className="hidden md:inline">Automation</span>
          </button>
        </div>
      </div>

      {/* 1. Usage & Quotas Dialog */}
      <Dialog open={showUsageModal} onOpenChange={setShowUsageModal}>
        <DialogContent className="max-w-md bg-white border border-[#E5E5DE] p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-sans font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#2F8F6B]" />
              Centralized Usage Metering & Quotas
            </DialogTitle>
            <DialogDescription className="text-xs text-[#202522]/70 font-sans">
              Workspace: <strong>{currentWs?.name}</strong> • Current Plan: <strong>{currentWs?.tier === 'pro' ? 'Pro ($5/month)' : 'Free ($0)'}</strong>.
            </DialogDescription>
          </DialogHeader>

          {usageSummary && (
            <div className="space-y-4 my-2">
              {Object.entries(usageSummary.quotas).map(([metric, status]) => (
                <div key={metric} className="p-3 bg-[#F7F5EF] rounded-lg border border-[#E5E5DE]">
                  <div className="flex items-center justify-between text-xs font-sans mb-1.5">
                    <span className="font-semibold capitalize">{metric.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-[#202522]/80">
                      {status.current.toLocaleString()} / {status.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-[#E5E5DE] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        status.percentUsed >= 95
                          ? 'bg-red-500'
                          : status.percentUsed >= 80
                          ? 'bg-amber-500'
                          : 'bg-[#2F8F6B]'
                      }`}
                      style={{ width: `${Math.min(100, status.percentUsed)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#202522]/60 mt-1 font-mono">
                    <span>{status.percentUsed.toFixed(1)}% utilized</span>
                    <span>{status.warningLevel === 'ok' ? 'Optimal' : status.warningLevel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="mt-4 flex items-center justify-between">
            {currentWs?.tier !== 'pro' ? (
              <Button
                size="sm"
                onClick={() => {
                  setShowUsageModal(false);
                  setShowUpgradeModal(true);
                }}
                className="text-xs font-semibold bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white gap-1.5 cursor-pointer shadow-2xs"
              >
                <Sparkles className="h-3 w-3" />
                <span>Upgrade to Pro ($5/mo)</span>
              </Button>
            ) : <div />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUsageModal(false)}
              className="text-xs border-[#E5E5DE] cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Background Jobs Monitor Dialog */}
      <Dialog open={showJobsModal} onOpenChange={setShowJobsModal}>
        <DialogContent className="max-w-lg bg-white border border-[#E5E5DE] p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-sans font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#4D7CFE]" />
              Background Jobs Queue & Tasks
            </DialogTitle>
            <DialogDescription className="text-xs text-[#202522]/70 font-sans">
              Headless asynchronous tasks executing via the shared cleaning engine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 max-h-[350px] overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#202522]/50 font-sans">
                No active or recent background jobs.
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="p-3 bg-[#F7F5EF] rounded-lg border border-[#E5E5DE] space-y-2">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="font-semibold capitalize font-mono text-[11px]">{job.type.replace(/_/g, ' ')}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
                        job.status === 'completed'
                          ? 'bg-[#2F8F6B]/10 text-[#2F8F6B]'
                          : job.status === 'processing'
                          ? 'bg-[#4D7CFE]/10 text-[#4D7CFE] animate-pulse'
                          : job.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <div className="w-full bg-[#E5E5DE] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#4D7CFE] transition-all"
                      style={{ width: `${job.progress.percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#202522]/60 font-sans">
                    <span>{job.progress.stage}</span>
                    {job.status === 'processing' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelJob(job.id)}
                        className="h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJobsModal(false)}
              className="text-xs border-[#E5E5DE]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Security, Privacy & Data Lifecycle Dialog */}
      <Dialog open={showSecurityModal} onOpenChange={setShowSecurityModal}>
        <DialogContent className="max-w-lg bg-white border border-[#E5E5DE] p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-sans font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#2F8F6B]" />
              Security Baseline & Privacy Lifecycle
            </DialogTitle>
            <DialogDescription className="text-xs text-[#202522]/70 font-sans">
              Active security sanitization policies, PII protection, and Right-to-be-Forgotten governance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs font-sans">
            {/* Security Baseline checks */}
            <div className="p-3 bg-[#F7F5EF] rounded-lg border border-[#E5E5DE] space-y-2">
              <span className="font-bold text-[#202522]">Formula Injection Sanitization</span>
              <p className="text-[#202522]/70 text-[11px]">
                Cells starting with <code className="bg-[#E5E5DE] px-1 rounded">=, +, -, @</code> are automatically
                escaped on export to prevent DDE/spreadsheet injection exploits (CWE-1236).
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-[#2F8F6B] font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Active and Enforced</span>
              </div>
            </div>

            {/* PII Detection Scan */}
            <div className="p-3 bg-[#F7F5EF] rounded-lg border border-[#E5E5DE] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#202522]">Personally Identifiable Information (PII)</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleScanPii}
                  className="h-6 text-[10px] border-[#E5E5DE] bg-white cursor-pointer"
                >
                  Scan Active Dataset
                </Button>
              </div>

              {piiScanResult ? (
                <div className="text-[11px] space-y-1">
                  {piiScanResult.hasPii ? (
                    <div className="text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                      ⚠️ Detected {piiScanResult.findingsCount} PII occurrences in columns:{' '}
                      <strong>{piiScanResult.flaggedColumns.join(', ')}</strong> (
                      {piiScanResult.typesDetected.join(', ')}).
                    </div>
                  ) : (
                    <div className="text-[#2F8F6B] bg-[#2F8F6B]/10 p-2 rounded">
                      ✓ No unmasked SSN, credit cards, or sensitive PII detected in sample rows.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[#202522]/60 text-[11px]">Click Scan to analyze active dataset for SSNs, card numbers, or emails.</p>
              )}
            </div>

            {/* Data Lifecycle & Right-to-be-Forgotten */}
            <div className="p-3 bg-[#F7F5EF] rounded-lg border border-[#E5E5DE] space-y-2">
              <span className="font-bold text-[#202522]">Data Lifecycle & Retention</span>
              <p className="text-[#202522]/70 text-[11px]">
                Default retention TTL: <strong>{currentWs?.settings.defaultRetentionDays || 30} days</strong>. Past TTL,
                datasets are automatically scrubbed during periodic sweeps.
              </p>
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleHardPurge}
                  className="h-7 text-xs gap-1.5 cursor-pointer bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Execute Right-to-be-Forgotten Hard Purge</span>
                </Button>
              </div>

              {purgeCert && (
                <div className="mt-2 p-2 bg-white rounded border border-[#E5E5DE] font-mono text-[10px] space-y-1">
                  <div className="font-bold text-[#2F8F6B]">✓ Cryptographic Purge Certificate Issued</div>
                  <div>Cert ID: {purgeCert.certificateId}</div>
                  <div>Records Purged: {purgeCert.recordsPurged}</div>
                  <div>Signature: {purgeCert.sha256Signature}</div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSecurityModal(false)}
              className="text-xs border-[#E5E5DE]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Upgrade Plan Dialog */}
      <UpgradePlanModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={currentWs?.tier === 'pro' ? 'pro' : 'free'}
        workspaceId={currentWs?.id}
        userEmail={currentSession?.principal.email}
      />

      {/* 5. Automation, APIs & Integrations Dialog */}
      {currentWs && (
        <AutomationIntegrationsModal
          open={showAutomationModal}
          onOpenChange={setShowAutomationModal}
          workspaceId={currentWs.id}
          currentSession={currentSession}
        />
      )}
    </>
  );
}
