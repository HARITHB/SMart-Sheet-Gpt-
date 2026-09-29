import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Table2 } from 'lucide-react';
import {
  CRM_TARGET_SCHEMA,
  ECOMMERCE_TARGET_SCHEMA,
  suggestSchemaMapping,
  type TargetSchema,
} from '@/lib/schemaMapping';

interface SchemaMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headers: string[];
  onApplyMapping: (mapping: Record<string, string>) => void;
}

export function SchemaMappingDialog({
  open,
  onOpenChange,
  headers,
  onApplyMapping,
}: SchemaMappingDialogProps) {
  const [selectedSchema, setSelectedSchema] = useState<TargetSchema>(CRM_TARGET_SCHEMA);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && headers.length > 0) {
      const suggested = suggestSchemaMapping(headers, selectedSchema);
      setMapping(suggested);
    }
  }, [open, headers, selectedSchema]);

  const handleSelectSchema = (schema: TargetSchema) => {
    setSelectedSchema(schema);
    const suggested = suggestSchemaMapping(headers, schema);
    setMapping(suggested);
  };

  const handleFieldChange = (sourceHeader: string, newTarget: string) => {
    setMapping((prev) => ({
      ...prev,
      [sourceHeader]: newTarget,
    }));
  };

  const handleConfirm = () => {
    onApplyMapping(mapping);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border border-[#E5E5DE] shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2F8F6B] text-white">
              <Table2 className="h-4 w-4" />
            </div>
            <DialogTitle className="font-sans font-bold text-lg text-[#202522]">
              Standard Schema Mapping
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#202522]/70 font-sans">
            Map spreadsheet columns to standard schema fields for CRM (Salesforce / HubSpot) or ERP imports. Unmapped columns are safely retained.
          </DialogDescription>
        </DialogHeader>

        {/* Schema selector tabs */}
        <div className="flex gap-2 border-b border-[#E5E5DE] pb-3">
          <button
            type="button"
            onClick={() => handleSelectSchema(CRM_TARGET_SCHEMA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
              selectedSchema.id === 'crm_lead'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            CRM Lead Schema
          </button>
          <button
            type="button"
            onClick={() => handleSelectSchema(ECOMMERCE_TARGET_SCHEMA)}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all cursor-pointer ${
              selectedSchema.id === 'ecommerce_order'
                ? 'bg-[#202522] text-white'
                : 'bg-[#F7F5EF] text-[#202522]/80 hover:bg-[#EFECE3]'
            }`}
          >
            E-commerce Order Schema
          </button>
        </div>

        {/* Mapping Table */}
        <div className="max-h-[340px] overflow-auto rounded-xl border border-[#E5E5DE] bg-[#F7F5EF]/40 p-1">
          <table className="w-full text-xs font-sans">
            <thead>
              <tr className="border-b border-[#E5E5DE] text-[#202522]/60 font-mono text-[11px]">
                <th className="py-2 px-3 text-left">Original Header</th>
                <th className="py-2 px-2 text-center w-8">→</th>
                <th className="py-2 px-3 text-left">Target Schema Field</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5DE]/80 bg-white">
              {headers.map((h) => {
                const currentMapped = mapping[h] || h;
                const isMatched = currentMapped !== h;

                return (
                  <tr key={h} className="hover:bg-[#F7F5EF]/60">
                    <td className="py-2 px-3 font-mono font-medium text-[#202522]">
                      {h}
                    </td>
                    <td className="py-2 px-2 text-center text-[#202522]/40">
                      <ArrowRight className="h-3 w-3 inline" />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={currentMapped}
                        onChange={(e) => handleFieldChange(h, e.target.value)}
                        className="w-full rounded-md border border-[#E5E5DE] bg-white px-2 py-1 text-xs font-mono text-[#202522] focus:border-[#2F8F6B] focus:outline-none cursor-pointer"
                      >
                        <option value={h}>(Keep as "{h}")</option>
                        {selectedSchema.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.key} ({f.label})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#2F8F6B] font-semibold bg-[#2F8F6B]/10 px-2 py-0.5 rounded">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Mapped
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-[#202522]/40">
                          Retained
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
          <span className="text-[11px] font-mono text-[#202522]/60">
            No columns will be removed or dropped.
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-[#E5E5DE] text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className="bg-[#2F8F6B] hover:bg-[#2F8F6B]/90 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Apply Schema Mapping
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
