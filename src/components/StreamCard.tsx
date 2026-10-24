import { useMemo } from 'react';
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain,
} from 'wagmi';
import { useState } from 'react';
import { Loader2, ExternalLink, CalendarClock, HandCoins, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Amount, formatAmount } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { MILEPAY_ESCROW, ARC_CHAIN_ID } from '@/contract';
import { useNow, formatDuration } from '@/hooks';
import type { StreamData } from '@/types';

interface Props {
  stream: StreamData;
  onAction: () => void;
}

function fmt(raw: bigint) {
  return formatAmount(ARC_CHAIN_ID, Amount.fromRaw(raw, 6));
}

function formatPeriod(seconds: bigint) {
  const s = Number(seconds);
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export default function StreamCard({ stream, onAction }: Props) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = chainId !== ARC_CHAIN_ID;
  const isPayer = address?.toLowerCase() === stream.payer.toLowerCase();
  const isPayee = address?.toLowerCase() === stream.payee.toLowerCase();

  const now = useNow(1000);
  const total = stream.amountPerPeriod * stream.totalPeriods;
  const claimedAmt = stream.amountPerPeriod * stream.claimedPeriods;
  const nextVestAt = stream.startTime + (stream.claimedPeriods + stream.claimablePeriods + 1n) * stream.periodSeconds;
  const fullyClaimed = stream.claimedPeriods >= stream.totalPeriods;
  const active = !stream.cancelled && !fullyClaimed;

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [activeAction, setActiveAction] = useState<string | null>(null);

  if (isSuccess && activeAction) {
    toast.success(`Done: ${activeAction}`, {
      description: txHash ? (
        <a href={buildTxExplorerUrl(ARC_CHAIN_ID, txHash)} target="_blank" rel="noreferrer" className="underline">
          View on ArcScan
        </a>
      ) : undefined,
    });
    reset();
    setActiveAction(null);
    onAction();
  }

  const call = (functionName: string, label: string) => {
    if (wrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID });
      return;
    }
    setActiveAction(label);
    writeContract({
      address: MILEPAY_ESCROW.address,
      abi: MILEPAY_ESCROW.abi,
      functionName,
      args: [stream.id],
    } as never);
  };

  const isBusy = isPending || confirming;
  const segments = useMemo(() => {
    const n = Number(stream.totalPeriods);
    return Array.from({ length: n }, (_, i) => {
      const claimed = BigInt(i) < stream.claimedPeriods;
      const vested = BigInt(i) < stream.vestedCap;
      return { claimed, vested };
    });
  }, [stream.totalPeriods, stream.claimedPeriods, stream.vestedCap]);

  const status = stream.cancelled
    ? { label: 'Cancelled', color: 'var(--danger)', bg: 'rgba(186,43,76,0.10)' }
    : fullyClaimed
      ? { label: 'Completed', color: 'var(--success)', bg: 'rgba(26,128,71,0.12)' }
      : stream.claimablePeriods > 0n
        ? { label: `${stream.claimablePeriods.toString()} period ready`, color: 'var(--accent-hover)', bg: 'rgba(16,97,166,0.10)' }
        : { label: 'Vesting', color: 'var(--ink-2)', bg: 'rgba(18,45,69,0.07)' };

  return (
    <div
      className="rounded-3xl p-4 sm:p-5"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(18,45,69,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="display truncate text-base font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
            {stream.title || `Payroll #${stream.id.toString()}`}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Stream #{stream.id.toString()} · {formatPeriod(stream.periodSeconds)} per period ·{' '}
            {isPayer ? 'You pay' : isPayee ? 'You get paid' : 'Payroll stream'}
          </p>
        </div>
        <span className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: status.bg, color: status.color }}>
          {status.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {fmt(stream.amountPerPeriod)}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>
          USDC × {stream.totalPeriods.toString()} periods · total {fmt(total)}
        </span>
      </div>

      {/* Segmented vesting bar */}
      <div className="mt-4 flex gap-1" aria-label="Vesting progress">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="h-2.5 flex-1 rounded-full"
            style={{
              background: seg.claimed
                ? 'var(--success)'
                : seg.vested
                  ? 'var(--accent)'
                  : 'rgba(18,45,69,0.10)',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span>Claimed {fmt(claimedAmt)} USDC ({stream.claimedPeriods.toString()}/{stream.totalPeriods.toString()})</span>
        {active && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" />
            {stream.claimablePeriods > 0n
              ? 'Ready to claim'
              : `Next vest in ${formatDuration(nextVestAt - now)}`}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {isPayee && active && stream.claimablePeriods > 0n && (
          <button
            onClick={() => call('claimInstallment', 'payroll claimed')}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-85 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <HandCoins className="size-3.5" />}
            Claim {fmt(stream.amountPerPeriod * stream.claimablePeriods)} USDC
          </button>
        )}
        {isPayer && active && (
          <button
            onClick={() => call('cancelStream', 'stream cancelled — unvested refunded')}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition hover:opacity-80 active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(186,43,76,0.10)', color: 'var(--danger)' }}
          >
            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
            Cancel & refund unvested
          </button>
        )}
        {txHash && (
          <a
            href={buildTxExplorerUrl(ARC_CHAIN_ID, txHash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 self-center text-xs hover:underline"
            style={{ color: 'var(--accent-hover)' }}
          >
            <ExternalLink className="size-3" /> View last tx
          </a>
        )}
      </div>
    </div>
  );
}
