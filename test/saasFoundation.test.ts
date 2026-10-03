import { LocalAuthAdapter, AuthorizationError, ROLE_PERMISSIONS } from '../src/lib/saas/auth';
import { LocalWorkspaceRepository, TIER_QUOTAS } from '../src/lib/saas/workspace';
import { MemoryPersistenceAdapter } from '../src/lib/saas/persistence';
import { LocalJobQueue } from '../src/lib/saas/jobs';
import { SessionRecoveryManager } from '../src/lib/saas/sessionRecovery';
import { UsageMeteringService } from '../src/lib/saas/metering';
import {
  sanitizeCellValue,
  desanitizeCellValue,
  sanitizeDatasetRows,
  validatePayloadBounds,
  scanDatasetForPii,
  maskSensitiveValue,
  SecurityViolationError,
  DEFAULT_SECURITY_POLICY,
} from '../src/lib/saas/security';
import { DataLifecycleService } from '../src/lib/saas/privacy';
import { SharedCleaningEngine } from '../src/lib/saas/sharedEngine';
import { createInitialVersion } from '../src/lib/core/transaction';
import { STANDARD_RECIPES } from '../src/lib/core/recipes';

// Mock localStorage for Node test runner
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
};

if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    localStorage: createMockLocalStorage(),
    addEventListener: () => {},
  };
}

