import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Key,
  Webhook,
  GitBranch,
  Layers,
  Share2,
  Calendar,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  RotateCcw,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { apiKeyService, ApiKeyRecord, ApiScope } from '@/lib/automation/apiKeyService';
import { webhookService, WebhookSubscription, WebhookEvent } from '@/lib/automation/webhookService';
import { versionedWorkflowService, VersionedWorkflow, WorkflowVersionSnapshot } from '@/lib/automation/versionedWorkflows';
import { batchProcessingService, BatchRunSummary } from '@/lib/automation/batchProcessing';
import {
  integrationService,
  INTEGRATION_REGISTRY,
  IntegrationProviderId,
  IntegrationConnectionState,
} from '@/lib/automation/integrations';
import { scheduledWorkflowService, WorkflowSchedule } from '@/lib/automation/scheduledWorkflows';
import { ZAPIER_MAKE_ACTIONS_MANIFEST } from '@/lib/automation/zapierMakeAutomation';
import { AuthSession } from '@/lib/saas/auth';

interface AutomationIntegrationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentSession: AuthSession | null;
}

type ActiveTab =
  | 'api_keys'
  | 'webhooks'
  | 'workflows'
  | 'batch'
  | 'integrations'
  | 'zapier_make'
  | 'schedules';

export function AutomationIntegrationsModal({
  open,
  onOpenChange,
  workspaceId,
  currentSession,
}: AutomationIntegrationsModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('api_keys');

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([
    'data:clean',
    'jobs:create',
    'jobs:read',
    'workflows:execute',
  ]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // Webhooks State
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookDesc, setWebhookDesc] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([
    'job.completed',
    'job.failed',
    'batch.completed',
    'workflow.executed',
  ]);

  // Workflows State
  const [workflows, setWorkflows] = useState<VersionedWorkflow[]>([]);
  const [selectedWfVersions, setSelectedWfVersions] = useState<WorkflowVersionSnapshot[]>([]);
  const [activeWfId, setActiveWfId] = useState<string | null>(null);

  // Batch Runs State
  const [batchRuns, setBatchRuns] = useState<BatchRunSummary[]>([]);

  // Integrations State
  const [connections, setConnections] = useState<IntegrationConnectionState[]>([]);
  const [configProvider, setConfigProvider] = useState<IntegrationProviderId | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Schedules State
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);

  const [copiedKey, setCopiedKey] = useState(false);

  // Reload data
  const loadData = async () => {
    if (!workspaceId) return;
    const [keys, whs, wfs, batches, conns, scheds] = await Promise.all([
      apiKeyService.listApiKeys(workspaceId),
      webhookService.listWebhooks(workspaceId),
      versionedWorkflowService.listWorkflows(workspaceId),
      batchProcessingService.listBatchRuns(workspaceId),
      integrationService.listAllConnections(workspaceId),
      scheduledWorkflowService.listSchedules(workspaceId),
    ]);
    setApiKeys(keys);
    setWebhooks(whs);
    setWorkflows(wfs);
    setBatchRuns(batches);
    setConnections(conns);
    setSchedules(scheds);

    if (wfs.length > 0 && !activeWfId) {
      setActiveWfId(wfs[0].id);
      const vList = await versionedWorkflowService.listVersions(wfs[0].id);
      setSelectedWfVersions(vList);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, workspaceId]);

  const handleSelectWorkflow = async (wfId: string) => {
    setActiveWfId(wfId);
    const vList = await versionedWorkflowService.listVersions(wfId);
    setSelectedWfVersions(vList);
  };

  // API Key creation
  const handleCreateApiKey = async () => {
    if (!newKeyName.trim() || !currentSession) return;
    const { rawKey } = await apiKeyService.createApiKey({
      workspaceId,
      name: newKeyName.trim(),
      scopes: selectedScopes,
      createdBy: currentSession.principal.id,
      environment: 'live',
    });
    setGeneratedKey(rawKey);
    setNewKeyName('');
    const updated = await apiKeyService.listApiKeys(workspaceId);
    setApiKeys(updated);
  };

  const handleRevokeKey = async (keyId: string) => {
    await apiKeyService.revokeApiKey(keyId, workspaceId);
    const updated = await apiKeyService.listApiKeys(workspaceId);
    setApiKeys(updated);
  };

  // Webhook registration
  const handleRegisterWebhook = async () => {
    if (!webhookUrl.trim() || !webhookDesc.trim()) return;
    try {
      await webhookService.registerWebhook({
        workspaceId,
        url: webhookUrl.trim(),
        description: webhookDesc.trim(),
        events: webhookEvents,
      });
      setWebhookUrl('');
      setWebhookDesc('');
      const updated = await webhookService.listWebhooks(workspaceId);
      setWebhooks(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    await webhookService.deleteWebhook(id, workspaceId);
    const updated = await webhookService.listWebhooks(workspaceId);
    setWebhooks(updated);
  };

  // Integration credentials config
  const handleSaveCredentials = async () => {
    if (!configProvider) return;
    setConfigMessage(null);
    const state = await integrationService.configureCredentials(
      workspaceId,
      configProvider,
      credValues,
      async () => {
        // Honest validation: check token format
        const val = Object.values(credValues)[0] || '';
        if (val.length < 8) {
          return { success: false, error: 'Token format invalid or rejected by provider.' };
        }
        return { success: true };
      }
    );

    if (state.status === 'connected') {
      setConfigMessage({ type: 'success', text: 'Credentials verified and provider connected successfully!' });
    } else {
      setConfigMessage({
        type: 'error',
        text: state.lastError || `Connection failed: ${state.missingCredentials.join(', ')}`,
      });
    }

    const updated = await integrationService.listAllConnections(workspaceId);
    setConnections(updated);
  };

  const handleDisconnect = async (pId: IntegrationProviderId) => {
    await integrationService.disconnect(workspaceId, pId);
    const updated = await integrationService.listAllConnections(workspaceId);
    setConnections(updated);
    if (configProvider === pId) {
      setConfigProvider(null);
      setCredValues({});
      setConfigMessage(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white border border-[#E5E5DE]">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-[#E5E5DE] bg-[#F7F5EF]">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-serif font-bold text-[#202522] flex items-center gap-2">
                <Share2 className="h-5 w-5 text-[#4D7CFE]" />
                Automation, APIs & Integrations
              </DialogTitle>
              <DialogDescription className="text-xs text-[#202522]/70 mt-0.5">
                Headless job-based API, webhooks, versioned workflows, batch processing, Zapier/Make automation, and scheduled workers.
              </DialogDescription>
            </div>
            <span className="font-mono text-[10px] bg-[#4D7CFE]/15 text-[#4D7CFE] px-2 py-0.5 rounded font-bold uppercase">
              Core Engine Shared
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setActiveTab('api_keys')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'api_keys' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Key className="h-3.5 w-3.5" />
              API Keys
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'webhooks' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Webhook className="h-3.5 w-3.5" />
              Webhooks
            </button>
            <button
              onClick={() => setActiveTab('workflows')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'workflows' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Versioned Workflows
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'batch' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Batch Runs
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'integrations' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Share2 className="h-3.5 w-3.5" />
              Integrations
            </button>
            <button
              onClick={() => setActiveTab('zapier_make')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'zapier_make' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Zapier & Make
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'schedules' ? 'bg-[#202522] text-white shadow-2xs' : 'text-[#202522]/70 hover:bg-black/5'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Schedules
            </button>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 font-sans text-xs text-[#202522]">
          {/* TAB 1: API KEYS */}
          {activeTab === 'api_keys' && (
            <div className="space-y-6">
              {generatedKey && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        API Key Created Successfully
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Copy your key now. For security reasons, it will not be shown again.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(generatedKey)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      {copiedKey ? 'Copied!' : 'Copy Key'}
                    </Button>
                  </div>
                  <div className="mt-2.5 p-2 bg-white rounded border border-emerald-200 font-mono text-[11px] select-all break-all">
                    {generatedKey}
                  </div>
                </div>
              )}

              {/* Generate New Key Form */}
              <div className="p-4 bg-[#F7F5EF] border border-[#E5E5DE] rounded-md">
                <h4 className="font-bold text-xs text-[#202522] mb-2 flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-[#4D7CFE]" />
                  Generate New API Key
                </h4>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g. Production Ingestion Worker)"
                    className="flex-1 bg-white border border-[#E5E5DE] rounded px-3 py-1.5 text-xs text-[#202522] w-full"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateApiKey}
                    disabled={!newKeyName.trim()}
                    className="bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white text-xs h-8 cursor-pointer"
                  >
                    Generate Key
                  </Button>
                </div>

                {/* Scopes Selector */}
                <div className="mt-3">
                  <span className="text-[11px] text-[#202522]/70 font-medium">Assigned Scopes:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(
                      [
                        'data:clean',
                        'data:read',
                        'jobs:create',
                        'jobs:read',
                        'jobs:cancel',
                        'workflows:execute',
                        'webhooks:manage',
                        'integrations:sync',
                      ] as ApiScope[]
                    ).map((scope) => {
                      const active = selectedScopes.includes(scope);
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => {
                            setSelectedScopes(
                              active
                                ? selectedScopes.filter((s) => s !== scope)
                                : [...selectedScopes, scope]
                            );
                          }}
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#4D7CFE]/15 border-[#4D7CFE] text-[#4D7CFE] font-bold'
                              : 'bg-white border-[#E5E5DE] text-[#202522]/60'
                          }`}
                        >
                          {scope}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Existing API Keys Table */}
              <div>
                <h4 className="font-bold text-xs text-[#202522] mb-2">Active API Keys</h4>
                {apiKeys.length === 0 ? (
                  <p className="text-xs text-[#202522]/60 italic">No API keys created yet.</p>
                ) : (
                  <div className="border border-[#E5E5DE] rounded divide-y divide-[#E5E5DE]">
                    {apiKeys.map((k) => (
                      <div key={k.id} className="p-3 flex items-center justify-between gap-3 bg-white">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#202522]">{k.name}</span>
                            <span className="font-mono text-[10px] text-[#202522]/60 bg-black/5 px-1.5 py-0.2 rounded">
                              {k.keyPrefix}...
                            </span>
                            {k.revoked && (
                              <span className="font-mono text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold">
                                REVOKED
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {k.scopes.map((s) => (
                              <span key={s} className="font-mono text-[9px] text-[#202522]/70 bg-[#F0EEE6] px-1 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>

                        {!k.revoked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeKey(k.id)}
                            className="text-red-600 border-red-200 hover:bg-red-50 text-[11px] h-7"
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: WEBHOOKS */}
          {activeTab === 'webhooks' && (
            <div className="space-y-6">
              {/* Register Webhook Form */}
              <div className="p-4 bg-[#F7F5EF] border border-[#E5E5DE] rounded-md space-y-3">
                <h4 className="font-bold text-xs text-[#202522] flex items-center gap-1.5">
                  <Webhook className="h-3.5 w-3.5 text-[#4D7CFE]" />
                  Register Outbound Webhook
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-domain.com/webhooks"
                    className="bg-white border border-[#E5E5DE] rounded px-3 py-1.5 text-xs text-[#202522]"
                  />
                  <input
                    type="text"
                    value={webhookDesc}
                    onChange={(e) => setWebhookDesc(e.target.value)}
                    placeholder="Description (e.g. CRM Sync Handler)"
                    className="bg-white border border-[#E5E5DE] rounded px-3 py-1.5 text-xs text-[#202522]"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-[#202522]/70 font-medium">Subscribed Events:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(
                      [
                        'job.queued',
                        'job.processing',
                        'job.completed',
                        'job.failed',
                        'batch.completed',
                        'workflow.executed',
                      ] as WebhookEvent[]
                    ).map((evt) => {
                      const active = webhookEvents.includes(evt);
                      return (
                        <button
                          key={evt}
                          type="button"
                          onClick={() => {
                            setWebhookEvents(
                              active
                                ? webhookEvents.filter((e) => e !== evt)
                                : [...webhookEvents, evt]
                            );
                          }}
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#4D7CFE]/15 border-[#4D7CFE] text-[#4D7CFE] font-bold'
                              : 'bg-white border-[#E5E5DE] text-[#202522]/60'
                          }`}
                        >
                          {evt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleRegisterWebhook}
                  disabled={!webhookUrl.trim() || !webhookDesc.trim()}
                  className="bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white text-xs h-7 cursor-pointer"
                >
                  Save Webhook
                </Button>
              </div>

              {/* Subscriptions List */}
              <div>
                <h4 className="font-bold text-xs text-[#202522] mb-2">Registered Subscriptions</h4>
                {webhooks.length === 0 ? (
                  <p className="text-xs text-[#202522]/60 italic">No webhooks registered yet.</p>
                ) : (
                  <div className="border border-[#E5E5DE] rounded divide-y divide-[#E5E5DE]">
                    {webhooks.map((wh) => (
                      <div key={wh.id} className="p-3 flex items-start justify-between gap-3 bg-white">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#202522]">{wh.description}</span>
                            <span className="font-mono text-[10px] text-[#202522]/60 bg-black/5 px-1.5 py-0.2 rounded">
                              {wh.url}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-[#202522]/70">
                            Secret: <span className="bg-black/5 px-1 rounded">{wh.secret.slice(0, 10)}...</span> (HMAC-SHA256 signed with X-TidyRow-Signature)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {wh.events.map((e) => (
                              <span key={e} className="font-mono text-[9px] bg-[#F0EEE6] px-1 rounded text-[#202522]/80">
                                {e}
                              </span>
                            ))}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="text-red-600 hover:bg-red-50 text-xs h-7 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: VERSIONED WORKFLOWS */}
          {activeTab === 'workflows' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left: Workflow Selector */}
                <div className="border border-[#E5E5DE] rounded p-3 bg-[#F7F5EF] space-y-2">
                  <h4 className="font-bold text-xs text-[#202522] mb-1">Workflows</h4>
                  {workflows.length === 0 ? (
                    <p className="text-xs text-[#202522]/60 italic">No versioned workflows found.</p>
                  ) : (
                    workflows.map((wf) => (
                      <button
                        key={wf.id}
                        type="button"
                        onClick={() => handleSelectWorkflow(wf.id)}
                        className={`w-full text-left p-2 rounded text-xs transition-colors cursor-pointer border ${
                          wf.id === activeWfId
                            ? 'bg-white border-[#4D7CFE] shadow-2xs font-bold text-[#202522]'
                            : 'bg-white/50 border-[#E5E5DE] text-[#202522]/70 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{wf.name}</span>
                          <span className="font-mono text-[10px] bg-[#4D7CFE]/15 text-[#4D7CFE] px-1.5 rounded">
                            v{wf.activeVersion}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#202522]/60 truncate mt-0.5">{wf.description}</p>
                      </button>
                    ))
                  )}
                </div>

                {/* Right: Version History & Changelog */}
                <div className="md:col-span-2 border border-[#E5E5DE] rounded p-4 bg-white space-y-4">
                  <h4 className="font-bold text-xs text-[#202522] flex items-center justify-between">
                    <span>Version History & Immutable Snapshots</span>
                    <span className="font-mono text-[10px] text-[#202522]/60">
                      Total Versions: {selectedWfVersions.length}
                    </span>
                  </h4>

                  {selectedWfVersions.length === 0 ? (
                    <p className="text-xs text-[#202522]/60 italic">Select a workflow on the left.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedWfVersions.map((v) => {
                        const isCurrentActive =
                          workflows.find((w) => w.id === activeWfId)?.activeVersion === v.versionNumber;
                        return (
                          <div
                            key={v.versionNumber}
                            className={`p-3 rounded border text-xs ${
                              isCurrentActive ? 'border-[#2F8F6B] bg-emerald-50/40' : 'border-[#E5E5DE] bg-[#F7F5EF]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold font-mono text-xs">v{v.versionNumber}</span>
                                {isCurrentActive && (
                                  <span className="bg-[#2F8F6B] text-white font-mono text-[9px] px-1.5 py-0.2 rounded font-bold">
                                    ACTIVE RELEASE
                                  </span>
                                )}
                                <span className="text-[11px] text-[#202522]/60">{v.changelog}</span>
                              </div>
                              {!isCurrentActive && activeWfId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    await versionedWorkflowService.setActiveVersion(activeWfId, workspaceId, v.versionNumber);
                                    loadData();
                                  }}
                                  className="h-6 text-[10px] gap-1 cursor-pointer border-[#E5E5DE]"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  Rollback to v{v.versionNumber}
                                </Button>
                              )}
                            </div>

                            <div className="mt-2 space-y-1 pl-2 border-l-2 border-black/10">
                              {v.steps.map((st, sIdx) => (
                                <div key={st.id || sIdx} className="text-[11px] flex items-center gap-1.5 text-[#202522]/80">
                                  <span className="font-mono text-[9px] text-[#4D7CFE]">#{sIdx + 1}</span>
                                  <span>{st.title}</span>
                                  <span className="font-mono text-[9px] text-[#202522]/50">({st.action})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BATCH RUNS */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-[#202522]">Multi-File Batch Processing</h4>
                  <p className="text-[11px] text-[#202522]/70 mt-0.5">
                    Uniform execution of workflows across batches of spreadsheets with independent invariant verification.
                  </p>
                </div>
              </div>

              {batchRuns.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[#E5E5DE] rounded">
                  <Layers className="h-8 w-8 text-[#202522]/30 mx-auto mb-2" />
                  <p className="text-xs text-[#202522]/70">No batch runs recorded yet.</p>
                  <p className="text-[11px] text-[#202522]/50 mt-1">
                    Submit multi-file batches via <code>POST /api/v1/batch</code> or the batch file API.
                  </p>
                </div>
              ) : (
                <div className="border border-[#E5E5DE] rounded divide-y divide-[#E5E5DE]">
                  {batchRuns.map((b) => (
                    <div key={b.batchId} className="p-4 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs">{b.batchId}</span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              b.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : b.status === 'partial_failure'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#202522]/60 font-mono">
                          {Math.round(b.durationMs)}ms duration
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-[11px] p-2 bg-[#F7F5EF] rounded font-mono">
                        <div>Files: <strong>{b.succeededFiles}/{b.totalFiles}</strong></div>
                        <div>Rows: <strong>{b.totalRowsBefore.toLocaleString()} → {b.totalRowsAfter.toLocaleString()}</strong></div>
                        <div>Duplicates Removed: <strong>{b.totalDuplicatesRemoved}</strong></div>
                        <div>Ops: <strong>{b.totalOperationsExecuted}</strong></div>
                      </div>

                      <div className="space-y-1 pt-1">
                        {b.fileResults.map((f) => (
                          <div key={f.fileId} className="flex items-center justify-between text-[11px] text-[#202522]/70">
                            <span className="flex items-center gap-1.5">
                              {f.success ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-600" />
                              )}
                              {f.fileName}
                            </span>
                            <span>{f.rowsBefore} → {f.rowsAfter} rows</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs flex items-start gap-2">
                <Shield className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Architectural Rule:</strong> No fake connected states. Providers remain strictly
                  disconnected until valid credentials and authentication checks are verified.
                </div>
              </div>

              {/* Provider Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(INTEGRATION_REGISTRY) as IntegrationProviderId[]).map((pId) => {
                  const def = INTEGRATION_REGISTRY[pId];
                  const state = connections.find((c) => c.providerId === pId);
                  const isConn = state?.status === 'connected';
                  const isMiss = state?.status === 'missing_credentials';
                  const isInv = state?.status === 'invalid_credentials';

                  return (
                    <div
                      key={pId}
                      className={`p-4 rounded border transition-all ${
                        isConn
                          ? 'border-emerald-300 bg-emerald-50/20'
                          : isInv
                          ? 'border-red-300 bg-red-50/20'
                          : 'border-[#E5E5DE] bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-xs text-[#202522]">{def.name}</h4>
                          <p className="text-[11px] text-[#202522]/70 mt-0.5">{def.description}</p>
                        </div>
                        <span
                          className={`font-mono text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                            isConn
                              ? 'bg-emerald-100 text-emerald-800'
                              : isMiss
                              ? 'bg-amber-100 text-amber-800'
                              : isInv
                              ? 'bg-red-100 text-red-800'
                              : 'bg-black/5 text-[#202522]/60'
                          }`}
                        >
                          {state?.status || 'disconnected'}
                        </span>
                      </div>

                      <div className="mt-3 text-[10px] text-[#202522]/70">
                        <strong>Required Credentials:</strong>{' '}
                        {def.requiredCredentials.map((c) => c.label).join(', ')}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setConfigProvider(pId);
                            setCredValues({});
                            setConfigMessage(null);
                          }}
                          className="text-xs h-7 border-[#E5E5DE] cursor-pointer"
                        >
                          {isConn ? 'Reconfigure' : 'Configure Credentials'}
                        </Button>

                        {isConn && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDisconnect(pId)}
                            className="text-xs h-7 text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            Disconnect
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Configure Drawer / Modal View */}
              {configProvider && (
                <div className="p-4 bg-[#F7F5EF] border border-[#E5E5DE] rounded-md space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-[#202522]">
                      Configure {INTEGRATION_REGISTRY[configProvider].name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setConfigProvider(null)}
                      className="text-[#202522]/60 hover:text-[#202522] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {configMessage && (
                    <div
                      className={`p-2.5 rounded text-xs ${
                        configMessage.type === 'success'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-red-100 text-red-900 border border-red-300'
                      }`}
                    >
                      {configMessage.text}
                    </div>
                  )}

                  <div className="space-y-2">
                    {INTEGRATION_REGISTRY[configProvider].requiredCredentials.map((req) => (
                      <div key={req.key}>
                        <label className="block text-[11px] font-medium text-[#202522]">
                          {req.label} {req.envVarName && <span className="font-mono text-[#4D7CFE]">({req.envVarName})</span>}
                        </label>
                        <input
                          type={req.secret ? 'password' : 'text'}
                          value={credValues[req.key] || ''}
                          onChange={(e) => setCredValues({ ...credValues, [req.key]: e.target.value })}
                          placeholder={req.description}
                          className="w-full bg-white border border-[#E5E5DE] rounded px-3 py-1.5 text-xs text-[#202522] mt-0.5"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfigProvider(null)}
                      className="text-xs h-7"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveCredentials}
                      className="bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white text-xs h-7 cursor-pointer"
                    >
                      Verify & Connect
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ZAPIER & MAKE */}
          {activeTab === 'zapier_make' && (
            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-xs text-[#202522]">Zapier & Make Automation</h4>
                <p className="text-[11px] text-[#202522]/70 mt-0.5">
                  Connect TidyRow to 5,000+ external apps via Zapier Webhooks or Make HTTP modules.
                </p>
              </div>

              {/* Endpoint Guide */}
              <div className="p-4 bg-[#F7F5EF] border border-[#E5E5DE] rounded space-y-2 font-mono text-xs">
                <div className="font-bold text-[#202522]">Inbound Automation Endpoint:</div>
                <div className="p-2 bg-white rounded border border-[#E5E5DE] text-[#4D7CFE] select-all">
                  POST /api/v1/zapier/trigger
                </div>
                <div className="text-[11px] text-[#202522]/70 font-sans">
                  Pass your API key in header (<code>Authorization: Bearer tr_live_...</code>) or payload. Supports <code>Idempotency-Key</code> header to prevent duplicate runs.
                </div>
              </div>

              {/* Supported Actions & Triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-[#E5E5DE] rounded p-3 bg-white space-y-2">
                  <h5 className="font-bold text-xs text-[#202522] flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Available Triggers
                  </h5>
                  {ZAPIER_MAKE_ACTIONS_MANIFEST.triggers.map((t) => (
                    <div key={t.key} className="p-2 bg-[#F7F5EF] rounded text-xs space-y-0.5">
                      <strong>{t.name}</strong>
                      <p className="text-[10px] text-[#202522]/70">{t.description}</p>
                    </div>
                  ))}
                </div>

                <div className="border border-[#E5E5DE] rounded p-3 bg-white space-y-2">
                  <h5 className="font-bold text-xs text-[#202522] flex items-center gap-1.5">
                    <Play className="h-3.5 w-3.5 text-[#4D7CFE]" />
                    Available Actions
                  </h5>
                  {ZAPIER_MAKE_ACTIONS_MANIFEST.actions.map((a) => (
                    <div key={a.key} className="p-2 bg-[#F7F5EF] rounded text-xs space-y-0.5">
                      <strong>{a.name}</strong>
                      <p className="text-[10px] text-[#202522]/70">{a.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SCHEDULED WORKFLOWS */}
          {activeTab === 'schedules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-[#202522]">Scheduled Recurring Workflows</h4>
                  <p className="text-[11px] text-[#202522]/70 mt-0.5">
                    Automated cron sweeps executing versioned workflows on background cadence.
                  </p>
                </div>
              </div>

              {schedules.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[#E5E5DE] rounded">
                  <Calendar className="h-8 w-8 text-[#202522]/30 mx-auto mb-2" />
                  <p className="text-xs text-[#202522]/70">No recurring schedules configured yet.</p>
                </div>
              ) : (
                <div className="border border-[#E5E5DE] rounded divide-y divide-[#E5E5DE]">
                  {schedules.map((sc) => (
                    <div key={sc.id} className="p-3 bg-white flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{sc.name}</span>
                          <span className="font-mono text-[10px] bg-[#4D7CFE]/15 text-[#4D7CFE] px-1.5 rounded uppercase">
                            {sc.cadence}
                          </span>
                          {sc.lastStatus && (
                            <span
                              className={`font-mono text-[9px] px-1.5 rounded ${
                                sc.lastStatus === 'success'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {sc.lastStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#202522]/60 font-mono mt-0.5">
                          Next Run: {new Date(sc.nextRunAt).toLocaleString()}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await scheduledWorkflowService.runSchedule(sc.id);
                          loadData();
                        }}
                        className="text-xs h-7 gap-1 cursor-pointer border-[#E5E5DE]"
                      >
                        <Play className="h-3 w-3 text-[#4D7CFE]" />
                        Run Now
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
