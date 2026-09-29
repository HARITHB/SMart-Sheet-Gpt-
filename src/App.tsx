import React, { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
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
  FileText,
  RotateCcw,
  Hash,
  Type,
  Calendar,
  Binary,
  ChevronLeft,
  ChevronRight,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
  'uppercase',
  'lowercase',
  'titlecase',
  'extract_zip',
];

const AI_SUGGESTIONS = [
  'Standardize all phone numbers to (XXX) XXX-XXXX format',
  'Fix common typos and spelling mistakes',
  'Normalize all dates to YYYY-MM-DD',
  'Remove extra whitespace and trim all fields',
  'Standardize state names to two-letter abbreviations',
  'Fill empty cells with "N/A"',
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

const SAMPLE_CSV = SAMPLE_ECOMMERCE_CSV;

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function inferColumnType(values: string[]): {
  type: string;
  empties: number;
  nulls: number;
} {
  let empties = 0;
  let nulls = 0;
  let isNumeric = true;
  let isBoolean = true;
  let isDate = true;

  for (const val of values) {
    const trimmed = (val ?? '').trim();
    if (trimmed === '') {
      empties++;
      continue;
    }
    if (
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'na' ||
      trimmed.toLowerCase() === 'n/a' ||
      trimmed === '-'
    ) {
      nulls++;
      continue;
    }
    if (isNumeric && isNaN(Number(trimmed))) {
      isNumeric = false;
    }
    if (
      isBoolean &&
      !['true', 'false', 'yes', 'no', '0', '1'].includes(trimmed.toLowerCase())
    ) {
      isBoolean = false;
    }
    if (isDate && isNaN(Date.parse(trimmed))) {
      isDate = false;
    }
  }

  let type = 'text';
  if (isNumeric) type = 'number';
  else if (isBoolean) type = 'boolean';
  else if (isDate) type = 'date';

  return { type, empties, nulls };
}

export default function App() {
  const [csvData, setCsvData] = useState<CsvData | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [aiProgress, setAiProgress] = useState<AiProgressState>({
    isOpen: false,
    title: '',
    totalRows: 0,
    completedRows: 0,
    status: 'completed',
  });
  const cancelProcessingRef = useRef(false);

  const loadSampleDataset = useCallback((sampleName: string, csvContent: string) => {
    setParseError(null);
    setIsParsing(true);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setCurrentPage(1);

    Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const allRows = results.data;

        setCsvData({
          fileName: sampleName,
          fileSize: csvContent.length,
          headers,
          rows: allRows,
          totalRows: allRows.length,
          errors: results.errors.length,
        });
        setCurrentPage(1);
        setIsParsing(false);
      },
      error: (err: Error) => {
        setParseError(err.message);
        setIsParsing(false);
      },
    });
  }, []);

  const loadSampleData = useCallback(() => {
    loadSampleDataset('customer_reviews.csv', SAMPLE_REVIEWS_CSV);
  }, [loadSampleDataset]);

  const handleFile = useCallback((file: File) => {
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.tsv') && !fileNameLower.endsWith('.txt')) {
      setParseError('Please upload a .csv or .tsv file');
      setCsvData(null);
      return;
    }

    setParseError(null);
    setIsParsing(true);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setCurrentPage(1);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const allRows = results.data;

        setCsvData({
          fileName: file.name,
          fileSize: file.size,
          headers,
          rows: allRows,
          totalRows: allRows.length,
          errors: results.errors.length,
        });
        setCurrentPage(1);
        setIsParsing(false);
      },
      error: (err: Error) => {
        setParseError(err.message);
        setIsParsing(false);
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
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
    setParseError(null);
    setAppliedTransforms({});
    setAiAppliedCount(0);
    setSentimentLoading({});
    setSentimentErrors({});
    setCurrentPage(1);
    setAiProgress((prev) => ({ ...prev, isOpen: false }));
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!csvData) return;
    const csv = Papa.unparse({
      fields: csvData.headers,
      data: csvData.rows,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cleaned_${csvData.fileName}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [csvData]);

  const handleApplyTransform = useCallback(
    (header: string, rule: TransformRule) => {
      setCsvData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: transformColumn(prev.rows, header, rule),
        };
      });
      setAppliedTransforms((prev) => ({
        ...prev,
        [header]: [...(prev[header] ?? []), rule],
      }));
    },
    []
  );

  const handleSentiment = useCallback(async (header: string) => {
    if (!csvData || csvData.rows.length === 0) return;

    const total = csvData.rows.length;
    setSentimentErrors((prev) => ({ ...prev, [header]: null }));
    setSentimentLoading((prev) => ({ ...prev, [header]: true }));

    cancelProcessingRef.current = false;
    setAiProgress({
      isOpen: true,
      title: 'Categorizing Sentiment',
      column: header,
      totalRows: total,
      completedRows: 0,
      status: 'running',
    });

    const allRows = [...csvData.rows];
    let processedCount = 0;

    try {
      for (let i = 0; i < total; i += AI_BATCH_SIZE) {
        if (cancelProcessingRef.current) {
          setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
          break;
        }

        const batchEnd = Math.min(i + AI_BATCH_SIZE, total);
        const batchSlice = allRows.slice(i, batchEnd);
        const batchValues = batchSlice.map((r) => r[header] ?? '');

        const res = await fetch('/api/ai-sentiment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ header, values: batchValues }),
        });

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || 'Sentiment analysis failed');
        }

        const batchSentiments = result.values || [];
        for (let j = 0; j < batchSlice.length; j++) {
          const rowIdx = i + j;
          allRows[rowIdx] = {
            ...allRows[rowIdx],
            [header]: batchSentiments[j] ?? allRows[rowIdx][header],
          };
        }

        processedCount = batchEnd;

        // Incrementally update the master dataset as each batch returns
        setCsvData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: [...allRows],
          };
        });

        setAiProgress((prev) => ({
          ...prev,
          completedRows: processedCount,
        }));
      }

      if (!cancelProcessingRef.current) {
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
  }, [csvData]);

  const openAiDialog = useCallback(() => {
    if (csvData) {
      setAiSelectedColumns(new Set(csvData.headers));
    }
    setAiInstruction('');
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

  const handleAiClean = useCallback(async () => {
    if (!csvData || !aiInstruction.trim() || aiSelectedColumns.size === 0) return;

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

    const allRows = [...csvData.rows];
    let processedCount = 0;

    try {
      for (let i = 0; i < total; i += AI_BATCH_SIZE) {
        if (cancelProcessingRef.current) {
          setAiProgress((prev) => ({ ...prev, status: 'cancelled' }));
          break;
        }

        const batchEnd = Math.min(i + AI_BATCH_SIZE, total);
        const batchSlice = allRows.slice(i, batchEnd);

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

        const cleanedMap: Record<string, string[]> = {};
        for (const col of result.columns) {
          cleanedMap[col.header] = col.values;
        }

        for (let j = 0; j < batchSlice.length; j++) {
          const rowIdx = i + j;
          const updated = { ...allRows[rowIdx] };
          for (const colHeader of selectedCols) {
            const vals = cleanedMap[colHeader];
            if (vals && vals[j] !== undefined) {
              updated[colHeader] = String(vals[j]);
            }
          }
          allRows[rowIdx] = updated;
        }

        processedCount = batchEnd;

        setCsvData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: [...allRows],
          };
        });

        setAiProgress((prev) => ({
          ...prev,
          completedRows: processedCount,
        }));
      }

      if (!cancelProcessingRef.current) {
        setAiAppliedCount((c) => c + 1);
        setAiProgress((prev) => ({
          ...prev,
          status: 'completed',
          completedRows: total,
        }));
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

  // Build column stats for the loaded data (sampled for high-performance on 40,000+ rows)
  const columnStats = useMemo(() => {
    if (!csvData) return [];
    const sampleLimit = Math.min(csvData.rows.length, 2000);
    return csvData.headers.map((header) => {
      const sampleValues: string[] = [];
      for (let i = 0; i < sampleLimit; i++) {
        sampleValues.push(csvData.rows[i][header] ?? '');
      }
      return inferColumnType(sampleValues);
    });
  }, [csvData?.headers, csvData?.rows]);

  const totalEmptyCells = useMemo(() => {
    return columnStats.reduce(
      (sum, s) => sum + s.empties + s.nulls,
      0
    );
  }, [columnStats]);

  const totalTransforms = useMemo(() => {
    return Object.values(appliedTransforms).reduce(
      (sum, rules) => sum + rules.length,
      0
    );
  }, [appliedTransforms]);

  const totalPages = Math.max(1, Math.ceil((csvData?.rows.length || 0) / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, csvData?.rows.length || 0);

  const visibleRows = useMemo(() => {
    if (!csvData) return [];
    return csvData.rows.slice(startIndex, endIndex);
  }, [csvData?.rows, startIndex, endIndex]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1720px] w-full items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
              <Table2 className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight leading-none">
                SheetGPT <span className="font-normal text-muted-foreground">• CSV Data Cleaner</span>
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inspect, transform & clean your spreadsheets with Gemini AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {csvData && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveFile}
                  className="h-8 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground border-border/80"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-8 gap-1.5 px-3 text-xs font-medium border-border/80"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  onClick={openAiDialog}
                  className="h-8 gap-1.5 px-3.5 text-xs font-medium shadow-2xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Clean
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1720px] w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col">
        {!csvData ? (
          /* Upload / Landing State */
          <div className="relative flex flex-col items-center pt-6 pb-12 animate-fade-in w-full max-w-4xl mx-auto">
            {/* Subtle soft top glow & atmospheric mesh */}
            <div className="pointer-events-none absolute -top-36 left-1/2 -translate-x-1/2 h-[450px] w-[900px] max-w-[100vw] -z-10 rounded-full bg-gradient-to-b from-indigo-200/40 via-blue-100/25 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 h-[300px] w-[600px] max-w-[100vw] -z-10 rounded-full bg-gradient-to-tr from-purple-200/25 via-sky-100/20 to-transparent blur-2xl" />

            {/* Frosted Pill Badge */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-4 py-1.5 text-xs font-medium text-slate-700 shadow-2xs backdrop-blur-md transition-colors hover:border-slate-300 select-none">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              <span>The 1-Click Spreadsheet Cleaner</span>
            </div>

            {/* Headline */}
            <h1 className="text-center text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700 sm:text-4xl lg:text-5xl max-w-2xl leading-[1.15]">
              Clean messy spreadsheets in seconds, not hours.
            </h1>

            {/* Subtitle */}
            <p className="mt-3.5 max-w-xl text-center text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Format addresses, standardize names, and extract key data without writing formulas or prompt engineering.
            </p>

            {/* Trust Badges */}
            <div className="mt-5 mb-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-xs">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/85 text-slate-700 border border-slate-200/80 font-medium shadow-2xs backdrop-blur-xs">
                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <span>Instant Processing</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/85 text-slate-700 border border-slate-200/80 font-medium shadow-2xs backdrop-blur-xs">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Private & Secure</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/85 text-slate-700 border border-slate-200/80 font-medium shadow-2xs backdrop-blur-xs">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>Gemini AI Powered</span>
              </div>
            </div>

            {/* Premium Upload Dropzone Card */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'group relative flex min-h-[250px] w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300',
                'bg-white shadow-md shadow-slate-100 hover:shadow-lg hover:shadow-slate-200/60',
                isDragging
                  ? 'scale-[1.01] border-indigo-500 bg-indigo-50/40 ring-4 ring-indigo-500/10'
                  : 'border-slate-200/80 hover:border-indigo-400/80 hover:bg-slate-50/40'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />

              {/* Dual-tone icon container */}
              <div
                className={cn(
                  'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 shadow-2xs',
                  isDragging
                    ? 'scale-110 bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-indigo-50 text-indigo-600 group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white'
                )}
              >
                <UploadCloud className="h-7 w-7" />
              </div>

              <p className="text-base font-semibold text-slate-800">
                {isDragging ? 'Drop your CSV file here' : 'Drag & drop your CSV file'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                or <span className="font-semibold text-indigo-600 hover:underline">browse files</span> from your computer
              </p>
              <p className="mt-3 text-[11px] font-medium text-slate-400">
                Supports .csv, .tsv up to 100MB
              </p>

              {isParsing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 backdrop-blur-sm z-20">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <p className="text-sm font-medium text-slate-700">
                    Parsing dataset into memory...
                  </p>
                </div>
              )}
            </div>

            {/* Sample Datasets Section */}
            <div className="mt-7 flex flex-col items-center gap-3 w-full">
              <span className="text-xs font-medium text-slate-500">
                Want to test it first? Try a sample:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadSampleDataset('ecommerce_orders.csv', SAMPLE_ECOMMERCE_CSV);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:border-indigo-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer active:scale-95"
                >
                  <span>🛍️</span>
                  <span>E-commerce Orders (Messy Addresses)</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadSampleDataset('sales_leads.csv', SAMPLE_SALES_LEADS_CSV);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:border-indigo-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer active:scale-95"
                >
                  <span>👥</span>
                  <span>Sales Leads (Inconsistent Names)</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadSampleDataset('customer_reviews.csv', SAMPLE_REVIEWS_CSV);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:border-indigo-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer active:scale-95"
                >
                  <span>⭐</span>
                  <span>Customer Reviews (Sentiment)</span>
                </button>
              </div>
            </div>

            {parseError && (
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-slide-up">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}

            {/* Feature Highlights Grid */}
            <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Table2,
                  title: 'Instant 40k+ Preview',
                  desc: 'Paginated zero-lag inspection for massive spreadsheets',
                },
                {
                  icon: Columns3,
                  title: 'Auto Column Insights',
                  desc: 'Automatic type inference and data quality detection',
                },
                {
                  icon: Sparkles,
                  title: 'Batched Gemini AI',
                  desc: 'Sequential 100-row batching for robust prompt cleaning',
                },
              ].map((feature, i) => (
                <div
                  key={feature.title}
                  className="flex flex-col items-center gap-2 rounded-xl border border-slate-200/70 bg-white/70 backdrop-blur-xs p-5 text-center shadow-2xs animate-slide-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <feature.icon className="h-5 w-5 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-800">{feature.title}</p>
                  <p className="text-xs text-slate-500">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Data Loaded State */
          <div className="animate-fade-in">
            {/* Single File Overview Card with integrated metrics and grouped top-right actions */}
            <Card className="mb-6 p-5 border border-border/80 bg-card shadow-2xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-muted-foreground">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">
                        {csvData.fileName}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        ({formatBytes(csvData.fileSize)})
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {csvData.errors > 0 ? (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 inline" />
                          {csvData.errors} parse {csvData.errors === 1 ? 'error' : 'errors'}
                        </span>
                      ) : (
                        'Ready for inspection & cleaning'
                      )}
                    </p>
                  </div>
                </div>

                {/* Top Right Grouped Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="h-8 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground border-border/80"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-8 gap-1.5 px-3 text-xs font-medium border-border/80"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={openAiDialog}
                    className="h-8 gap-1.5 px-3.5 text-xs font-medium shadow-2xs"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Clean
                  </Button>
                </div>
              </div>

              {/* Integrated Metrics with subtle text and small muted icons */}
              <div className="mt-4 pt-3.5 border-t border-border/60 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Rows3 className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span>Total Rows:</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {csvData.totalRows.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Columns3 className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span>Columns:</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {csvData.headers.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80" />
                  <span>Data Quality:</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {totalEmptyCells === 0 && csvData.errors === 0
                      ? '100%'
                      : `${Math.round(
                          (1 -
                            totalEmptyCells /
                              (csvData.totalRows * csvData.headers.length || 1)) *
                            100
                        )}%`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle
                    className={cn(
                      'h-3.5 w-3.5',
                      totalEmptyCells > 0 ? 'text-amber-500' : 'text-muted-foreground/70'
                    )}
                  />
                  <span>Empty Cells:</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {totalEmptyCells.toLocaleString()}
                  </span>
                </div>

                {totalTransforms > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Wand2 className="h-3.5 w-3.5 text-primary/80" />
                    <span>Transforms:</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {totalTransforms}
                    </span>
                  </div>
                )}

                {aiAppliedCount > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary/80" />
                    <span>AI Recipes:</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {aiAppliedCount}
                    </span>
                  </div>
                )}

                {totalPages > 1 && (
                  <span className="ml-auto text-[11px] text-muted-foreground/60">
                    Showing {ROWS_PER_PAGE} rows per page ({totalPages} pages total)
                  </span>
                )}
              </div>
            </Card>

            {/* Data table */}
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Data Preview
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({csvData.rows.length.toLocaleString()} total rows)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Showing rows <span className="font-semibold text-foreground tabular-nums">{startIndex + 1}</span>–<span className="font-semibold text-foreground tabular-nums">{endIndex}</span> of <span className="font-semibold text-foreground tabular-nums">{csvData.rows.length.toLocaleString()}</span>
                  </span>
                </div>
              </div>
              <Card className="overflow-hidden p-0 border border-zinc-200/80 bg-card rounded-xl shadow-2xs">
                <div className="h-[calc(100vh-310px)] min-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-xs border-b border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      <TableRow className="hover:bg-transparent border-b border-zinc-200/80">
                        <TableHead className="w-12 text-center text-[11px] font-semibold text-muted-foreground/70 border-r border-zinc-200/60 bg-zinc-50/50 select-none py-2.5">
                          #
                        </TableHead>
                        {csvData.headers.map((header, i) => {
                          const transforms = appliedTransforms[header] ?? [];
                          const colType = columnStats[i]?.type ?? 'text';

                          return (
                            <TableHead
                              key={header}
                              className="whitespace-nowrap text-xs font-semibold p-0 border-r border-zinc-200/60 last:border-r-0"
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="group/header flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-100/70 cursor-pointer">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-foreground/90 font-medium truncate">{header}</span>
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 select-none">
                                        {colType === 'number' && <Hash className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'text' && <Type className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'date' && <Calendar className="h-2.5 w-2.5 shrink-0" />}
                                        {colType === 'boolean' && <Binary className="h-2.5 w-2.5 shrink-0" />}
                                        <span>{colType}</span>
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {transforms.length > 0 && (
                                        <span className="flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold text-primary">
                                          <Wand2 className="h-2.5 w-2.5" />
                                          {transforms.length}
                                        </span>
                                      )}
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-data-[state=open]/header:rotate-180" />
                                    </div>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-56 bg-card border shadow-lg z-50">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    Transform column
                                  </DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {TRANSFORM_RULES.map((rule) => {
                                    const isApplied = transforms.includes(rule);
                                    return (
                                      <DropdownMenuItem
                                        key={rule}
                                        onClick={() => handleApplyTransform(header, rule)}
                                        className="gap-2 text-sm cursor-pointer"
                                      >
                                        <span
                                          className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded',
                                            isApplied
                                              ? 'bg-primary/15 text-primary'
                                              : 'text-muted-foreground/40'
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
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    AI Recipe
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => handleSentiment(header)}
                                    disabled={sentimentLoading[header]}
                                    className="gap-2 text-sm cursor-pointer"
                                  >
                                    {sentimentLoading[header] ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    ) : (
                                      <span className="flex items-center gap-0.5">
                                        <Smile className="h-3 w-3 text-emerald-500" />
                                        <Meh className="h-3 w-3 text-muted-foreground" />
                                        <Frown className="h-3 w-3 text-destructive" />
                                      </span>
                                    )}
                                    Categorize Sentiment (100 rows/batch)
                                  </DropdownMenuItem>
                                  {sentimentErrors[header] && (
                                    <div className="px-2 py-1.5 text-[11px] text-destructive">
                                      {sentimentErrors[header]}
                                    </div>
                                  )}
                                  {transforms.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                        {transforms.length} {transforms.length === 1 ? 'rule' : 'rules'} applied to this column
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
                              'group/row border-b border-zinc-100 transition-colors',
                              rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50',
                              'hover:bg-zinc-100/70'
                            )}
                          >
                            <TableCell className="w-12 text-center text-[11px] font-mono text-zinc-400 border-r border-zinc-200/60 select-none bg-zinc-50/30 py-2">
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
                                  className="whitespace-nowrap px-3.5 py-2 text-xs border-r border-zinc-100/80 last:border-r-0"
                                >
                                  {isEmpty ? (
                                    <span className="text-muted-foreground/40 italic">
                                      —
                                    </span>
                                  ) : value === 'Positive' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-none">
                                      <Smile className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                                      Positive
                                    </span>
                                  ) : value === 'Negative' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200/80 shadow-none">
                                      <Frown className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                                      Negative
                                    </span>
                                  ) : value === 'Neutral' ? (
                                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 shadow-none">
                                      <Meh className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                                      Neutral
                                    </span>
                                  ) : (
                                    <span className="text-foreground/90">
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-zinc-200/80 bg-zinc-50/50 text-xs">
                  <div className="text-muted-foreground">
                    Showing rows <span className="font-semibold text-foreground tabular-nums">{startIndex + 1}</span> to{' '}
                    <span className="font-semibold text-foreground tabular-nums">{endIndex}</span> of{' '}
                    <span className="font-semibold text-foreground tabular-nums">{csvData.rows.length.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium mr-1">
                      Page <span className="text-foreground font-semibold">{currentPage}</span> of{' '}
                      <span className="text-foreground font-semibold">{totalPages}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="h-7 px-2.5 text-xs border-zinc-200/80 gap-1 font-medium disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="h-7 px-2.5 text-xs border-zinc-200/80 gap-1 font-medium disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
              <p className="mt-3 text-xs text-muted-foreground">
                Tip: Click any column header to apply uppercase, lowercase, email extraction, or AI sentiment analysis across all rows. Use "AI Clean" for prompt-guided edits.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* AI Batch Progress Modal */}
      <Dialog
        open={aiProgress.isOpen}
        onOpenChange={(open) => {
          if (!open && aiProgress.status !== 'running') {
            setAiProgress((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="max-w-md bg-card border shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg shadow-2xs',
                  aiProgress.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : aiProgress.status === 'error'
                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                    : 'bg-primary/10 text-primary border border-primary/20'
                )}
              >
                {aiProgress.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : aiProgress.status === 'error' ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <Sparkles className="h-5 w-5 animate-pulse text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {aiProgress.status === 'completed'
                    ? 'AI Processing Complete'
                    : aiProgress.status === 'cancelled'
                    ? 'Processing Stopped'
                    : aiProgress.status === 'error'
                    ? 'AI Processing Error'
                    : aiProgress.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {aiProgress.column ? `Target: ${aiProgress.column}` : 'Transforming data in batches of 100'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-3 space-y-4">
            {/* Progress bar and counter */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground">
                  Analyzing data... {aiProgress.completedRows.toLocaleString()} of {aiProgress.totalRows.toLocaleString()} rows completed
                </span>
                <span className="font-semibold text-primary tabular-nums">
                  {Math.round((aiProgress.completedRows / (aiProgress.totalRows || 1)) * 100)}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/80">
                <div
                  className={cn(
                    'h-full transition-all duration-300 ease-out',
                    aiProgress.status === 'completed'
                      ? 'bg-emerald-600'
                      : aiProgress.status === 'error'
                      ? 'bg-destructive'
                      : 'bg-primary'
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((aiProgress.completedRows / (aiProgress.totalRows || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2.5">
              <span>
                Batch {Math.min(Math.ceil(aiProgress.completedRows / AI_BATCH_SIZE) + (aiProgress.status === 'running' ? 1 : 0), Math.max(1, Math.ceil(aiProgress.totalRows / AI_BATCH_SIZE)))} of {Math.max(1, Math.ceil(aiProgress.totalRows / AI_BATCH_SIZE))} (100 rows/batch)
              </span>
              {aiProgress.status === 'running' && (
                <span className="flex items-center gap-1.5 text-primary font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing sequential batches...
                </span>
              )}
            </div>

            {aiProgress.errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{aiProgress.errorMessage}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {aiProgress.status === 'running' ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Master dataset updates live as each batch completes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    cancelProcessingRef.current = true;
                  }}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  Stop Processing
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setAiProgress((prev) => ({ ...prev, isOpen: false }))}
                className="ml-auto h-8 text-xs"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Clean Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-chart-1 text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <DialogTitle>AI Data Cleaner</DialogTitle>
            </div>
            <DialogDescription>
              Describe how you want to clean your data. Gemini AI will apply your
              instruction across all selected columns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Column selection */}
            <div>
              <label className="mb-2 block text-sm font-medium">
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
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {selected && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {header}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instruction input */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Cleaning instruction
              </label>
              <Textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="e.g. Standardize all phone numbers to (XXX) XXX-XXXX format"
                className="min-h-[80px] resize-none"
                disabled={aiLoading}
              />
            </div>

            {/* Suggestions */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Try one of these recipes:</p>
              <div className="flex flex-wrap gap-2">
                {AI_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setAiInstruction(suggestion)}
                    disabled={aiLoading}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {aiError && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{aiError}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAiClean}
                  disabled={aiLoading}
                  className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
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
              className="gap-1.5 bg-gradient-to-r from-primary to-chart-1 text-primary-foreground hover:opacity-90"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cleaning with Gemini...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply AI Clean
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="mt-8 border-t border-border/60 py-6">
        <p className="text-center text-xs text-muted-foreground">
          SheetGPT CSV Data Cleaner • Powered by Google Gemini AI
        </p>
      </footer>
    </div>
  );
}

