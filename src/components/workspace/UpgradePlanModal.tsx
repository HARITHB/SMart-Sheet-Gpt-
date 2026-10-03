import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Check,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Info,
  Layers,
  Wand2,
  Lock,
} from 'lucide-react';
import {
  PLANS,
  PlanId,
  FeatureKey,
  FEATURE_METADATA,
  billingService,
  BillingState,
} from '@/lib/saas/commercial';

interface UpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: PlanId;
  targetFeature?: FeatureKey;
  workspaceId?: string;
  userEmail?: string;
}

export function UpgradePlanModal({
  isOpen,
  onClose,
  currentPlan = 'free',
  targetFeature,
  workspaceId = 'ws_default',
  userEmail = 'user@example.com',
}: UpgradePlanModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const featureInfo = targetFeature ? FEATURE_METADATA[targetFeature] : null;
  const isCurrentlyPro = currentPlan === 'pro';

  const handleUpgrade = async () => {
    setIsProcessing(true);
    setProviderNotice(null);

    try {
      const result = await billingService.createCheckoutSession(workspaceId, 'pro', userEmail);
      if (!result.success && result.requiresIntegration) {
        // Real provider not configured: clearly mark dependency, do NOT fake payment
        setProviderNotice(result.error || 'Billing provider is not configured.');
      } else if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      setProviderNotice(err?.message || 'Failed to initiate checkout.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-white border border-[#E5E5DE] p-6 shadow-xl text-[#202522]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#4D7CFE]/10 text-[#4D7CFE]">
              Subscription Plan
            </span>
          </div>
          <DialogTitle className="text-xl font-bold font-sans">
            {isCurrentlyPro ? 'TidyRow Pro Subscription' : 'Upgrade to TidyRow Pro'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#202522]/70 font-sans">
            Exactly two plans: <strong>Free ($0)</strong> and <strong>Pro ($5/month)</strong>. No hidden tiers or business commitments.
          </DialogDescription>
        </DialogHeader>

        {/* Highlight target feature if upgrade was triggered by an entitlement gate */}
        {featureInfo && !isCurrentlyPro && (
          <div className="my-3 p-3 rounded-xl bg-[#4D7CFE]/8 border border-[#4D7CFE]/25 text-xs font-sans space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#4D7CFE]">
              <Lock className="h-3.5 w-3.5" />
              <span>Feature Unlocked with Pro: {featureInfo.name}</span>
            </div>
            <p className="text-[#202522]/80 text-[11px] leading-relaxed">
              {featureInfo.description}
            </p>
          </div>
        )}

        {/* Plan Comparison Card */}
        <div className="my-4 rounded-xl border border-[#E5E5DE] bg-[#F7F5EF] p-4 space-y-3 font-sans">
          <div className="flex items-baseline justify-between border-b border-[#E5E5DE] pb-3">
            <div>
              <h4 className="font-bold text-base text-[#202522]">TidyRow Pro</h4>
              <p className="text-xs text-[#202522]/60">Full-power spreadsheet preparation</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-mono font-extrabold text-[#202522]">$5</span>
              <span className="text-xs text-[#202522]/60 font-sans"> / month</span>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>100,000 rows/file</strong> (vs 10,000 on Free)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>Natural-language cleaning plans</strong> before applying changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>Destination Readiness Packs</strong> (HubSpot, Salesforce, Shopify)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>5-Tier Entity Resolution</strong> & explainable fuzzy deduplication</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>Multi-file dataset merging</strong> with key conflict resolution</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-[#2F8F6B] shrink-0" />
              <span><strong>Change log audit CSV export</strong> for complete compliance</span>
            </div>
          </div>
        </div>

        {/* Provider Boundary Warning / Notice */}
        {providerNotice && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-sans flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block">Provider Integration Boundary:</strong>
              <p className="text-[11px] leading-relaxed">{providerNotice}</p>
            </div>
          </div>
        )}

        <DialogFooter className="mt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-[11px] text-[#202522]/50 font-sans">
            Current Plan: <span className="font-semibold capitalize text-[#202522]">{currentPlan}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-[#E5E5DE] cursor-pointer"
            >
              Close
            </Button>
            {!isCurrentlyPro && (
              <Button
                size="sm"
                onClick={handleUpgrade}
                disabled={isProcessing}
                className="text-xs font-semibold bg-[#4D7CFE] hover:bg-[#4D7CFE]/90 text-white gap-1.5 cursor-pointer shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isProcessing ? 'Connecting...' : 'Upgrade to Pro ($5/mo)'}</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
