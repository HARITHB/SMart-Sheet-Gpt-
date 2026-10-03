import { applicationService } from '../src/lib/automation/applicationService';
import { apiKeyService, ApiAuthenticationError, ApiForbiddenError } from '../src/lib/automation/apiKeyService';
import { idempotencyService, IdempotencyConflictError } from '../src/lib/automation/idempotencyService';
import { webhookService, signWebhookPayload, verifyWebhookSignature } from '../src/lib/automation/webhookService';
import { versionedWorkflowService } from '../src/lib/automation/versionedWorkflows';
import { batchProcessingService } from '../src/lib/automation/batchProcessing';
import { integrationService, IntegrationNotConfiguredError } from '../src/lib/automation/integrations';
import { zapierMakeAutomationService, ZAPIER_MAKE_ACTIONS_MANIFEST } from '../src/lib/automation/zapierMakeAutomation';
import { scheduledWorkflowService, computeNextRun } from '../src/lib/automation/scheduledWorkflows';
import { apiRouter } from '../src/lib/automation/apiRouter';
import { Principal, WorkspaceRole } from '../src/lib/saas/auth';
import { workspaceService } from '../src/lib/saas/workspace';
import { STANDARD_RECIPES } from '../src/lib/core/recipes';

export async function runAutomationIntegrationsTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${msg}`);
    }
  }

  console.log('\n--- Running P2 Automation, API & Integrations Test Suite ---');

  const testWsId = 'ws_automation_test';
  await workspaceService.createWorkspace({
    name: 'Automation Test Workspace',
    ownerId: 'user_auto_owner',
    ownerEmail: 'auto_owner@test.internal',
    tier: 'pro',
  });

  const testPrincipal: Principal = {
    id: 'user_auto_owner',
    email: 'auto_owner@test.internal',
    name: 'Automation Owner',
    type: 'user',
    role: 'owner' as WorkspaceRole,
    status: 'active',
  };

  const viewerPrincipal: Principal = {
    id: 'user_auto_viewer',
    email: 'viewer@test.internal',
    name: 'Automation Viewer',
    type: 'user',
    role: 'viewer' as WorkspaceRole,
    status: 'active',
  };

  // ==========================================
  // 1. Application-Service Boundary
  // ==========================================
  console.log('Testing 1. Application-Service Boundary...');

  // Invariant verification on dirty dataset
  const dirtyRows = [
    { _tr_id: 'r1', company: '  Acme Corp  ', email: 'alice@acme.com', phone: '+1 555-0100' },
    { _tr_id: 'r2', company: 'beta technologies', email: 'bob@beta.io', phone: '+1 555-0101' },
    { _tr_id: 'r3', company: '  Acme Corp  ', email: 'alice@acme.com', phone: '+1 555-0100' }, // duplicate
  ];
  const dirtyHeaders = ['company', 'email', 'phone'];

  // Clean using CRM recipe
  const cleanRes = await applicationService.cleanDataset({
    workspaceId: testWsId,
    principal: testPrincipal,
    fileName: 'dirty_leads.csv',
    headers: dirtyHeaders,
    rows: dirtyRows,
    recipe: STANDARD_RECIPES[0],
  });

  assert(cleanRes.success === true, 'Application service clean execution succeeds');
  assert(cleanRes.version.rows.length === 2, 'Duplicate row deduplicated by core engine (3 -> 2 rows)');
  assert(cleanRes.invariantValidation.valid === true, 'Post-invariants validated by core engine');
  assert(cleanRes.postValidation !== undefined, 'Post-clean validation report generated');
  assert(cleanRes.operationsExecuted > 0, 'Operations tracked and reported');

  // RBAC enforcement: viewer is blocked from mutating via application service
  let rbacBlocked = false;
  try {
    await applicationService.cleanDataset({
      workspaceId: testWsId,
      principal: viewerPrincipal,
      fileName: 'dirty_leads.csv',
      headers: dirtyHeaders,
      rows: dirtyRows,
      recipe: STANDARD_RECIPES[0],
    });
  } catch (err: any) {
    if (err?.name === 'AuthorizationError') rbacBlocked = true;
  }
  assert(rbacBlocked, 'Application service strictly enforces RBAC (blocks viewer from clean)');

  // Structural validation through application service
  const valRes = await applicationService.validateDataset({
    workspaceId: testWsId,
    principal: testPrincipal,
    headers: dirtyHeaders,
    rows: dirtyRows,
  });
  assert(valRes.valid === true, 'Application service validateDataset asserts valid invariant schema');

  // ==========================================
  // 2. Authenticated Job-Based API
  // ==========================================
  console.log('Testing 2. Authenticated Job-Based API...');

  // Create API key
  const { rawKey, record: keyRecord } = await apiKeyService.createApiKey({
    workspaceId: testWsId,
    name: 'CI Integration Key',
    scopes: ['jobs:create', 'jobs:read', 'jobs:cancel', 'data:clean', 'workflows:read', 'workflows:execute'],
    createdBy: testPrincipal.id,
    environment: 'live',
  });

  assert(rawKey.startsWith('tr_live_'), 'Generated API key begins with tr_live_ prefix');
  assert(keyRecord.keyHash.length > 20, 'API key stored as secure hash');
  assert(keyRecord.scopes.includes('jobs:create'), 'Granted scopes assigned to key record');

  // Authenticate key
  const authOutcome = await apiKeyService.authenticate(rawKey);
  assert(authOutcome.apiKey.id === keyRecord.id, 'API key authenticates successfully');
  assert(authOutcome.principal.role === 'service_account', 'API principal maps to service_account role');

  // Scope assertion
  apiKeyService.assertScope(authOutcome.apiKey, 'jobs:create');
  let scopeDenied = false;
  try {
    apiKeyService.assertScope(authOutcome.apiKey, 'webhooks:manage');
  } catch (err) {
    if (err instanceof ApiForbiddenError) scopeDenied = true;
  }
  assert(scopeDenied, 'API key without required scope throws ApiForbiddenError (403)');

  // Test REST API Router: Submit async job
  const submitReq = {
    method: 'POST' as const,
    path: '/api/v1/jobs',
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    body: {
      type: 'validate_dataset',
      params: {
        headers: dirtyHeaders,
        rows: dirtyRows,
      },
    },
  };
  const submitRes = await apiRouter.handleRequest(submitReq);
  assert(submitRes.statusCode === 202, 'POST /api/v1/jobs returns 202 Accepted');
  assert(submitRes.body.status === 'queued', 'Submitted job status is queued');
  assert(Boolean(submitRes.body.jobId), 'Job returns unique jobId');

  // Query job status
  const queryReq = {
    method: 'GET' as const,
    path: `/api/v1/jobs/${submitRes.body.jobId}`,
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
  };
  const queryRes = await apiRouter.handleRequest(queryReq);
  assert(queryRes.statusCode === 200, 'GET /api/v1/jobs/:id returns 200 OK');
  assert(queryRes.body.id === submitRes.body.jobId, 'Query returns matching job record');

  // Cancel job
  const cancelReq = {
    method: 'POST' as const,
    path: `/api/v1/jobs/${submitRes.body.jobId}/cancel`,
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    body: { reason: 'Test cancellation' },
  };
  const cancelRes = await apiRouter.handleRequest(cancelReq);
  assert(cancelRes.statusCode === 200, 'POST /api/v1/jobs/:id/cancel succeeds');

  // Invalid key rejected
  const badAuthRes = await apiRouter.handleRequest({
    method: 'GET',
    path: '/api/v1/jobs',
    headers: { authorization: 'Bearer tr_live_invalidkey123' },
  });
  assert(badAuthRes.statusCode === 401, 'Invalid API key returns 401 Unauthorized');

  // ==========================================
  // 3. Idempotency Engine
  // ==========================================
  console.log('Testing 3. Idempotency Engine...');

  const idemKey = `idem_${Date.now()}`;
  const idemPayload = {
    type: 'validate_dataset',
    params: { headers: ['colA'], rows: [{ _tr_id: '1', colA: 'val' }] },
  };

  // First request with idempotency key
  const idemReq1 = {
    method: 'POST' as const,
    path: '/api/v1/jobs',
    headers: {
      authorization: `Bearer ${rawKey}`,
      'idempotency-key': idemKey,
    },
    body: idemPayload,
  };
  const idemRes1 = await apiRouter.handleRequest(idemReq1);
  assert(idemRes1.statusCode === 202, 'First request with idempotency key succeeds with 202');
  const originalJobId = idemRes1.body.jobId;

  // Replayed request with SAME key & payload
  const idemRes2 = await apiRouter.handleRequest(idemReq1);
  assert(idemRes2.statusCode === 202, 'Replay with same idempotency key returns 202');
  assert(idemRes2.body.jobId === originalJobId, 'Replay returns identical job ID');
  assert(idemRes2.headers['X-Cache'] === 'IDEMPOTENT_HIT', 'Replay marked with X-Cache: IDEMPOTENT_HIT');

  // Replay with SAME key but DIFFERENT payload throws 422 Conflict
  const idemReqConflict = {
    method: 'POST' as const,
    path: '/api/v1/jobs',
    headers: {
      authorization: `Bearer ${rawKey}`,
      'idempotency-key': idemKey,
    },
    body: { type: 'different_type', params: {} },
  };
  const conflictRes = await apiRouter.handleRequest(idemReqConflict);
  assert(conflictRes.statusCode === 422, 'Reusing idempotency key with different payload returns 422 Conflict');

  // ==========================================
  // 4. Webhooks
  // ==========================================
  console.log('Testing 4. Webhooks...');

  const registeredWh = await webhookService.registerWebhook({
    workspaceId: testWsId,
    url: 'https://example.com/webhooks/tidyrow',
    description: 'Test Webhook Listener',
    events: ['job.queued', 'job.completed', 'batch.completed', 'workflow.executed'],
  });

  assert(registeredWh.id.startsWith('wh_'), 'Webhook registered with unique ID');
  assert(registeredWh.secret.startsWith('whsec_'), 'Webhook provisioned with secret starting with whsec_');

  // Test cryptographic signing & verification
  const samplePayload = { jobId: 'job_123', status: 'completed' };
  const { signatureHeader, timestamp } = await signWebhookPayload(registeredWh.secret, samplePayload);

  assert(signatureHeader.startsWith(`t=${timestamp},v1=`), 'Webhook signature header format is valid (t=...,v1=...)');

  const verifyValid = await verifyWebhookSignature(
    registeredWh.secret,
    JSON.stringify(samplePayload),
    signatureHeader
  );
  assert(verifyValid.valid === true, 'Webhook signature verification succeeds with correct secret');

  const verifyInvalid = await verifyWebhookSignature(
    'wrong_secret',
    JSON.stringify(samplePayload),
    signatureHeader
  );
  assert(verifyInvalid.valid === false, 'Webhook signature verification fails with incorrect secret');

  // Test event dispatch with custom transport
  let deliveredBody: any = null;
  webhookService.setCustomTransportForTesting(async (_url, headers, body) => {
    deliveredBody = JSON.parse(body);
    return { status: 200, text: 'OK' };
  });

  const dispatchLogs = await webhookService.dispatchEvent(testWsId, 'job.completed', {
    jobId: 'job_wh_test',
    status: 'completed',
    rowsProcessed: 100,
  });

  assert(dispatchLogs.length > 0, 'Webhook event dispatched to subscribed endpoint');
  assert(dispatchLogs[0].success === true, 'Delivery recorded as successful');
  assert(deliveredBody?.event === 'job.completed', 'Dispatched payload contains event name');
  assert(deliveredBody?.data?.jobId === 'job_wh_test', 'Dispatched payload contains event data');

  // Reset custom transport
  webhookService.setCustomTransportForTesting(undefined);

  // ==========================================
  // 5. Versioned Saved Workflows
  // ==========================================
  console.log('Testing 5. Versioned Saved Workflows...');

  const { workflow: createdWf, version: v1 } = await versionedWorkflowService.createWorkflow({
    workspaceId: testWsId,
    name: 'Lead Hygiene Pipeline',
    description: 'Standardizes lead records for CRM import',
    targetDomain: 'crm',
    createdBy: testPrincipal.id,
    steps: [
      {
        id: 's1',
        title: 'Trim Whitespace',
        action: 'trim',
        enabled: true,
        deterministic: true,
        reason: 'Clean lead fields',
      },
      {
        id: 's2',
        title: 'Title Case Names',
        action: 'titlecase',
        column: 'company',
        enabled: true,
        deterministic: true,
        reason: 'Format company casing',
      },
    ],
  });

  assert(createdWf.activeVersion === 1, 'Initial workflow active version is 1');
  assert(v1.versionNumber === 1, 'Initial version snapshot recorded');

  // Create Version 2 with deduplication step
  const v2 = await versionedWorkflowService.createNewVersion({
    workflowId: createdWf.id,
    workspaceId: testWsId,
    changelog: 'Added deduplication step',
    createdBy: testPrincipal.id,
    steps: [
      ...v1.steps,
      {
        id: 's3',
        title: 'Deduplicate Records',
        action: 'deduplicate',
        enabled: true,
        deterministic: true,
        reason: 'Remove identical duplicate leads',
      },
    ],
  });

  assert(v2.versionNumber === 2, 'New version created with incremented version number (2)');
  const updatedWf = await versionedWorkflowService.getWorkflow(createdWf.id, testWsId);
  assert(updatedWf?.activeVersion === 2, 'Active version automatically updated to 2');

  // Compare diffs between v1 and v2
  const diff = versionedWorkflowService.compareVersions(createdWf.id, 1, 2);
  assert(diff.addedSteps.length === 1, 'Version diff identifies 1 added step');
  assert(diff.addedSteps[0].id === 's3', 'Diff correctly identifies added step ID');

  // Execute Version 2 against dataset
  const wfExecRes = await versionedWorkflowService.executeWorkflow({
    workflowId: createdWf.id,
    workspaceId: testWsId,
    versionNumber: 2,
    principal: testPrincipal,
    fileName: 'leads_wf.csv',
    headers: dirtyHeaders,
    rows: dirtyRows,
  });

  assert(wfExecRes.success === true, 'Versioned workflow execution succeeds');
  assert(wfExecRes.version.rows.length === 2, 'Version 2 deduplicates dirty dataset (3 -> 2 rows)');

  // Verify execution audit log
  const execLogs = await versionedWorkflowService.listExecutions(testWsId, createdWf.id);
  assert(execLogs.length > 0, 'Workflow execution audit log recorded');
  assert(execLogs[0].versionNumber === 2, 'Audit log tracks executed version number');
  assert(execLogs[0].rowsBefore === 3 && execLogs[0].rowsAfter === 2, 'Audit log records rowsBefore and rowsAfter delta');

  // Rollback active version to v1
  await versionedWorkflowService.setActiveVersion(createdWf.id, testWsId, 1);
  const rolledBackWf = await versionedWorkflowService.getWorkflow(createdWf.id, testWsId);
  assert(rolledBackWf?.activeVersion === 1, 'Workflow active version safely rolled back to 1');

  // ==========================================
  // 6. Batch Files
  // ==========================================
  console.log('Testing 6. Batch Files Processing...');

  const batchFiles = [
    {
      fileName: 'east_region_leads.csv',
      headers: ['company', 'email', 'phone'],
      rows: [
        { _tr_id: 'e1', company: '  Alpha Co  ', email: 'a@alpha.com', phone: '555-1111' },
        { _tr_id: 'e2', company: '  Alpha Co  ', email: 'a@alpha.com', phone: '555-1111' }, // dup
      ],
    },
    {
      fileName: 'west_region_leads.csv',
      headers: ['company', 'email', 'phone'],
      rows: [
        { _tr_id: 'w1', company: '  Beta Co  ', email: 'b@beta.com', phone: '555-2222' },
        { _tr_id: 'w2', company: 'Gamma Corp', email: 'g@gamma.com', phone: '555-3333' },
      ],
    },
  ];

  const batchSummary = await batchProcessingService.processBatch({
    workspaceId: testWsId,
    principal: testPrincipal,
    files: batchFiles,
    recipe: STANDARD_RECIPES[0],
  });

  assert(batchSummary.totalFiles === 2, 'Batch processes 2 files');
  assert(batchSummary.succeededFiles === 2, 'All batch files succeed');
  assert(batchSummary.totalRowsBefore === 4, 'Aggregate totalRowsBefore tracked (4)');
  assert(batchSummary.totalRowsAfter === 3, 'Aggregate totalRowsAfter reflects deduplication (3)');
  assert(batchSummary.totalDuplicatesRemoved === 1, 'Aggregate totalDuplicatesRemoved tracked (1)');
  assert(batchSummary.status === 'completed', 'Batch summary status is completed');
  assert(batchSummary.fileResults[0].fileName === 'east_region_leads.csv', 'Per-file result details preserved');

  // ==========================================
  // 7. Real Integrations (No Fake Connected States)
  // ==========================================
  console.log('Testing 7. Real Integrations & Provider Boundaries...');

  const hsInitial = await integrationService.getConnectionState(testWsId, 'hubspot');
  assert(hsInitial.status === 'disconnected', 'Unconfigured HubSpot integration is strictly "disconnected"');
  assert(hsInitial.credentialsConfigured === false, 'credentialsConfigured is false for unconfigured integration');
  assert(hsInitial.missingCredentials.length > 0, 'Lists required missing credentials');

  // Calling pull or push when disconnected throws IntegrationNotConfiguredError
  let pullBlocked = false;
  try {
    await integrationService.pullData(testWsId, 'hubspot');
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) pullBlocked = true;
  }
  assert(pullBlocked, 'Calling pullData on disconnected provider throws IntegrationNotConfiguredError');

  // Attempting configuration with partial/empty credentials sets status to 'missing_credentials'
  const partialConfig = await integrationService.configureCredentials(testWsId, 'hubspot', {
    accessToken: '', // Empty token
  });
  assert(partialConfig.status === 'missing_credentials', 'Empty token yields "missing_credentials" status');

  // Providing invalid credentials that fail test ping yields 'invalid_credentials'
  const failedPingConfig = await integrationService.configureCredentials(
    testWsId,
    'hubspot',
    { accessToken: 'pat_invalid_token_test' },
    async () => ({ success: false, error: 'HTTP 401 Unauthorized: Invalid API token' })
  );
  assert(failedPingConfig.status === 'invalid_credentials', 'Failed ping yields "invalid_credentials" status');
  assert(failedPingConfig.credentialsConfigured === false, 'credentialsConfigured remains false on ping failure');

  // Legitimate credentials validated via live ping yield 'connected'
  const successfulConfig = await integrationService.configureCredentials(
    testWsId,
    'hubspot',
    { accessToken: 'pat_live_test_valid_token' },
    async () => ({ success: true })
  );
  assert(successfulConfig.status === 'connected', 'Validated credentials yield "connected" status');
  assert(successfulConfig.credentialsConfigured === true, 'credentialsConfigured is true when ping succeeds');

  // Connected integration allows push and pull
  const pushRes = await integrationService.pushData(
    testWsId,
    'hubspot',
    ['email', 'firstname'],
    [{ _tr_id: '1', email: 'test@hubspot.com', firstname: 'Test' }],
    async () => ({ recordsCreated: 1, recordsUpdated: 0 })
  );
  assert(pushRes.success === true, 'pushData succeeds on connected provider');

  // Disconnect purges credentials and returns to disconnected
  const discState = await integrationService.disconnect(testWsId, 'hubspot');
  assert(discState.status === 'disconnected', 'Disconnect resets status to "disconnected"');

  // ==========================================
  // 8. Zapier / Make / Webhook Automation
  // ==========================================
  console.log('Testing 8. Zapier / Make Automation...');

  assert(ZAPIER_MAKE_ACTIONS_MANIFEST.actions.length >= 2, 'Zapier/Make action schemas defined in manifest');
  assert(ZAPIER_MAKE_ACTIONS_MANIFEST.triggers.length >= 2, 'Zapier/Make trigger schemas defined in manifest');

  // Execute inbound webhook from Zapier with API key
  const zapierRes = await zapierMakeAutomationService.handleInboundWebhook({
    apiKey: rawKey,
    datasetName: 'zapier_leads.csv',
    headers: dirtyHeaders,
    rows: dirtyRows,
    idempotencyKey: `zap_idem_${Date.now()}`,
  });

  assert(zapierRes.success === true, 'Zapier inbound webhook executes successfully');
  assert(zapierRes.status === 'completed', 'Zapier response status is completed');
  assert(zapierRes.cleanedDataset !== undefined, 'Zapier receives cleaned dataset');
  assert(Boolean(zapierRes.cleanedDataset?.rows.every((r) => (r as any)._tr_id === undefined)), 'Internal _tr_id is cleanly stripped from external Zapier output');

  // ==========================================
  // 9. Scheduled Workflows
  // ==========================================
  console.log('Testing 9. Scheduled Workflows...');

  const schedule = await scheduledWorkflowService.createSchedule({
    workspaceId: testWsId,
    name: 'Daily Morning Lead Sweep',
    workflowId: createdWf.id,
    cadence: 'daily',
    sourceConfig: {
      type: 'sample',
      datasetName: 'morning_leads.csv',
    },
  });

  assert(schedule.id.startsWith('sched_'), 'Schedule created with unique ID');
  assert(schedule.cadence === 'daily', 'Cadence set to daily');
  assert(Boolean(schedule.nextRunAt), 'nextRunAt timestamp computed');

  // Run schedule immediately
  const schedRun = await scheduledWorkflowService.runSchedule(schedule.id);
  assert(schedRun.success === true, 'Scheduled workflow run executes successfully');
  assert(schedRun.rowsProcessed > 0, 'Scheduled run processes rows through core engine');

  // Verify updated schedule nextRunAt
  const updatedSchedule = await scheduledWorkflowService.getSchedule(schedule.id, testWsId);
  assert(updatedSchedule?.lastStatus === 'success', 'Schedule records lastStatus as success');
  assert(Boolean(updatedSchedule?.lastRunAt), 'Schedule records lastRunAt timestamp');

  // Sweep runner executes due schedules
  const dueTimestamp = new Date(Date.now() + 86400000 * 2); // 2 days in future
  const sweepResults = await scheduledWorkflowService.sweepAndExecuteDueSchedules(dueTimestamp);
  assert(sweepResults.length > 0, 'Sweep runner successfully triggers and executes due schedules');

  console.log(`\n====================================================`);
  console.log(`P2C Automation, API & Integrations: ${passed} passed, ${failed} failed`);
  console.log(`====================================================\n`);

  return { passed, failed };
}

// Auto-run if executed directly via tsx
if (typeof process !== 'undefined' && process.argv[1]?.includes('automationApiIntegrations.test.ts')) {
  runAutomationIntegrationsTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
