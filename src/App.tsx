import React, { useCallback, useMemo, useRef, useState, type DragEvent, useEffect } from 'react';
import Papa from 'papaparse';
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  Table2,
  Columns3,
  Rows3,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Wand2,
  Sparkles,
  Loader2,
  Smile,
  Meh,
  Frown,
  Download,
  RotateCcw,
  Hash,
  Type,
  Calendar,
  Binary,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  FileText,
  Sliders,
  Undo2,
  Layers,
  Filter,
  Mail,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  transformColumn,
  TRANSFORM_LABELS,
  type TransformRule,
} from '@/lib/transforms';
import {
  analyzeDataset,
  deduplicateRows,
  inferColumnType,
  type DatasetAnalysis,
} from '@/lib/analyzer';
import {
  generateChangeLog,
  exportChangeLogCsv,
  type ChangeRecord,
} from '@/lib/changelog';
import {
  loadSavedWorkflows,
  saveUserWorkflow,
  type CleaningStep,
  type CleaningWorkflow,
} from '@/lib/workflows';
import {
  applySchemaMapping,
  suggestSchemaMapping,
  CRM_TARGET_SCHEMA,
} from '@/lib/schemaMapping';
import { parseExcelFile, exportToExcel } from '@/lib/excel';
import {
  DESTINATION_PACKS,
  type DestinationPack,
} from '@/lib/destinationReadiness';
import type { MergeResult } from '@/lib/datasetMerge';
import {
  type DatasetRow,
  type DatasetVersion,
  type CleaningOperation,
} from '@/lib/core/types';
import { attachRowIds, stripRowIds, sanitizeHeaders } from '@/lib/core/rowId';
import {
  createInitialVersion,
  executeTransactionalRun,
  VersionManager,
} from '@/lib/core/transaction';
import {
  validateDatasetInvariants,
  validateAiCleanResponse,
  validateAiSentimentResponse,
} from '@/lib/core/invariants';
import { generateValidatedCsvExport } from '@/lib/core/exportValidator';
import { validatePostClean, type PostCleanValidationResult } from '@/lib/core/postCleanValidator';
import { executeRecipe, type CleaningRecipe } from '@/lib/core/recipes';

// Landing Page Components
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { BeforeAfter } from '@/components/landing/BeforeAfter';
import { ChallengeSection } from '@/components/landing/ChallengeSection';
import { ProductFamily } from '@/components/landing/ProductFamily';
import { CapabilitiesSection } from '@/components/landing/CapabilitiesSection';
import { NaturalLanguageSection } from '@/components/landing/NaturalLanguageSection';
import { WorkflowSteps } from '@/components/landing/WorkflowSteps';
import { UseCases } from '@/components/landing/UseCases';
import { FinalCTA } from '@/components/landing/FinalCTA';
import { Footer } from '@/components/landing/Footer';

// Workspace Components
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { UploadZone } from '@/components/workspace/UploadZone';
import { CleaningPlan } from '@/components/workspace/CleaningPlan';
import { BeforeAfterReview } from '@/components/workspace/BeforeAfterReview';
import { SchemaMappingDialog } from '@/components/workspace/SchemaMappingDialog';
import { DataHealthReport } from '@/components/workspace/DataHealthReport';
import { DestinationReadinessCard } from '@/components/workspace/DestinationReadinessCard';
import { MultiFileMergeDialog } from '@/components/workspace/MultiFileMergeDialog';
import { VersionHistoryModal } from '@/components/workspace/VersionHistoryModal';
import { SaasFoundationBar } from '@/components/workspace/SaasFoundationBar';
import { authService, type AuthSession } from '@/lib/saas/auth';
import { sessionRecoveryService, type SessionCheckpoint } from '@/lib/saas/sessionRecovery';
import { sharedCleaningEngine } from '@/lib/saas/sharedEngine';
import { sanitizeDatasetRows } from '@/lib/saas/security';
import { meteringService } from '@/lib/saas/metering';

interface CsvData {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  errors: number;
}

const ROWS_PER_PAGE = 50;
const AI_BATCH_SIZE = 100;

interface AiProgressState {
  isOpen: boolean;
  title: string;
  column?: string;
  totalRows: number;
  completedRows: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
}

const TRANSFORM_RULES: TransformRule[] = [
  'trim',
  'uppercase',
  'lowercase',
  'titlecase',
  'normalize_phone',
  'extract_zip',
  'extract_email',
  'fill_missing',
  'normalize_city',
  'normalize_country',
  'normalize_company',
];

const AI_SUGGESTIONS = [
  'Standardize all phone numbers to (XXX) XXX-XXXX format',
  'Fix common typos and spelling mistakes',
  'Normalize all dates to YYYY-MM-DD',
  'Remove extra whitespace and trim all fields',
  'Standardize state names to two-letter abbreviations',
  'Standardize city names (HYD to Hyderabad, NYC to New York)',
];

const SAMPLE_ECOMMERCE_CSV = `Order ID,Customer Name,Shipping Address,Phone,Order Total,Order Date,Status
ORD-9821,Sarah Jenkins,"123 market st ste 400, san francisco, ca 94103",555-0192,$142.50,2024-03-12,Delivered
ORD-9822,ROBERT CHEN,"450 5TH AVENUE, NEW YORK, NY 10018-2001",2125550199,$89.00,03/14/2024,Processing
ORD-9823,maria garcia,"789 Biscayne Blvd, Apt 12B, Miami, FL 33132",305-555-0143,$310.20,2024/03/15,Delivered
ORD-9824,david smith,"1600 Amphitheatre Pkwy, mountain view, CA 94043",6505550188,$45.99,2024-03-16,Shipped
ORD-9825,Emily Watson,"200 S Congress Ave # 104, Austin, Texas 78704",512-555-0177,$215.00,03-18-2024,Delivered
ORD-9826,JAMES WILSON,"100 n michigan ave, chicago, il 60601",312 555 0166,$64.25,2024/03/19,Delivered
ORD-9827,chloe dupont,"55 Wall Street, Suite 900, New York, NY 10005",212-555-0122,$520.00,2024-03-20,Processing
ORD-9828,Alex Thorne,"350 5th Ave, New York, New York 10118",212 555 0134,$112.40,2024-03-21,Shipped`;

const SAMPLE_SALES_LEADS_CSV = `Lead ID,Full Name,Company,Work Email,Phone Number,City,Lead Status
LD-101,JOHNATHAN DOE,Acme Innovations,j.doe@acme.io,1234567890,San Francisco,Qualified
LD-102,jane m. smith,Global Logistics Corp,jane@globallogistics.org,(555) 234-5678,New York,New
LD-103,ALEXANDER TURNER,turner sound studio,alex@turnersound.co,987-654-3210,Austin,Contacted
LD-104,sarah o'connor,Cyberdyne Dynamics,sarah.c@cyberdyne.net,555.123.9876,Miami,Qualified
LD-105,MICHAEL BROWN JR.,Venture Pulse LLC,mbrown@venturepulse.com,415 889 0123,Los Angeles,Proposal
LD-106,emily davis-clark,Apex Health,emily.dc@apexhealth.org,,Albany,New
LD-107,DR. ROBERT TAYLOR,Taylor Analytics,robert@tayloranalytics.com,2125550199,Washington,Qualified
LD-108,lisa a. white,Creative Minds Co,lisa@creativeminds.design,,Chicago,Contacted`;

const SAMPLE_REVIEWS_CSV = `Review ID,Customer,Product Purchased,Rating,Review Feedback,Date,Helpful Votes
REV-401,Elena Rostova,Ultra Wireless ANC Headphones,5,"Absolutely loved the quick delivery and pristine product quality! Best purchase this year.",2024-02-10,34
REV-402,Marcus Vance,Ergonomic Mesh Office Chair,1,"Customer support was painfully slow and unhelpful, extremely disappointed with the build.",2024-02-12,19
REV-403,Chloe Bennet,Smart USB-C Fast Charger,3,"The item arrived exactly as described. Nothing spectacular, but does the job well enough.",2024-02-15,8
REV-404,Devon Rivera,Mechanical Gaming Keyboard,5,"Incredible typing feel, gorgeous lighting, and super responsive switches. Highly recommend!",2024-02-18,52
REV-405,Tanya Miller,Portable Bluetooth Speaker,1,"Product broke after only 2 days of light usage. Terrible audio distortion and rattles.",2024-02-20,41
REV-406,Lucas Graham,4K 27-inch USB-C Monitor,3,"Average panel quality for the price. Decent colors but the stand feels somewhat wobbly.",2024-02-22,5
REV-407,Aisha Patel,Noise-Cancelling Earbuds,5,"Super fast shipping, crystal-clear microphone audio, and battery lasts all week!",2024-02-25,27
REV-408,Brandon Cole,Smart Fitness Tracker Band,2,"Not worth the price. Found much cheaper alternatives that track sleep far more accurately.",2024-02-28,14`;

