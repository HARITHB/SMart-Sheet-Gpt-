import React from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  RotateCcw,
  Download,
  Sparkles,
  SplitSquareVertical,
  Undo2,
  FileText,
} from 'lucide-react';
import { TidyRowLogo } from '@/components/ui/TidyRowLogo';

interface WorkspaceHeaderProps {
  hasData: boolean;
  activeStep: 'upload' | 'understand' | 'clean' | 'verify';
  onNavigateHome: () => void;
  onReset: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onExport: () => void;
  onExportChangeLog?: () => void;
  onOpenAiClean: () => void;
  showBeforeAfter: boolean;
  onToggleBeforeAfter: () => void;
  hasModifications: boolean;
}

export function WorkspaceHeader({
  hasData,
  activeStep,
  onNavigateHome,
  onReset,
  onUndo,
  canUndo = false,
  onExport,
  onExportChangeLog,
  onOpenAiClean,
  showBeforeAfter,
  onToggleBeforeAfter,
  hasModifications,
}: WorkspaceHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E5DE] bg-[#F7F5EF]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1720px] w-full items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
        {/* Left side: Logo + Navigation breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-xs font-sans font-medium text-[#202522]/70 hover:text-[#202522] transition-colors cursor-pointer mr-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Overview</span>
          </button>

          <div className="h-4 w-[1px] bg-[#E5E5DE]" />

          <div className="flex items-center gap-2">
            <TidyRowLogo size="sm" />
            <span className="font-mono text-[11px] font-semibold text-[#202522]/50 bg-[#E5E5DE]/60 px-1.5 py-0.5 rounded">
              Workspace
            </span>
          </div>

          {/* Workflow step indicator */}
          <div className="hidden lg:flex items-center gap-1.5 ml-4 text-[11px] font-mono text-[#202522]/60">
            <span className={activeStep === 'upload' ? 'text-[#202522] font-bold' : ''}>
              1. Upload
            </span>
            <span>→</span>
            <span className={activeStep === 'understand' ? 'text-[#4D7CFE] font-bold' : ''}>
              2. Understand & Review
            </span>
            <span>→</span>
            <span className={activeStep === 'clean' ? 'text-[#2F8F6B] font-bold' : ''}>
              3. Clean
            </span>
            <span>→</span>
            <span className={activeStep === 'verify' ? 'text-[#2F8F6B] font-bold' : ''}>
              4. Verify & Download
            </span>
          </div>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-2">
          {hasData && (
            <>
              {canUndo && onUndo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUndo}
                  className="h-8 gap-1.5 px-2.5 text-xs font-sans border-[#E5E5DE] bg-white text-[#202522] hover:bg-[#F0EEE6] cursor-pointer"
                  title="Undo latest cleaning step"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Undo</span>
                </Button>
              )}

              {hasModifications && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleBeforeAfter}
                  className={`h-8 gap-1.5 px-3 text-xs font-sans border-[#E5E5DE] transition-colors cursor-pointer ${
                    showBeforeAfter
                      ? 'bg-[#202522] text-white border-[#202522]'
                      : 'bg-white text-[#202522] hover:bg-[#F0EEE6]'
                  }`}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                  <span>{showBeforeAfter ? 'Close Diff' : 'Before / After'}</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                className="h-8 gap-1.5 px-3 text-xs font-sans text-[#202522]/70 hover:text-[#202522] border-[#E5E5DE] bg-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>

              <Button
                size="sm"
                onClick={onOpenAiClean}
                className="h-8 gap-1.5 px-3.5 text-xs font-sans font-medium bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white cursor-pointer shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Create Plan (AI-assisted)</span>
              </Button>

              <Button
                size="sm"
                onClick={onExport}
                className="h-8 gap-1.5 px-3.5 text-xs font-sans font-semibold bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white cursor-pointer shadow-2xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Cleaned</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