export async function runSaasFoundationTests(): Promise<{ passed: number; failed: number }> {
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

  console.log('\n--- Running P2A SaaS Foundation Test Suite ---');

  // ==========================================
  // 1. Auth Boundary & RBAC
  // ==========================================
  console.log('Testing Auth Boundary & RBAC...');
  const auth = new LocalAuthAdapter();
  const ownerSession = await auth.login({ email: 'ceo@acme.com', name: 'Alice CEO', role: 'owner' });

  assert(ownerSession.principal.role === 'owner', 'Owner session correctly initialized');
  assert(auth.checkPermission(ownerSession, 'workspace:delete') === true, 'Owner has workspace:delete');
  assert(auth.checkPermission(ownerSession, 'data:clean') === true, 'Owner has data:clean');

  const editorSession = await auth.login({ email: 'editor@acme.com', role: 'editor' });
  assert(auth.checkPermission(editorSession, 'data:clean') === true, 'Editor has data:clean');
  assert(auth.checkPermission(editorSession, 'workspace:delete') === false, 'Editor lacks workspace:delete');

  const viewerSession = await auth.login({ email: 'viewer@acme.com', role: 'viewer' });
  assert(auth.checkPermission(viewerSession, 'data:view') === true, 'Viewer has data:view');
  assert(auth.checkPermission(viewerSession, 'data:clean') === false, 'Viewer lacks data:clean');

  let blocked = false;
  try {
    auth.requirePermission(viewerSession, 'data:clean');
  } catch (err) {
    if (err instanceof AuthorizationError) blocked = true;
  }
  assert(blocked, 'Viewer calling requirePermission(data:clean) throws AuthorizationError');

  // Verify token validation
  const verifiedPrincipal = await auth.verifyToken(editorSession.token);
  assert(verifiedPrincipal?.id === editorSession.principal.id, 'Token correctly verifies to principal');

  // ==========================================
  // 2. Workspace Model & Multi-Tenancy
  // ==========================================
  console.log('Testing Workspace Model & Multi-Tenancy...');
  const wsRepo = new LocalWorkspaceRepository();
  const wsA = await wsRepo.createWorkspace({
    name: 'Alpha Corp',
    ownerId: 'usr_alpha',
    ownerEmail: 'alpha@acme.com',
    tier: 'starter',
  });
  const wsB = await wsRepo.createWorkspace({
    name: 'Beta LLC',
    ownerId: 'usr_beta',
    ownerEmail: 'beta@acme.com',
    tier: 'growth',
  });

  assert(wsA.id !== wsB.id, 'Distinct workspaces created with unique IDs');
  assert(wsA.tier === 'starter', 'Workspace A is starter tier');
  assert(wsB.tier === 'growth', 'Workspace B is growth tier');

  const quotaA = await wsRepo.getQuota(wsA.id);
  assert(quotaA.maxRowsPerDataset === TIER_QUOTAS.starter.maxRowsPerDataset, 'Starter quota enforced');

  const member = await wsRepo.addMember(wsA.id, {
    userId: 'usr_mem_1',
    workspaceId: wsA.id,
    email: 'dev@alpha.com',
    name: 'Developer Dave',
    role: 'editor',
  });
  const membersA = await wsRepo.getMembers(wsA.id);
  assert(membersA.some((m) => m.userId === 'usr_mem_1'), 'Member successfully added to workspace');

  // Test team size limit on starter (max 3)
  await wsRepo.addMember(wsA.id, { userId: 'usr_mem_2', workspaceId: wsA.id, email: 'm2@alpha.com', name: 'M2', role: 'viewer' });
  let limitBlocked = false;
  try {
    await wsRepo.addMember(wsA.id, { userId: 'usr_mem_3', workspaceId: wsA.id, email: 'm3@alpha.com', name: 'M3', role: 'viewer' });
  } catch {
    limitBlocked = true;
  }
  assert(limitBlocked, 'Workspace team size quota enforced when limit exceeded');

  // ==========================================
  // 3. Persistence Model & Workspace Isolation
  // ==========================================
  console.log('Testing Persistence Model & Isolation...');
  const persistence = new MemoryPersistenceAdapter();

  const testRows = [
    { _tr_id: 'r_1', id: '101', name: 'Widget A', price: '$25.00' },
    { _tr_id: 'r_2', id: '102', name: 'Gadget B', price: '$49.99' },
  ];

  await persistence.saveDataset(wsA.id, {
    id: 'ds_1',
    workspaceId: wsA.id,
    name: 'Products Alpha',
    originalFileName: 'products.csv',
    headers: ['id', 'name', 'price'],
    rows: testRows,
    rowCount: 2,
    columnCount: 3,
    currentVersionId: 'v0_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Check Workspace Isolation: wsB must NOT see wsA's dataset
  const wsBDatasets = await persistence.listDatasets(wsB.id);
  assert(wsBDatasets.length === 0, 'Workspace B cannot see Workspace A datasets (Strict Tenant Isolation)');

  const dsInA = await persistence.getDataset(wsA.id, 'ds_1');
  assert(dsInA?.name === 'Products Alpha', 'Dataset retrieved successfully in Workspace A');

  // Audit logging test
  const audit = await persistence.saveAuditLog(wsA.id, {
    workspaceId: wsA.id,
    datasetId: 'ds_1',
    actorId: 'usr_alpha',
    action: 'TEST_DATASET_CREATED',
    details: { rows: 2 },
  });
  const logs = await persistence.getAuditLogs(wsA.id);
  assert(logs.length === 1 && logs[0].action === 'TEST_DATASET_CREATED', 'Audit log successfully recorded and scoped');

  // ==========================================
  // 4. Centralized Usage Metering
  // ==========================================
  console.log('Testing Centralized Usage Metering...');
  const metering = new UsageMeteringService();

  await metering.recordUsage(wsA.id, 'usr_alpha', 'rows_processed', 2000);
  await metering.recordUsage(wsA.id, 'usr_alpha', 'operations_executed', 5);

  const summary = await metering.getUsageSummary(wsA.id, 'starter');
  assert(summary.rowsProcessed === 2000, 'Rows processed recorded accurately');
  assert(summary.operationsExecuted === 5, 'Operations executed recorded accurately');

  // Check 80% warning logic
  const checkNearLimit = await metering.checkQuota(wsA.id, 'starter', 'rows_processed', 40000);
  assert(checkNearLimit.warningLevel === 'warning_80', 'Soft warning emitted at 80%+ capacity');

  // Check 100%+ blocking
  const checkOverLimit = await metering.checkQuota(wsA.id, 'starter', 'rows_processed', 50000);
  assert(checkOverLimit.isBlocked === true, 'Quota block enforced at 100%+ capacity');

  // ==========================================
  // 5. Security Baseline & Formula Sanitization
  // ==========================================
  console.log('Testing Security Baseline...');
  assert(sanitizeCellValue('=SUM(A1:A10)') === "'=SUM(A1:A10)", 'Formula = escaped with leading single quote');
  assert(sanitizeCellValue('+cmd|calc') === "'+cmd|calc", 'Formula + escaped');
  assert(sanitizeCellValue('-10') === "'-10", 'Leading minus escaped');
  assert(sanitizeCellValue('@HYPERLINK("http://evil.com")') === "'@HYPERLINK(\"http://evil.com\")", '@ command escaped');
  assert(sanitizeCellValue('Regular text') === 'Regular text', 'Benign text left untouched');
  assert(desanitizeCellValue("'-10") === '-10', 'Desanitization removes escape safely');

  const rowsWithInjections = [
    { _tr_id: 'r_1', formula: '=cmd.exe', safe: 'Normal' },
  ];
  const sanitizedRows = sanitizeDatasetRows(rowsWithInjections, ['formula', 'safe']);
  assert(sanitizedRows[0].formula === "'=cmd.exe", 'Entire dataset rows sanitized from formula injection');

  // Payload bounds
  let payloadError = false;
  try {
    validatePayloadBounds(['a'], [], { ...DEFAULT_SECURITY_POLICY, maxRows: 0 });
  } catch (err) {
    if (err instanceof SecurityViolationError) payloadError = true;
  }
  // Max rows 0 with 1 row test
  try {
    validatePayloadBounds(['a'], [{ a: 'val' }], { ...DEFAULT_SECURITY_POLICY, maxRows: 0 });
    payloadError = false;
  } catch {
    payloadError = true;
  }
  assert(payloadError, 'Payload bounds validator rejects row overages');

  // PII detection
  const piiData = [
    { _tr_id: 'r_1', email: 'john@example.com', ssn: '123-45-6789', phone: '(555) 123-4567', name: 'John' },
  ];
  const piiResult = scanDatasetForPii(['email', 'ssn', 'phone', 'name'], piiData);
  assert(piiResult.hasPii === true, 'PII scan detects sensitive data');
  assert(piiResult.typesDetected.includes('ssn'), 'SSN detected');
  assert(piiResult.typesDetected.includes('email'), 'Email detected');
  assert(maskSensitiveValue('123-45-6789', 'ssn') === '***-**-6789', 'SSN correctly masked');

  // ==========================================
  // 6. Privacy & Data Lifecycle
  // ==========================================
  console.log('Testing Privacy & Data Lifecycle...');
  const lifecycle = new DataLifecycleService(persistence);

  // Expired dataset test
  await persistence.saveDataset(wsA.id, {
    id: 'ds_expired',
    workspaceId: wsA.id,
    name: 'Old Stale Dataset',
    originalFileName: 'stale.csv',
    headers: ['id'],
    rows: [{ _tr_id: 'r_exp', id: '1' }],
    rowCount: 1,
    columnCount: 1,
    currentVersionId: 'v0',
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    retentionExpiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
  });

  const sweep = await lifecycle.sweepExpiredDatasets(wsA.id);
  assert(sweep.purgedCount === 1, 'Automated retention sweep purges expired dataset');
  const staleCheck = await persistence.getDataset(wsA.id, 'ds_expired');
  assert(staleCheck === null, 'Expired dataset removed from storage');

  // Hard purge / Right-to-be-Forgotten
  const purgeCert = await lifecycle.executeHardPurge(wsA.id, 'ds_1', 'usr_alpha');
  assert(purgeCert.datasetId === 'ds_1', 'Purge Certificate issued with dataset ID');
  assert(purgeCert.sha256Signature.startsWith('sig_'), 'Verifiable cryptographic signature attached');
  const dsPurged = await persistence.getDataset(wsA.id, 'ds_1');
  assert(dsPurged === null, 'Hard purge removes dataset from persistence');

  // ==========================================
  // 7. Background-Job Abstraction
  // ==========================================
  console.log('Testing Background-Job Abstraction...');
  const jobQueue = new LocalJobQueue();

  const baseV = createInitialVersion('clients.csv', ['id', 'name', 'phone'], [
    { id: '1', name: '  john smith  ', phone: '1234567890' },
    { id: '2', name: '  jane doe  ', phone: '9876543210' },
  ]);

  const recipe = STANDARD_RECIPES[0]; // Standard Whitespace & Trim

  const queuedJob = await jobQueue.enqueue({
    workspaceId: wsA.id,
    createdBy: 'usr_alpha',
    type: 'execute_recipe',
    params: { baseVersion: baseV, recipe },
  });

  assert(queuedJob.status === 'queued', 'Job starts in queued state');

  // Wait for worker loop to process
  await new Promise((r) => setTimeout(r, 80));

  const completedJob = await jobQueue.getJob(queuedJob.id);
  assert(completedJob?.status === 'completed', 'Job successfully processed asynchronously by worker');
  assert(completedJob?.result?.transaction?.success === true, 'Shared cleaning engine executed inside job worker');
  assert(completedJob?.result?.postValidation?.valid === true, 'Post-clean validation report generated in job');

  // Job cancellation test
  const cancelTargetJob = await jobQueue.enqueue({
    workspaceId: wsA.id,
    createdBy: 'usr_alpha',
    type: 'validate_dataset',
    params: { headers: ['id'], rows: [{ _tr_id: 'r1', id: '1' }] },
  });
  const cancelled = await jobQueue.cancelJob(cancelTargetJob.id, 'User stopped process');
  assert(cancelled === true, 'Job cancellation returned true');
  const cancelledJob = await jobQueue.getJob(cancelTargetJob.id);
  assert(cancelledJob?.status === 'cancelled', 'Job status updated to cancelled');

  // ==========================================
  // 8. Session Recovery & Checkpointing
  // ==========================================
  console.log('Testing Session Recovery...');
  const recoveryMgr = new SessionRecoveryManager();

  const checkpointBaseV = createInitialVersion('checkpoint_test.csv', ['id', 'value'], [
    { id: '1', value: 'Alpha' }
  ]);

  recoveryMgr.saveCheckpointImmediate({
    workspaceId: wsA.id,
    fileName: 'checkpoint_test.csv',
    headers: checkpointBaseV.headers,
    rows: checkpointBaseV.rows,
    currentVersion: checkpointBaseV,
    versions: [checkpointBaseV],
    hasModifications: true,
    activeTab: 'plan',
  });

  assert(recoveryMgr.hasRecoverableSession(wsA.id) === true, 'Session recovery detects valid checkpoint');
  const recovery = recoveryMgr.recoverSession(wsA.id);
  assert(recovery.recovered === true, 'Session recovery restores state cleanly');
  assert(recovery.checkpoint?.fileName === 'checkpoint_test.csv', 'Checkpoint filename matches');

  recoveryMgr.discardCheckpoint();
  assert(recoveryMgr.hasRecoverableSession(wsA.id) === false, 'Discarding checkpoint clears recovery state');

  // ==========================================
  // 9. Shared Cleaning Engine (End-to-End)
  // ==========================================
  console.log('Testing Shared Cleaning Engine End-to-End...');
  const sharedEngine = new SharedCleaningEngine();

  const engineBase = createInitialVersion('leads.csv', ['id', 'company', 'notes'], [
    { id: '1', company: '  acme corp  ', notes: 'Lead 1' },
    { id: '2', company: '  globex  ', notes: 'Lead 2' },
  ]);

  const cleanResult = await sharedEngine.executeClean({
    session: ownerSession,
    workspaceTier: 'starter',
    baseVersion: engineBase,
    recipe: STANDARD_RECIPES[0], // CRM Lead & Contact Cleanup
  });

  assert(cleanResult.success === true, 'Shared cleaning engine executed successfully');
  assert(cleanResult.newVersion?.versionNumber === 1, 'Version bumped to 1');
  assert(cleanResult.newVersion?.rows[0].company === 'Acme Corp', 'Whitespace trimmed and titlecased by shared CRM recipe');
  assert(cleanResult.postCleanValidation?.valid === true, 'Post-clean validation attached');

  // Verify RBAC in shared engine: viewer must be rejected
  let engineBlockedViewer = false;
  try {
    await sharedEngine.executeClean({
      session: viewerSession,
      baseVersion: engineBase,
      recipe: STANDARD_RECIPES[0],
    });
  } catch (err) {
    if (err instanceof AuthorizationError) engineBlockedViewer = true;
  }
  assert(engineBlockedViewer, 'Shared cleaning engine enforces RBAC and blocks viewer');

  console.log(`\n====================================================`);
  console.log(`P2A SaaS Foundation: ${passed} passed, ${failed} failed`);
  console.log(`====================================================\n`);

  return { passed, failed };
}

// Auto-run if executed directly via tsx
if (typeof process !== 'undefined' && process.argv[1]?.includes('saasFoundation.test.ts')) {
  runSaasFoundationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