function formatErrorMessage(raw: string): string {
  if (!raw) return 'Something went wrong';
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
    if (parsed?.message) return parsed.message;
  } catch {
    // not JSON
  }
  return raw;
}

export default function App() {
  const [currentView, setCurrentView] = useState<'landing' | 'workspace'>('landing');
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [originalRows, setOriginalRows] = useState<Record<string, string>[]>([]);
  const [beforeAnalysis, setBeforeAnalysis] = useState<DatasetAnalysis | null>(null);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [hasAppliedCleanups, setHasAppliedCleanups] = useState(false);

  // Undo History & Version Management (P0.1, P0.5)
  const versionManagerRef = useRef<VersionManager>(new VersionManager());
  const [canUndo, setCanUndo] = useState(false);

  // Saved Workflows
  const [savedWorkflows, setSavedWorkflows] = useState<CleaningWorkflow[]>([]);

  // Schema Mapping Dialog State
  const [schemaMappingOpen, setSchemaMappingOpen] = useState(false);

  // Multi-File Merge State
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeNotification, setMergeNotification] = useState<string | null>(null);

  // Issue Filtering in Data Preview
  const [activeIssueFilter, setActiveIssueFilter] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [appliedTransforms, setAppliedTransforms] = useState<
    Record<string, TransformRule[]>
  >({});
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiSelectedColumns, setAiSelectedColumns] = useState<Set<string>>(
    new Set()
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAppliedCount, setAiAppliedCount] = useState(0);
  const [sentimentLoading, setSentimentLoading] = useState<Record<string, boolean>>({});
  const [sentimentErrors, setSentimentErrors] = useState<Record<string, string | null>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [aiProgress, setAiProgress] = useState<AiProgressState>({
    isOpen: false,
    title: '',
    totalRows: 0,
    completedRows: 0,
    status: 'completed',
  });
  const cancelProcessingRef = useRef(false);

  // Load saved workflows on mount
  useEffect(() => {
    setSavedWorkflows(loadSavedWorkflows());
  }, []);

  // SaaS Foundation State (Auth, Workspace, Session Recovery)
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    authService.getCurrentSession().then(setCurrentSession);
  }, []);

  // Auto-checkpoint session on dataset changes
  useEffect(() => {
    if (csvData && versionManagerRef.current.getCurrentVersion()) {
      sessionRecoveryService.scheduleCheckpoint({
        workspaceId: currentSession?.workspaceId || 'ws_default',
        fileName: csvData.fileName,
        headers: csvData.headers,
        rows: csvData.rows as any,
        currentVersion: versionManagerRef.current.getCurrentVersion()!,
        versions: versionManagerRef.current.getAllVersions(),
        hasModifications: hasAppliedCleanups,
        activeTab: 'plan',
      });
    }
  }, [csvData, hasAppliedCleanups, currentSession]);

  const handleRestoreSessionCheckpoint = useCallback((checkpoint: SessionCheckpoint) => {
    const rawCleanRows = checkpoint.rows.map((r) => {
      const copy = { ...r };
      delete (copy as any)._tr_id;
      return copy;
    });
    setCsvData({
      fileName: checkpoint.fileName,
      fileSize: 1024 * 10,
      headers: checkpoint.headers,
      rows: checkpoint.rows,
      totalRows: checkpoint.rows.length,
      errors: 0,
    });
    setOriginalRows(rawCleanRows);
    setHasAppliedCleanups(checkpoint.hasModifications);
    if (checkpoint.currentVersion) {
      versionManagerRef.current = new VersionManager(checkpoint.currentVersion);
      if (checkpoint.versions && checkpoint.versions.length > 1) {
        checkpoint.versions.slice(1).forEach((v) => {
          versionManagerRef.current.commit(v);
        });
      }
      setCanUndo(versionManagerRef.current.canUndo());
    }
    setCurrentView('workspace');
  }, []);

  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  const handleUndo = useCallback(() => {
    if (!versionManagerRef.current.canUndo() || !csvData) return;
    const prevVersion = versionManagerRef.current.undo();
    if (prevVersion) {
      setCsvData({
        ...csvData,
        headers: prevVersion.headers,
        rows: prevVersion.rows,
        totalRows: prevVersion.rows.length,
      });
      setCanUndo(versionManagerRef.current.canUndo());
    }
  }, [csvData]);

  const handleRestoreVersion = useCallback(
    (versionNumber: number) => {
      if (!csvData) return;
      const restored = versionManagerRef.current.restoreVersion(
        versionNumber,
        `Restored from Version v${versionNumber}`
      );
      if (restored) {
        setCsvData({
          ...csvData,
          headers: restored.headers,
          rows: restored.rows,
          totalRows: restored.rows.length,
        });
        setCanUndo(versionManagerRef.current.canUndo());
        setHasAppliedCleanups(true);
      }
    },
    [csvData]
  );

  const handleCompareVersions = useCallback((v1: number, v2: number) => {
    return versionManagerRef.current.compareVersions(v1, v2);
  }, []);

  const loadSampleDataset = useCallback((sampleName: string, csvContent: string) => {
    setParseError(null);
    setIsParsing(true);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setShowBeforeAfter(false);
    setHasAppliedCleanups(false);
    setCurrentPage(1);
    setActiveIssueFilter(null);
    setMergeNotification(null);

    Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawHeaders = results.meta.fields ?? [];
        const cleanHeaders = sanitizeHeaders(rawHeaders);
        const rowsWithIds = attachRowIds(results.data);

        const initialVersion = createInitialVersion(sampleName, cleanHeaders, rowsWithIds);
        versionManagerRef.current.init(initialVersion);
        setCanUndo(false);

        setCsvData({
          fileName: sampleName,
          fileSize: csvContent.length,
          headers: cleanHeaders,
          rows: rowsWithIds,
          totalRows: rowsWithIds.length,
          errors: results.errors.length,
        });
        // Original dataset remains completely immutable (P0.1)
        setOriginalRows(initialVersion.rows.map((r) => ({ ...r })));
        setBeforeAnalysis(analyzeDataset(cleanHeaders, rowsWithIds));
        setCurrentPage(1);
        setIsParsing(false);
        setCurrentView('workspace');
      },
      error: (err: Error) => {
        setParseError(err.message);
        setIsParsing(false);
      },
    });
  }, []);

  const handleFile = useCallback((file: File) => {
    const fileNameLower = file.name.toLowerCase();
    const isExcel = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls');
    const isCsvTsv =
      fileNameLower.endsWith('.csv') ||
      fileNameLower.endsWith('.tsv') ||
      fileNameLower.endsWith('.txt');

    if (!isExcel && !isCsvTsv) {
      setParseError(
        "We couldn't read this file format. TidyRow supports .csv, .tsv, and .xlsx spreadsheets."
      );
      setCsvData(null);
      return;
    }

    setParseError(null);
    setIsParsing(true);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setShowBeforeAfter(false);
    setHasAppliedCleanups(false);
    setCurrentPage(1);
    setActiveIssueFilter(null);
    setMergeNotification(null);

    if (isExcel) {
      parseExcelFile(file)
        .then((parsed) => {
          if (parsed.rows.length === 0) {
            setParseError('The uploaded Excel sheet contains no data rows.');
            setIsParsing(false);
            return;
          }

          const cleanHeaders = sanitizeHeaders(parsed.headers);
          const rowsWithIds = attachRowIds(parsed.rows);
          const initialVersion = createInitialVersion(parsed.fileName, cleanHeaders, rowsWithIds);
          versionManagerRef.current.init(initialVersion);
          setCanUndo(false);

          setCsvData({
            fileName: parsed.fileName,
            fileSize: parsed.fileSize,
            headers: cleanHeaders,
            rows: rowsWithIds,
            totalRows: rowsWithIds.length,
            errors: 0,
          });
          setOriginalRows(initialVersion.rows.map((r) => ({ ...r })));
          setBeforeAnalysis(analyzeDataset(cleanHeaders, rowsWithIds));
          setCurrentPage(1);
          setIsParsing(false);
          setCurrentView('workspace');
        })
        .catch((err) => {
          setParseError(`Excel parse error: ${err.message}`);
          setIsParsing(false);
        });
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawHeaders = results.meta.fields ?? [];
        const cleanHeaders = sanitizeHeaders(rawHeaders);
        const allRows = results.data;

        if (allRows.length === 0) {
          setParseError('The uploaded spreadsheet contains no data rows.');
          setIsParsing(false);
          return;
        }

        const rowsWithIds = attachRowIds(allRows);
        const initialVersion = createInitialVersion(file.name, cleanHeaders, rowsWithIds);
        versionManagerRef.current.init(initialVersion);
        setCanUndo(false);

        setCsvData({
          fileName: file.name,
          fileSize: file.size,
          headers: cleanHeaders,
          rows: rowsWithIds,
          totalRows: rowsWithIds.length,
          errors: results.errors.length,
        });
        setOriginalRows(initialVersion.rows.map((r) => ({ ...r })));
        setBeforeAnalysis(analyzeDataset(cleanHeaders, rowsWithIds));
        setCurrentPage(1);
        setIsParsing(false);
        setCurrentView('workspace');
      },
      error: (err: Error) => {
        setParseError(`Parse error: ${err.message}. Please check CSV formatting.`);
        setIsParsing(false);
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setCsvData(null);
    setOriginalRows([]);
    setBeforeAnalysis(null);
    setAppliedTransforms({});
    setParseError(null);
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setShowBeforeAfter(false);
    setHasAppliedCleanups(false);
    setCanUndo(false);
    setCurrentPage(1);
    setActiveIssueFilter(null);
    setMergeNotification(null);
  }, []);

  // Standard Transform on entire dataset (P0.2, P0.5 Transactional)
  const handleApplyTransform = useCallback(
    async (columnName: string, rule: TransformRule) => {
      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      const op: CleaningOperation = {
        operationId: `op_${rule}_${Date.now()}`,
        type: rule as any,
        targetColumns: [columnName],
        reason: `Apply ${TRANSFORM_LABELS[rule] || rule} on "${columnName}"`,
        source: 'deterministic',
        confidence: 'high',
        deterministic: true,
        reviewRequired: false,
      };

      const result = await executeTransactionalRun(
        currentVersion,
        [op],
        (candidateRows) => {
          const updated = transformColumn(candidateRows, columnName, rule);
          return { rows: updated, headers: csvData.headers };
        },
        { label: `${TRANSFORM_LABELS[rule] || rule} on ${columnName}` }
      );

      if (result.success && result.newVersion) {
        versionManagerRef.current.commit(result.newVersion, result.run);
        setCanUndo(versionManagerRef.current.canUndo());
        setAppliedTransforms((prev) => {
          const current = prev[columnName] ?? [];
          const next = current.includes(rule)
            ? current.filter((r) => r !== rule)
            : [...current, rule];
          return { ...prev, [columnName]: next };
        });
        setCsvData({
          ...csvData,
          rows: result.newVersion.rows,
          totalRows: result.newVersion.rows.length,
        });
        setHasAppliedCleanups(true);
      } else {
        setParseError(result.error || 'Transformation blocked by safety check');
      }
    },
    [csvData]
  );

  // Full export CSV (P0.1: strips internal _tr_id; P1.8: validates export round-trip; P2A: formula sanitization & metering)
  const handleExportCsv = useCallback(() => {
    if (!csvData) return;
    const sanitizedRows = sanitizeDatasetRows(csvData.rows, csvData.headers);
    const { csvString, validation } = generateValidatedCsvExport(csvData.headers, sanitizedRows);
    if (!validation.isValid) {
      setParseError(`Export blocked by validation safety check: ${validation.errors.join('; ')}`);
      return;
    }
    if (currentSession) {
      meteringService.recordUsage(currentSession.workspaceId, currentSession.principal.id, 'export_count', 1).catch(() => {});
    }
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${csvData.fileName.replace(/\.[^/.]+$/, '')}_cleaned.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [csvData, currentSession]);

  // Full export Excel (.xlsx) (P0.1: strips internal _tr_id; P2A: formula sanitization & metering)
  const handleExportExcel = useCallback(() => {
    if (!csvData) return;
    const sanitizedRows = sanitizeDatasetRows(csvData.rows, csvData.headers);
    const cleanRows = stripRowIds(sanitizedRows);
    if (currentSession) {
      meteringService.recordUsage(currentSession.workspaceId, currentSession.principal.id, 'export_count', 1).catch(() => {});
    }
    exportToExcel(csvData.fileName, cleanRows);
  }, [csvData, currentSession]);

  // AI Sentiment in batches with transactional candidate buffer (P0.5, P0.8)
  const handleSentiment = useCallback(
    async (header: string) => {
      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      const total = csvData.rows.length;
      cancelProcessingRef.current = false;
      setSentimentErrors((prev) => ({ ...prev, [header]: null }));
      setSentimentLoading((prev) => ({ ...prev, [header]: true }));

      setAiProgress({
        isOpen: true,
        title: 'Analyzing Sentiment',
        column: header,
        totalRows: total,
        completedRows: 0,
        status: 'running',
      });

      // 1. Transactional candidate buffer - committed state is NOT touched during batches!
      const candidateRows: DatasetRow[] = csvData.rows.map((r) => ({ ...r } as DatasetRow));
      let processedCount = 0;

      try {
        for (let i = 0; i < total; i += AI_BATCH_SIZE) {
          if (cancelProcessingRef.current) {
            setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
            // Complete rollback - candidate copy is discarded!
            return;
          }

          const batchEnd = Math.min(i + AI_BATCH_SIZE, total);
          const batchSlice = candidateRows.slice(i, batchEnd);
          const batchValues = batchSlice.map((r) => r[header] ?? '');

          const res = await fetch('/api/ai-sentiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              column: header,
              values: batchValues,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to analyze sentiment batch');
          }

          const sentimentVal = validateAiSentimentResponse(data, batchSlice.length);
          if (!sentimentVal.valid || !sentimentVal.values) {
            throw new Error(sentimentVal.error || 'Malformed AI sentiment response format');
          }

          for (let j = 0; j < batchSlice.length; j++) {
            const rowIdx = i + j;
            candidateRows[rowIdx] = {
              ...candidateRows[rowIdx],
              [header]: sentimentVal.values[j],
            };
          }

          processedCount = batchEnd;
          setAiProgress((prev) => ({
            ...prev,
            completedRows: processedCount,
          }));
        }

        if (cancelProcessingRef.current) {
          setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
          return;
        }

        // 2. Post-execution invariant validation
        const validation = validateDatasetInvariants(currentVersion, candidateRows, csvData.headers);
        if (!validation.valid) {
          throw new Error(`Data safety invariant violation: ${validation.errors.join('; ')}`);
        }

        // 3. Commit new version transactionally
        const runResult = await executeTransactionalRun(
          currentVersion,
          [
            {
              operationId: `op_sentiment_${Date.now()}`,
              type: 'sentiment',
              targetColumns: [header],
              reason: `Analyze sentiment for "${header}"`,
              source: 'ai',
              confidence: 'high',
              deterministic: false,
              reviewRequired: false,
            },
          ],
          () => ({ rows: candidateRows, headers: csvData.headers }),
          { label: `Sentiment Analysis on ${header}` }
        );

        if (runResult.success && runResult.newVersion) {
          versionManagerRef.current.commit(runResult.newVersion, runResult.run);
          setCanUndo(versionManagerRef.current.canUndo());
          setCsvData({
            ...csvData,
            rows: runResult.newVersion.rows,
            totalRows: runResult.newVersion.rows.length,
          });
          setAppliedTransforms((prev) => ({
            ...prev,
            [header]: [...(prev[header] ?? []), 'sentiment' as TransformRule],
          }));
          setAiAppliedCount((c) => c + 1);
          setAiProgress((prev) => ({
            ...prev,
            status: 'completed',
            completedRows: total,
          }));
          setHasAppliedCleanups(true);
        } else {
          throw new Error(runResult.error || 'Failed to commit transactional sentiment run');
        }
      } catch (err: any) {
        const errorMsg = formatErrorMessage(err?.message || 'Sentiment analysis failed');
        setSentimentErrors((prev) => ({
          ...prev,
          [header]: errorMsg,
        }));
        setAiProgress((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: errorMsg,
        }));
      } finally {
        setSentimentLoading((prev) => ({ ...prev, [header]: false }));
      }
    },
    [csvData]
  );

  const openAiDialog = useCallback(() => {
    if (csvData) {
      setAiSelectedColumns(new Set(csvData.headers));
    }
    setAiError(null);
    setAiDialogOpen(true);
  }, [csvData]);

  const toggleColumnSelection = useCallback((header: string) => {
    setAiSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(header)) {
        next.delete(header);
      } else {
        next.add(header);
      }
      return next;
    });
  }, []);

  // AI Clean with transactional candidate buffer (P0.3, P0.4, P0.5)
  const handleAiClean = useCallback(async () => {
    if (!csvData || !aiInstruction.trim() || aiSelectedColumns.size === 0) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const total = csvData.rows.length;
    const selectedCols = Array.from(aiSelectedColumns);

    setAiDialogOpen(false);
    cancelProcessingRef.current = false;

    setAiProgress({
      isOpen: true,
      title: 'AI Cleaning Dataset',
      column: `${selectedCols.length} columns selected`,
      totalRows: total,
      completedRows: 0,
      status: 'running',
    });

    // 1. Transactional candidate buffer - committed state is NOT touched during batches!
    const candidateRows: DatasetRow[] = csvData.rows.map((r) => ({ ...r } as DatasetRow));
    let processedCount = 0;

    try {
      for (let i = 0; i < total; i += AI_BATCH_SIZE) {
        if (cancelProcessingRef.current) {
          setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
          // Discard candidate, do not commit
          return;
        }

        const batchEnd = Math.min(i + AI_BATCH_SIZE, total);
        const batchSlice = candidateRows.slice(i, batchEnd);

        const columns = selectedCols.map((header) => ({
          header,
          values: batchSlice.map((r) => r[header] ?? ''),
        }));

        const res = await fetch('/api/ai-clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columns,
            instruction: aiInstruction.trim(),
          }),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'AI cleaning failed');
        }

        const aiVal = validateAiCleanResponse(result, selectedCols, batchSlice.length);
        if (!aiVal.valid || !aiVal.cleanedMap) {
          throw new Error(aiVal.error || 'Malformed AI clean response format');
        }

        for (let j = 0; j < batchSlice.length; j++) {
          const rowIdx = i + j;
          const updated = { ...candidateRows[rowIdx] };
          for (const colHeader of selectedCols) {
            updated[colHeader] = aiVal.cleanedMap[colHeader][j];
          }
          candidateRows[rowIdx] = updated;
        }

        processedCount = batchEnd;
        setAiProgress((prev) => ({
          ...prev,
          completedRows: processedCount,
        }));
      }

      if (cancelProcessingRef.current) {
        setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
        return;
      }

      // 2. Invariant Validation before commit
      const validation = validateDatasetInvariants(currentVersion, candidateRows, csvData.headers);
      if (!validation.valid) {
        throw new Error(`Data safety invariant violation: ${validation.errors.join('; ')}`);
      }

      // 3. Commit new version transactionally
      const runResult = await executeTransactionalRun(
        currentVersion,
        [
          {
            operationId: `op_ai_${Date.now()}`,
            type: 'ai_clean',
            targetColumns: selectedCols,
            reason: aiInstruction.trim(),
            source: 'ai',
            confidence: 'high',
            deterministic: false,
            reviewRequired: false,
          },
        ],
        () => ({ rows: candidateRows, headers: csvData.headers }),
        { label: `AI Clean: ${aiInstruction.trim().slice(0, 30)}` }
      );

      if (runResult.success && runResult.newVersion) {
        versionManagerRef.current.commit(runResult.newVersion, runResult.run);
        setCanUndo(versionManagerRef.current.canUndo());
        setCsvData({
          ...csvData,
          rows: runResult.newVersion.rows,
          totalRows: runResult.newVersion.rows.length,
        });
        setAiAppliedCount((c) => c + 1);
        setAiProgress((prev) => ({
          ...prev,
          status: 'completed',
          completedRows: total,
        }));
        setHasAppliedCleanups(true);
      } else {
        throw new Error(runResult.error || 'Failed to commit transactional AI clean run');
      }
    } catch (err: any) {
      const errorMsg = formatErrorMessage(err?.message || 'AI cleaning failed');
      setAiError(errorMsg);
      setAiProgress((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: errorMsg,
      }));
    }
  }, [csvData, aiInstruction, aiSelectedColumns]);

  // Live Dataset Analysis via Data Quality Engine 2.0
  const analysis = useMemo<DatasetAnalysis>(() => {
    if (!csvData) {
      return {
        totalRows: 0,
        totalColumns: 0,
        duplicateRows: 0,
        normalizedDuplicateRows: 0,
        emptyCells: 0,
        explicitPlaceholderCells: 0,
        inconsistentCaseCount: 0,
        brokenFormatsCount: 0,
        whitespaceIssuesCount: 0,
        qualityScore: 100,
        statusLabel: 'No data',
        statusTone: 'clean',
        dimensions: {
          completeness: 100,
          validity: 100,
          consistency: 100,
          uniqueness: 100,
          overall: 100,
        },
        columnProfiles: [],
        issues: [],
        flags: [],
        fuzzyDuplicates: [],
      };
    }
    return analyzeDataset(csvData.headers, csvData.rows);
  }, [csvData?.headers, csvData?.rows]);

  // Generate real ChangeLog between original and current
  const changeLog = useMemo<ChangeRecord[]>(() => {
    if (!csvData || originalRows.length === 0) return [];
    return generateChangeLog(csvData.headers, originalRows, csvData.rows, 'TidyRow Standard Cleanup');
  }, [csvData?.headers, csvData?.rows, originalRows]);

  // Generate Post-Clean Invariant & Validation Report (P1.1)
  const postCleanValidation = useMemo<PostCleanValidationResult | null>(() => {
    if (!csvData || originalRows.length === 0) return null;
    const v0 = versionManagerRef.current.getVersion(0);
    const vCur = versionManagerRef.current.getCurrentVersion();
    if (!v0 || !vCur) return null;
    return validatePostClean(v0, vCur, []);
  }, [csvData?.rows, csvData?.headers, originalRows]);

  // Live Clean Actions (P0.5 Transactional)
  const handleRemoveDuplicates = useCallback(async () => {
    if (!csvData) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const result = await executeTransactionalRun(
      currentVersion,
      [
        {
          operationId: `op_dedup_${Date.now()}`,
          type: 'deduplicate',
          targetColumns: csvData.headers,
          reason: 'Remove duplicate rows',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
      ],
      (candidateRows) => {
        const uniqueRows = deduplicateRows(csvData.headers, candidateRows);
        return { rows: uniqueRows, headers: csvData.headers };
      },
      { label: 'Remove Duplicate Rows' }
    );

    if (result.success && result.newVersion) {
      versionManagerRef.current.commit(result.newVersion, result.run);
      setCanUndo(versionManagerRef.current.canUndo());
      setCsvData({
        ...csvData,
        rows: result.newVersion.rows,
        totalRows: result.newVersion.rows.length,
      });
      setHasAppliedCleanups(true);
    } else {
      setParseError(result.error || 'Deduplication blocked by safety check');
    }
  }, [csvData]);

  const handleStandardizeTitleCase = useCallback(async () => {
    if (!csvData) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const textHeaders = csvData.headers.filter(
      (h) => !/(id|date|phone|total|price|rating|votes|zip|code)/i.test(h)
    );

    const ops: CleaningOperation[] = textHeaders.map((h) => ({
      operationId: `op_titlecase_${h}_${Date.now()}`,
      type: 'titlecase',
      targetColumns: [h],
      reason: `Standardize ${h} to Title Case`,
      source: 'deterministic',
      confidence: 'high',
      deterministic: true,
      reviewRequired: false,
    }));

    const result = await executeTransactionalRun(
      currentVersion,
      ops,
      (candidateRows) => {
        let updated = candidateRows;
        for (const h of textHeaders) {
          updated = transformColumn(updated, h, 'titlecase');
        }
        return { rows: updated, headers: csvData.headers };
      },
      { label: 'Standardize Title Case' }
    );

    if (result.success && result.newVersion) {
      versionManagerRef.current.commit(result.newVersion, result.run);
      setCanUndo(versionManagerRef.current.canUndo());
      setCsvData({
        ...csvData,
        rows: result.newVersion.rows,
        totalRows: result.newVersion.rows.length,
      });
      setHasAppliedCleanups(true);
    } else {
      setParseError(result.error || 'Title casing blocked by safety check');
    }
  }, [csvData]);

  const handleTrimWhitespace = useCallback(async () => {
    if (!csvData) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const result = await executeTransactionalRun(
      currentVersion,
      [
        {
          operationId: `op_trim_${Date.now()}`,
          type: 'trim',
          targetColumns: csvData.headers,
          reason: 'Trim whitespace across all columns',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
      ],
      (candidateRows) => {
        let updated = candidateRows;
        for (const h of csvData.headers) {
          updated = transformColumn(updated, h, 'trim');
        }
        return { rows: updated, headers: csvData.headers };
      },
      { label: 'Trim Whitespace' }
    );

    if (result.success && result.newVersion) {
      versionManagerRef.current.commit(result.newVersion, result.run);
      setCanUndo(versionManagerRef.current.canUndo());
      setCsvData({
        ...csvData,
        rows: result.newVersion.rows,
        totalRows: result.newVersion.rows.length,
      });
      setHasAppliedCleanups(true);
    } else {
      setParseError(result.error || 'Trimming blocked by safety check');
    }
  }, [csvData]);

  const handleStandardizePlaceholders = useCallback(async () => {
    if (!csvData) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const result = await executeTransactionalRun(
      currentVersion,
      [
        {
          operationId: `op_fill_${Date.now()}`,
          type: 'fill_missing',
          targetColumns: csvData.headers,
          reason: 'Fill missing/placeholder values with "—"',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
      ],
      (candidateRows) => {
        const updated = candidateRows.map((row) => {
          const rowCopy = { ...row };
          for (const h of csvData.headers) {
            const val = (rowCopy[h] ?? '').trim().toLowerCase();
            if (val === 'null' || val === 'na' || val === 'n/a' || val === '-') {
              rowCopy[h] = '—';
            }
          }
          return rowCopy;
        });
        return { rows: updated, headers: csvData.headers };
      },
      { label: 'Standardize Placeholders' }
    );

    if (result.success && result.newVersion) {
      versionManagerRef.current.commit(result.newVersion, result.run);
      setCanUndo(versionManagerRef.current.canUndo());
      setCsvData({
        ...csvData,
        rows: result.newVersion.rows,
        totalRows: result.newVersion.rows.length,
      });
      setHasAppliedCleanups(true);
    } else {
      setParseError(result.error || 'Placeholder standardization blocked by safety check');
    }
  }, [csvData]);

  const handleApplyAllRecommended = useCallback(async () => {
    if (!csvData) return;
    const currentVersion =
      versionManagerRef.current.getCurrentVersion() ||
      createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

    const textHeaders = csvData.headers.filter(
      (h) => !/(id|date|phone|total|price|rating|votes|zip|code)/i.test(h)
    );

    const result = await executeTransactionalRun(
      currentVersion,
      [
        {
          operationId: `op_rec_trim_${Date.now()}`,
          type: 'trim',
          targetColumns: csvData.headers,
          reason: 'Trim whitespace across all columns',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
        {
          operationId: `op_rec_dedup_${Date.now()}`,
          type: 'deduplicate',
          targetColumns: csvData.headers,
          reason: 'Remove duplicate rows',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
        {
          operationId: `op_rec_titlecase_${Date.now()}`,
          type: 'titlecase',
          targetColumns: textHeaders,
          reason: 'Standardize text columns to Title Case',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        },
      ],
      (candidateRows) => {
        // 1. Trim whitespace
        let processedRows = candidateRows.map((row) => {
          const updated = { ...row };
          for (const h of csvData.headers) {
            updated[h] = (updated[h] ?? '').trim().replace(/\s+/g, ' ');
          }
          return updated;
        });

        // 2. Deduplicate exact and normalized duplicate rows (preserves stable _tr_id)
        processedRows = deduplicateRows(csvData.headers, processedRows);

        // 3. Standardize Title Case on text columns
        for (const h of textHeaders) {
          processedRows = transformColumn(processedRows, h, 'titlecase');
        }

        // 4. Standardize canonical city/state variations
        for (const h of csvData.headers) {
          if (/(city|location|town)/i.test(h)) {
            processedRows = transformColumn(processedRows, h, 'normalize_city');
          } else if (/(country|nation)/i.test(h)) {
            processedRows = transformColumn(processedRows, h, 'normalize_country');
          }
        }

        return { rows: processedRows, headers: csvData.headers };
      },
      { label: 'Apply Recommended Cleanups' }
    );

    if (result.success && result.newVersion) {
      versionManagerRef.current.commit(result.newVersion, result.run);
      setCanUndo(versionManagerRef.current.canUndo());
      setCsvData({
        ...csvData,
        rows: result.newVersion.rows,
        totalRows: result.newVersion.rows.length,
      });
      setHasAppliedCleanups(true);
      setShowBeforeAfter(true);
    } else {
      setParseError(result.error || 'Cleanups blocked by safety check');
    }
  }, [csvData]);

  // Execute an arbitrary structured plan (P0.3, P0.5 Transactional)
  const handleExecutePlan = useCallback(
    async (steps: CleaningStep[]) => {
      if (!csvData || steps.length === 0) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      const ops: CleaningOperation[] = steps
        .filter((s) => s.enabled)
        .map((s) => ({
          operationId: s.id,
          type: s.action as any,
          targetColumns: s.columns || (s.column ? [s.column] : []),
          reason: s.title,
          source: s.deterministic ? 'deterministic' : 'ai',
          confidence: s.confidence || 'high',
          deterministic: s.deterministic ?? true,
          reviewRequired: false,
        }));

      const result = await executeTransactionalRun(
        currentVersion,
        ops,
        (candidateRows) => {
          let workingRows = candidateRows;

          for (const step of steps) {
            if (!step.enabled) continue;

            switch (step.action) {
              case 'trim':
                for (const h of csvData.headers) {
                  workingRows = transformColumn(workingRows, h, 'trim');
                }
                break;
              case 'deduplicate':
                workingRows = deduplicateRows(csvData.headers, workingRows);
                break;
              case 'titlecase':
                if (step.columns && step.columns.length > 0) {
                  for (const col of step.columns) {
                    workingRows = transformColumn(workingRows, col, 'titlecase');
                  }
                } else if (step.column) {
                  workingRows = transformColumn(workingRows, step.column, 'titlecase');
                } else {
                  for (const h of csvData.headers) {
                    if (!/(id|date|phone|total|price|zip|code)/i.test(h)) {
                      workingRows = transformColumn(workingRows, h, 'titlecase');
                    }
                  }
                }
                break;
              case 'normalize_phone':
                const phoneCols =
                  step.columns ||
                  (step.column ? [step.column] : csvData.headers.filter((h) => /(phone|tel|mobile)/i.test(h)));
                for (const col of phoneCols) {
                  workingRows = transformColumn(workingRows, col, 'normalize_phone');
                }
                break;
              case 'extract_zip':
                const addrCols =
                  step.columns ||
                  (step.column ? [step.column] : csvData.headers.filter((h) => /(addr|street)/i.test(h)));
                for (const col of addrCols) {
                  workingRows = transformColumn(workingRows, col, 'extract_zip');
                }
                break;
              case 'fill_missing':
                workingRows = workingRows.map((row) => {
                  const updated = { ...row };
                  for (const h of csvData.headers) {
                    const val = (updated[h] ?? '').trim().toLowerCase();
                    if (val === 'null' || val === 'na' || val === 'n/a' || val === '-') {
                      updated[h] = '—';
                    }
                  }
                  return updated;
                });
                break;
              default:
                break;
            }
          }
          return { rows: workingRows, headers: csvData.headers };
        },
        { label: 'Execute Cleaning Plan' }
      );

      if (result.success && result.newVersion) {
        versionManagerRef.current.commit(result.newVersion, result.run);
        setCanUndo(versionManagerRef.current.canUndo());
        setCsvData({
          ...csvData,
          rows: result.newVersion.rows,
          totalRows: result.newVersion.rows.length,
        });
        setHasAppliedCleanups(true);
        setShowBeforeAfter(true);
      } else {
        setParseError(result.error || 'Plan execution blocked by safety check');
      }
    },
    [csvData]
  );

  // Apply a Repeatable Workflow
  const handleApplyWorkflow = useCallback(
    (workflow: CleaningWorkflow) => {
      handleExecutePlan(workflow.steps);
    },
    [handleExecutePlan]
  );

  // Apply a Standard Quality Recipe (Deterministic P1.5)
  const handleApplyRecipe = useCallback(
    async (recipe: CleaningRecipe) => {
      if (currentSession?.principal.role === 'viewer') {
        setParseError('Permission Denied: Viewer role is read-only and cannot mutate data.');
        return;
      }

      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      try {
        const cleanResult = await sharedCleaningEngine.executeClean({
          session: currentSession || (await authService.getCurrentSession())!,
          baseVersion: currentVersion,
          recipe,
          options: { sanitizeFormulas: true, updateSessionCheckpoint: true },
        });

        if (cleanResult.success && cleanResult.newVersion) {
          versionManagerRef.current.commit(cleanResult.newVersion, cleanResult.transaction.run);
          setCanUndo(versionManagerRef.current.canUndo());
          setCsvData({
            ...csvData,
            headers: cleanResult.newVersion.headers,
            rows: cleanResult.newVersion.rows,
            totalRows: cleanResult.newVersion.rows.length,
          });
          setHasAppliedCleanups(true);
          setShowBeforeAfter(true);
        } else {
          setParseError(cleanResult.error || `Recipe "${recipe.name}" blocked by safety check`);
        }
      } catch (err: any) {
        setParseError(err?.message || `Failed to execute recipe "${recipe.name}"`);
      }
    },
    [csvData, currentSession]
  );

  // Save current plan as reusable workflow
  const handleSaveCurrentAsWorkflow = useCallback(
    (name: string, description: string, steps: CleaningStep[]) => {
      saveUserWorkflow({
        name,
        description,
        steps,
        targetDomain: 'general',
      });
      setSavedWorkflows(loadSavedWorkflows());
    },
    []
  );

  // Apply Schema Mapping (P0.9 Collision Protected)
  const handleApplySchemaMapping = useCallback(
    async (mapping: Record<string, string>) => {
      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      try {
        const { newHeaders, newRows } = applySchemaMapping(csvData.rows, mapping);

        const op: CleaningOperation = {
          operationId: `op_schema_${Date.now()}`,
          type: 'schema_mapping',
          targetColumns: newHeaders,
          reason: 'Apply destination schema mapping',
          source: 'deterministic',
          confidence: 'high',
          deterministic: true,
          reviewRequired: false,
        };

        const result = await executeTransactionalRun(
          currentVersion,
          [op],
          () => ({ rows: newRows as DatasetRow[], headers: newHeaders }),
          { label: 'Destination Schema Mapping' }
        );

        if (result.success && result.newVersion) {
          versionManagerRef.current.commit(result.newVersion, result.run);
          setCanUndo(versionManagerRef.current.canUndo());
          setCsvData({
            ...csvData,
            headers: result.newVersion.headers,
            rows: result.newVersion.rows,
            totalRows: result.newVersion.rows.length,
          });
          setHasAppliedCleanups(true);
          setShowBeforeAfter(true);
        } else {
          setParseError(result.error || 'Schema mapping blocked by collision check');
        }
      } catch (err: any) {
        setParseError(err.message || 'Schema mapping collision');
      }
    },
    [csvData]
  );

  // Apply Destination Readiness Fixes
  const handleApplyDestinationFixes = useCallback(
    async (pack: DestinationPack, mapping: Record<string, string>, steps: CleaningStep[]) => {
      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      try {
        const { newHeaders, newRows } = applySchemaMapping(csvData.rows, mapping);

        const ops: CleaningOperation[] = [
          {
            operationId: `op_dest_schema_${Date.now()}`,
            type: 'schema_mapping',
            targetColumns: newHeaders,
            reason: `Map columns to ${pack.name}`,
            source: 'deterministic',
            confidence: 'high',
            deterministic: true,
            reviewRequired: false,
          },
          ...steps.map((s) => ({
            operationId: s.id,
            type: s.action as any,
            targetColumns: s.columns || (s.column ? [s.column] : []),
            reason: s.title,
            source: 'deterministic' as const,
            confidence: 'high' as const,
            deterministic: true,
            reviewRequired: false,
          })),
        ];

        const result = await executeTransactionalRun(
          currentVersion,
          ops,
          (candidateRows) => {
            let workingRows: DatasetRow[] = newRows as DatasetRow[];

            for (const step of steps) {
              if (!step.enabled) continue;
              if (step.action === 'trim') {
                for (const h of newHeaders) {
                  workingRows = transformColumn(workingRows, h, 'trim');
                }
              } else if (step.action === 'deduplicate') {
                workingRows = deduplicateRows(newHeaders, workingRows);
              } else if (step.action === 'titlecase') {
                for (const h of newHeaders) {
                  if (/(name|firstname|lastname|fullname|title)/i.test(h)) {
                    workingRows = transformColumn(workingRows, h, 'titlecase');
                  }
                }
              } else if (step.action === 'normalize_phone') {
                for (const h of newHeaders) {
                  if (/(phone|mobile|tel)/i.test(h)) {
                    workingRows = transformColumn(workingRows, h, 'normalize_phone');
                  }
                }
              }
            }
            return { rows: workingRows, headers: newHeaders };
          },
          { label: `Prepare for ${pack.systemName}` }
        );

        if (result.success && result.newVersion) {
          versionManagerRef.current.commit(result.newVersion, result.run);
          setCanUndo(versionManagerRef.current.canUndo());
          setCsvData({
            ...csvData,
            headers: result.newVersion.headers,
            rows: result.newVersion.rows,
            totalRows: result.newVersion.rows.length,
          });
          setHasAppliedCleanups(true);
          setShowBeforeAfter(true);
        } else {
          setParseError(result.error || 'Destination readiness blocked by collision or safety violation');
        }
      } catch (err: any) {
        setParseError(err.message || 'Destination preparation failed');
      }
    },
    [csvData]
  );

  // Multi-File Merge Complete
  const handleMergeComplete = useCallback(
    (result: MergeResult, secondaryFileName: string) => {
      if (!csvData) return;
      const currentVersion =
        versionManagerRef.current.getCurrentVersion() ||
        createInitialVersion(csvData.fileName, csvData.headers, csvData.rows);

      const mergedRowsWithIds = attachRowIds(result.mergedRows);
      const newVersionNumber = currentVersion.versionNumber + 1;
      const newVersion: DatasetVersion = {
        versionId: `v${newVersionNumber}_${Date.now()}`,
        versionNumber: newVersionNumber,
        fileName: csvData.fileName,
        headers: result.mergedHeaders,
        rows: mergedRowsWithIds,
        timestamp: new Date().toISOString(),
        label: `Merged with ${secondaryFileName}`,
      };

      versionManagerRef.current.commit(newVersion);
      setCanUndo(versionManagerRef.current.canUndo());

      setCsvData({
        ...csvData,
        headers: result.mergedHeaders,
        rows: mergedRowsWithIds,
        totalRows: mergedRowsWithIds.length,
      });

      setMergeNotification(
        `Merged "${secondaryFileName}": ${result.stats.matchedCount} records matched, ${result.stats.secondaryOnlyCount} new records appended, ${result.stats.conflictCount} conflicts resolved.`
      );
      setHasAppliedCleanups(true);
    },
    [csvData]
  );

  const totalTransforms = useMemo(() => {
    return Object.values(appliedTransforms).reduce(
      (sum, rules) => sum + rules.length,
      0
    );
  }, [appliedTransforms]);

  // Issue filter row calculations
  const issueFilteredIndices = useMemo(() => {
    if (!activeIssueFilter || !analysis) return null;
    const issue = analysis.issues.find((i) => i.id === activeIssueFilter);
    return issue?.affectedRowIndices || null;
  }, [activeIssueFilter, analysis]);

  const displayedRows = useMemo(() => {
    if (!csvData) return [];
    if (issueFilteredIndices) {
      return issueFilteredIndices.map((idx) => csvData.rows[idx]).filter(Boolean);
    }
    return csvData.rows;
  }, [csvData, issueFilteredIndices]);

  const totalPages = Math.max(1, Math.ceil(displayedRows.length / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, displayedRows.length);

  const visibleRows = useMemo(() => {
    return displayedRows.slice(startIndex, endIndex);
  }, [displayedRows, startIndex, endIndex]);

  // Calculate workflow step
  const activeStep = useMemo<'upload' | 'understand' | 'clean' | 'verify'>(() => {
    if (!csvData) return 'upload';
    if (showBeforeAfter) return 'verify';
    if (hasAppliedCleanups || Object.keys(appliedTransforms).length > 0 || aiAppliedCount > 0) return 'clean';
    return 'understand';
  }, [csvData, showBeforeAfter, hasAppliedCleanups, appliedTransforms, aiAppliedCount]);

  const hasModifications = useMemo(() => {
    if (!csvData || originalRows.length === 0) return false;
    if (csvData.rows.length !== originalRows.length) return true;
    if (hasAppliedCleanups || totalTransforms > 0 || aiAppliedCount > 0 || canUndo) return true;
    return false;
  }, [csvData, originalRows, hasAppliedCleanups, totalTransforms, aiAppliedCount, canUndo]);

  // Render Landing View
  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-[#F7F5EF] text-[#202522] flex flex-col font-sans">
        <Navbar onOpenApp={() => setCurrentView('workspace')} />
        <main className="flex-1">
          <Hero onOpenApp={() => setCurrentView('workspace')} />
          <BeforeAfter />
          <ChallengeSection />
          <ProductFamily
            onOpenApp={(mode) => {
              setCurrentView('workspace');
              if (mode === 'transform') {
                openAiDialog();
              }
            }}
          />
          <CapabilitiesSection />
          <NaturalLanguageSection
            onOpenAppWithInstruction={(inst) => {
              setCurrentView('workspace');
              setAiInstruction(inst);
              setAiDialogOpen(true);
            }}
          />
          <WorkflowSteps />
          <UseCases />
          <FinalCTA onOpenApp={() => setCurrentView('workspace')} />
        </main>
        <Footer onOpenApp={() => setCurrentView('workspace')} />
      </div>
    );
  }

  // Render Workspace View
  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#202522] flex flex-col font-sans">
      <WorkspaceHeader
        hasData={!!csvData}
        activeStep={activeStep}
        onNavigateHome={() => setCurrentView('landing')}
        onReset={handleRemoveFile}
        onUndo={handleUndo}
        canUndo={canUndo}
        onExport={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportChangeLog={() => {
          if (csvData) exportChangeLogCsv(csvData.fileName, changeLog);
        }}
        onOpenAiClean={openAiDialog}
        onOpenMerge={() => setMergeDialogOpen(true)}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        showBeforeAfter={showBeforeAfter}
        onToggleBeforeAfter={() => setShowBeforeAfter((prev) => !prev)}
        hasModifications={hasModifications}
      />

      <SaasFoundationBar
        currentSession={currentSession}
        onSessionChange={setCurrentSession}
        onRestoreSessionCheckpoint={handleRestoreSessionCheckpoint}
        headers={csvData?.headers}
        rows={csvData?.rows}
      />

      <main className="mx-auto max-w-[1720px] w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        {!csvData ? (
          /* Step 01: Upload Zone with samples */
          <UploadZone
            isDragging={isDragging}
            isParsing={isParsing}
            parseError={parseError}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileSelect={handleFile}
            onLoadSample={loadSampleDataset}
            sampleEcommerce={SAMPLE_ECOMMERCE_CSV}
            sampleSalesLeads={SAMPLE_SALES_LEADS_CSV}
            sampleReviews={SAMPLE_REVIEWS_CSV}
          />
        ) : (
          /* Data Loaded State: Steps 02 to 05 */
          <div className="animate-fade-in space-y-6">
            {/* Merge notification banner */}
            {mergeNotification && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#2F8F6B]" />
                  <span>{mergeNotification}</span>
                </div>
                <button
                  onClick={() => setMergeNotification(null)}
                  className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Primary Differentiator: Destination Readiness & Schema Packs */}
            <DestinationReadinessCard
              headers={csvData.headers}
              rows={csvData.rows}
              fileName={csvData.fileName}
              onApplyDestinationFixes={handleApplyDestinationFixes}
            />

            {/* Core Value: Data Quality Engine 2.0 & Health Report */}
            <DataHealthReport
              analysis={analysis}
              totalRows={csvData.rows.length}
              isSampled={csvData.rows.length > 5000}
              sampleSize={Math.min(csvData.rows.length, 5000)}
              onFilterByIssue={(issueId) => {
                setActiveIssueFilter(issueId);
                setCurrentPage(1);
              }}
              activeIssueFilter={activeIssueFilter}
              onClearIssueFilter={() => {
                setActiveIssueFilter(null);
                setCurrentPage(1);
              }}
            />

            {/* Live Issue Detection & Transparent Cleaning Plan */}
            <CleaningPlan
              fileName={csvData.fileName}
              analysis={analysis}
              headers={csvData.headers}
              rows={csvData.rows}
              onApplyAllRecommended={handleApplyAllRecommended}
              onRemoveDuplicates={handleRemoveDuplicates}
              onStandardizeTitleCase={handleStandardizeTitleCase}
              onTrimWhitespace={handleTrimWhitespace}
              onStandardizePlaceholders={handleStandardizePlaceholders}
              onOpenAiClean={openAiDialog}
              onOpenSchemaMapping={() => setSchemaMappingOpen(true)}
              onExecutePlan={handleExecutePlan}
              savedWorkflows={savedWorkflows}
              onApplyWorkflow={handleApplyWorkflow}
              onApplyRecipe={handleApplyRecipe}
              onSaveCurrentAsWorkflow={handleSaveCurrentAsWorkflow}
              hasAppliedCleanups={hasAppliedCleanups}
            />

            {/* Live Before/After Review Diff & Post-Clean Validation */}
            {showBeforeAfter && originalRows.length > 0 && (
              <BeforeAfterReview
                fileName={csvData.fileName}
                headers={csvData.headers}
                originalRows={originalRows}
                currentRows={csvData.rows}
                beforeAnalysis={beforeAnalysis || undefined}
                afterAnalysis={analysis}
                changeLog={changeLog}
                postCleanValidation={postCleanValidation}
                onUndo={handleUndo}
                onReset={handleRemoveFile}
                onOpenVersionHistory={() => setVersionHistoryOpen(true)}
                onClose={() => setShowBeforeAfter(false)}
                onExport={handleExportCsv}
                onExportExcel={handleExportExcel}
              />
            )}

            {/* Data Table with Inline Types & Column Transforms */}
            <div className="rounded-2xl border border-[#E5E5DE] bg-white p-4 sm:p-5 shadow-xs">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#2F8F6B]/10 text-[#2F8F6B]">
                    <Table2 className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-[#202522] uppercase tracking-wide font-sans">
                    Data Preview
                  </h3>
                  <span className="font-mono text-xs text-[#202522]/60">
                    ({csvData.rows.length.toLocaleString()} total rows in memory)
                  </span>
                  {activeIssueFilter && (
                    <span className="font-mono text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                      <Filter className="h-2.5 w-2.5" /> Filtering {displayedRows.length} affected rows
                    </span>
                  )}
                  {canUndo && (
                    <span className="font-mono text-[10px] text-[#2F8F6B] bg-[#2F8F6B]/10 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                      <Undo2 className="h-2.5 w-2.5" /> Version undo available
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs font-sans text-[#202522]/70">
                  <span>
                    Showing rows <span className="font-semibold text-[#202522] font-mono">{startIndex + 1}</span>–
                    <span className="font-semibold text-[#202522] font-mono">{endIndex}</span> of{' '}
                    <span className="font-semibold text-[#202522] font-mono">{displayedRows.length.toLocaleString()}</span>
                  </span>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-hidden rounded-xl border border-[#E5E5DE] bg-white">
                <div className="h-[calc(100vh-320px)] min-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-[#F7F5EF] border-b border-[#E5E5DE] shadow-xs">
                      <TableRow className="hover:bg-transparent border-b border-[#E5E5DE]">
                        <TableHead className="w-12 text-center text-[11px] font-mono font-semibold text-[#202522]/60 border-r border-[#E5E5DE] bg-[#F7F5EF] select-none py-2.5">
                          #
                        </TableHead>
                        {csvData.headers.map((header, i) => {
                          const transforms = appliedTransforms[header] ?? [];
                          const colProfile = analysis.columnProfiles.find((c) => c.columnName === header);
                          const colType = colProfile?.inferredType ?? 'text';

                          return (
                            <TableHead
                              key={header}
                              className="whitespace-nowrap text-xs font-semibold p-0 border-r border-[#E5E5DE] last:border-r-0"
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="group/header flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-[#EFECE3] cursor-pointer">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[#202522] font-semibold truncate font-sans">
                                        {header}
                                      </span>
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-wider text-[#202522]/50 select-none">
                                        {colType === 'number' && <Hash className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'id' && <Hash className="h-2.5 w-2.5 text-amber-600 shrink-0" />}
                                        {colType === 'text' && <Type className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'date' && <Calendar className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'boolean' && <Binary className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'email' && <Mail className="h-2.5 w-2.5 shrink-0 text-[#4D7CFE]" />}
                                        {colType === 'phone' && <Phone className="h-2.5 w-2.5 shrink-0 text-[#2F8F6B]" />}
                                        <span>{colType}</span>
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {transforms.length > 0 && (
                                        <span className="flex items-center gap-0.5 rounded bg-[#2F8F6B]/15 px-1 py-0.5 text-[10px] font-mono font-semibold text-[#2F8F6B]">
                                          <Wand2 className="h-2.5 w-2.5" />
                                          {transforms.length}
                                        </span>
                                      )}
                                      <ChevronDown className="h-3.5 w-3.5 text-[#202522]/40 transition-transform group-data-[state=open]/header:rotate-180" />
                                    </div>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-56 bg-white border border-[#E5E5DE] shadow-lg z-50">
                                  <DropdownMenuLabel className="text-xs font-mono text-[#202522]/60">
                                    Transform column
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator className="bg-[#E5E5DE]" />
                                  {TRANSFORM_RULES.map((rule) => {
                                    const isApplied = transforms.includes(rule);
                                    return (
                                      <DropdownMenuItem
                                        key={rule}
                                        onClick={() => handleApplyTransform(header, rule)}
                                        className="gap-2 text-xs font-sans cursor-pointer hover:bg-[#F7F5EF]"
                                      >
                                        <span
                                          className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded',
                                            isApplied
                                              ? 'bg-[#2F8F6B]/15 text-[#2F8F6B]'
                                              : 'text-[#202522]/30'
                                          )}
                                        >
                                          {isApplied && (
                                            <CheckCircle2 className="h-3 w-3" />
                                          )}
                                        </span>
                                        {TRANSFORM_LABELS[rule]}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                  <DropdownMenuSeparator className="bg-[#E5E5DE]" />
                                  <DropdownMenuLabel className="text-xs font-mono text-[#4D7CFE]">
                                    AI Recipe
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => handleSentiment(header)}
                                    disabled={sentimentLoading[header]}
                                    className="gap-2 text-xs font-sans cursor-pointer hover:bg-[#F7F5EF]"
                                  >
                                    {sentimentLoading[header] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4D7CFE]" />
                                    ) : (
                                      <span className="flex items-center gap-0.5">
                                        <Smile className="h-3 w-3 text-emerald-600" />
                                        <Meh className="h-3 w-3 text-slate-500" />
                                        <Frown className="h-3 w-3 text-rose-600" />
                                      </span>
                                    )}
                                    Categorize Sentiment (100 rows/batch)
                                  </DropdownMenuItem>
                                  {sentimentErrors[header] && (
                                    <div className="px-2 py-1.5 text-[11px] text-red-600">
                                      {sentimentErrors[header]}
                                    </div>
                                  )}
                                  {transforms.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator className="bg-[#E5E5DE]" />
                                      <div className="px-2 py-1 text-[11px] font-mono text-[#202522]/60">
                                        {transforms.length} {transforms.length === 1 ? 'rule' : 'rules'} applied
                                      </div>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row, rowIndex) => {
                        const absoluteIndex = startIndex + rowIndex + 1;
                        return (
                          <TableRow
                            key={absoluteIndex}
                            className={cn(
                              'group/row border-b border-[#E5E5DE]/80 transition-colors',
                              rowIndex % 2 === 0 ? 'bg-white' : 'bg-[#F7F5EF]/35',
                              'hover:bg-[#EFECE3]/60'
                            )}
                          >
                            <TableCell className="w-12 text-center text-[11px] font-mono text-[#202522]/40 border-r border-[#E5E5DE] select-none bg-[#F7F5EF]/20 py-2">
                              {absoluteIndex}
                            </TableCell>
                            {csvData.headers.map((header) => {
                              const value = row[header] ?? '';
                              const isEmpty =
                                value.trim() === '' ||
                                ['null', 'na', 'n/a', '-'].includes(
                                  value.trim().toLowerCase()
                                );
                              return (
                                <TableCell
                                  key={header}
                                  className="whitespace-nowrap px-3.5 py-2 text-xs border-r border-[#E5E5DE]/70 last:border-r-0 font-sans"
                                >
                                  {isEmpty ? (
                                    <span className="text-[#202522]/30 italic">
                                      —
                                    </span>
                                  ) : value === 'Positive' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <Smile className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                                      Positive
                                    </span>
                                  ) : value === 'Negative' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                                      <Frown className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                                      Negative
                                    </span>
                                  ) : value === 'Neutral' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                      <Meh className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                                      Neutral
                                    </span>
                                  ) : (
                                    <span className="text-[#202522]">
                                      {value}
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination Controls Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E5E5DE] bg-[#F7F5EF]/60 text-xs">
                  <div className="text-[#202522]/70 font-sans">
                    Showing rows <span className="font-semibold text-[#202522] font-mono">{startIndex + 1}</span> to{' '}
                    <span className="font-semibold text-[#202522] font-mono">{endIndex}</span> of{' '}
                    <span className="font-semibold text-[#202522] font-mono">{displayedRows.length.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#202522]/70 font-sans mr-1">
                      Page <span className="text-[#202522] font-semibold font-mono">{currentPage}</span> of{' '}
                      <span className="text-[#202522] font-semibold font-mono">{totalPages}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="h-7 px-2.5 text-xs border-[#E5E5DE] bg-white gap-1 font-medium disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="h-7 px-2.5 text-xs border-[#E5E5DE] bg-white gap-1 font-medium disabled:opacity-40 cursor-pointer"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#202522]/60 font-sans">
                <p>
                  Tip: Cleaned files can be exported as standard CSV or Microsoft Excel (.xlsx) with full change-log audit trails.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMergeDialogOpen(true)}
                    className="text-[#202522] font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Layers className="h-3 w-3" />
                    <span>Merge Secondary Dataset</span>
                  </button>
                  <button
                    onClick={() => setSchemaMappingOpen(true)}
                    className="text-[#4D7CFE] font-semibold hover:underline cursor-pointer"
                  >
                    Schema Mapping →
                  </button>
                  <button
                    onClick={() => setShowBeforeAfter(true)}
                    className="text-[#2F8F6B] font-semibold hover:underline cursor-pointer"
                  >
                    View Live Diff & Change Log →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Multi-File Merge Dialog */}
      {csvData && (
        <MultiFileMergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          primaryFileName={csvData.fileName}
          primaryHeaders={csvData.headers}
          primaryRows={csvData.rows}
          onMergeComplete={handleMergeComplete}
        />
      )}

      {/* Schema Mapping Dialog */}
      {csvData && (
        <SchemaMappingDialog
          open={schemaMappingOpen}
          onOpenChange={setSchemaMappingOpen}
          headers={csvData.headers}
          onApplyMapping={handleApplySchemaMapping}
        />
      )}

      {/* Version History & Restore Modal */}
      {csvData && (
        <VersionHistoryModal
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
          versions={versionManagerRef.current.getAllVersions()}
          currentVersionNumber={versionManagerRef.current.getCurrentVersion()?.versionNumber ?? 0}
          onRestoreVersion={handleRestoreVersion}
          onCompareVersions={handleCompareVersions}
        />
      )}

      {/* AI Batch Progress Modal */}
      <Dialog
        open={aiProgress.isOpen}
        onOpenChange={(open) => {
          if (!open && aiProgress.status !== 'running') {
            setAiProgress((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#E5E5DE] shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg shadow-2xs',
                  aiProgress.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : aiProgress.status === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-[#4D7CFE]/10 text-[#4D7CFE] border border-[#4D7CFE]/20'
                )}
              >
                {aiProgress.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : aiProgress.status === 'error' ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <Sparkles className="h-5 w-5 animate-pulse text-[#4D7CFE]" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-[#202522] font-sans">
                  {aiProgress.status === 'completed'
                    ? 'AI Processing Complete'
                    : aiProgress.status === 'cancelled'
                    ? 'Processing Stopped'
                    : aiProgress.status === 'error'
                    ? 'AI Processing Error'
                    : aiProgress.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#202522]/60 mt-0.5 font-sans">
                  {aiProgress.column ? `Target: ${aiProgress.column}` : 'Transforming data in batches of 100'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-3 space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-[#202522] font-sans">
                  Analyzing data... {aiProgress.completedRows.toLocaleString()} of {aiProgress.totalRows.toLocaleString()} rows completed
                </span>
                <span className="font-semibold text-[#4D7CFE] font-mono">
                  {Math.round((aiProgress.completedRows / (aiProgress.totalRows || 1)) * 100)}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F7F5EF] border border-[#E5E5DE]">
                <div
                  className={cn(
                    'h-full transition-all duration-300 ease-out',
                    aiProgress.status === 'completed'
                      ? 'bg-[#2F8F6B]'
                      : aiProgress.status === 'error'
                      ? 'bg-red-600'
                      : 'bg-[#4D7CFE]'
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((aiProgress.completedRows / (aiProgress.totalRows || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#202522]/60 border-t border-[#E5E5DE] pt-2.5 font-sans">
              <span className="font-mono text-[11px]">
                Batch {Math.min(Math.ceil(aiProgress.completedRows / AI_BATCH_SIZE) + (aiProgress.status === 'running' ? 1 : 0), Math.max(1, Math.ceil(aiProgress.totalRows / AI_BATCH_SIZE)))} of {Math.max(1, Math.ceil(aiProgress.totalRows / AI_BATCH_SIZE))} (100 rows/batch)
              </span>
              {aiProgress.status === 'running' && (
                <span className="flex items-center gap-1.5 text-[#4D7CFE] font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing sequential batches...
                </span>
              )}
            </div>

            {aiProgress.errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{aiProgress.errorMessage}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {aiProgress.status === 'running' ? (
              <>
                <p className="text-[11px] text-[#202522]/60 font-sans">
                  Master dataset updates live as each batch completes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    cancelProcessingRef.current = true;
                  }}
                  className="h-8 text-xs text-red-600 hover:bg-red-50 border-red-200 cursor-pointer"
                >
                  Stop Processing
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setAiProgress((prev) => ({ ...prev, isOpen: false }))}
                className="ml-auto h-8 text-xs bg-[#202522] hover:bg-[#202522]/90 text-white cursor-pointer"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Clean Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl bg-white border border-[#E5E5DE] shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D7CFE] text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <DialogTitle className="font-sans font-bold text-lg text-[#202522]">
                TidyRow Transform — Natural Language Cleaning Plan
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#202522]/70 font-sans">
              Describe the outcome you want. TidyRow interprets your instruction into a structured, reviewable plan before applying changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-[#202522] font-sans">
                Columns to clean
              </label>
              <div className="flex flex-wrap gap-2">
                {csvData?.headers.map((header) => {
                  const selected = aiSelectedColumns.has(header);
                  return (
                    <button
                      key={header}
                      type="button"
                      onClick={() => toggleColumnSelection(header)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer font-sans',
                        selected
                          ? 'border-[#4D7CFE] bg-[#4D7CFE]/10 text-[#4D7CFE]'
                          : 'border-[#E5E5DE] bg-[#F7F5EF] text-[#202522]/70 hover:border-[#4D7CFE]/40'
                      )}
                    >
                      {selected && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {header}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-[#202522] font-sans">
                Cleaning instruction
              </label>
              <Textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="e.g. Standardize all phone numbers to (XXX) XXX-XXXX format or split address into city and zip"
                className="min-h-[85px] resize-none border-[#E5E5DE] text-xs font-sans focus:border-[#4D7CFE]"
                disabled={aiLoading}
              />
            </div>

            <div>
              <p className="mb-2 text-xs text-[#202522]/60 font-sans">Suggested cleaning prompts:</p>
              <div className="flex flex-wrap gap-2">
                {AI_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setAiInstruction(suggestion)}
                    disabled={aiLoading}
                    className="rounded-full border border-[#E5E5DE] bg-[#F7F5EF] px-3 py-1 text-xs text-[#202522]/70 transition-colors hover:border-[#4D7CFE] hover:text-[#202522] cursor-pointer font-sans"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {aiError && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{aiError}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAiClean}
                  disabled={aiLoading}
                  className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100 shrink-0 cursor-pointer"
                >
                  Retry
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAiDialogOpen(false)}
              disabled={aiLoading}
              className="border-[#E5E5DE] text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAiClean}
              disabled={
                aiLoading ||
                !aiInstruction.trim() ||
                aiSelectedColumns.size === 0
              }
              className="gap-1.5 bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cleaning with Gemini...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply AI-assisted Cleaning
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
