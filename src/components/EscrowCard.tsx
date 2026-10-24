import { useState, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { Loader2, ExternalLink, Clock, CheckCircle, XCircle, ArrowRightCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Amount, formatAmount } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { MILEPAY_ESCROW, ARC_TESTNET_CHAIN_ID } from '@/contract';
import type { EscrowData } from '@/types';

interface Props {
  escrow: EscrowData;
  onAction: () => void;
}

const STATE_LABELS: Record<number, string> = {
  0: 'Funded',
  1: 'Delivered',
  2: 'Released',
  3: 'Refunded',
};

const STATE_COLORS: Record<number, string> = {
  0: '#1a8047',   // success green (funded = active)
  1: '#1061a6',   // accent-hover blue (delivered, awaiting review)
  2: '#122d45',   // ink (released/done)
  3: '#6b6580',   // muted (refunded/cancelled)
};

const STATE_BG: Record<number, string> = {
  0: 'rgba(26,128,71,0.10)',
  1: 'rgba(16,97,166,0.10)',
  2: 'rgba(18,45,69,0.10)',
  3: 'rgba(107,101,128,0.10)',
};

function formatAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatDeadline(ts: bigint) {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function EscrowCard({ escrow, onAction }: Props) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = chainId !== ARC_TESTNET_CHAIN_ID;

  const isPayer = address?.toLowerCase() === escrow.payer.toLowerCase();
  const isPayee = address?.toLowerCase() === escrow.payee.toLowerCase();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), []);
  const deadlinePassed = now > escrow.deadline;
  const reviewWindowPassed =
    escrow.state === 1 && escrow.deliveredAt > 0n &&
    now > escrow.deliveredAt + escrow.reviewWindowSeconds;

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const [activeAction, setActiveAction] = useState<string | null>(null);

  if (isSuccess && activeAction) {
    toast.success(`Escrow ${activeAction}!`, {
      description: txHash ? (
        <a href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, txHash)} target="_blank" rel="noreferrer" className="underline">
          View on ArcScan
        </a>
      ) : undefined,
    });
    reset();
    setActiveAction(null);
    onAction();
  }

  const runAction = (fn: () => void, label: string) => {
    if (wrongChain) {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
      return;
    }
    setActiveAction(label);
    fn();
  };

  const handleMarkDelivered = () =>
    runAction(
      () => writeContract({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'markDelivered',
        args: [escrow.id],
      }),
      'delivered'
    );

  const handleRelease = () =>
    runAction(
      () => writeContract({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'release',
        args: [escrow.id],
      }),
      'released'
    );

  const handleRefund = () =>
    runAction(
      () => writeContract({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'refund',
        args: [escrow.id],
      }),
      'refunded'
    );

  const handleClaim = () =>
    runAction(
      () => writeContract({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'claimAfterReview',
        args: [escrow.id],
      }),
      'claimed'
    );

  const isBusy = isPending || confirming;

  const counterparty = isPayer ? escrow.payee : escrow.payer;
  const counterpartyLabel = isPayer ? 'Payee' : 'Payer';
  const role = isPayer ? 'Payer' : 'Payee';

  const formattedAmount = useMemo(
    () => formatAmount(ARC_TESTNET_CHAIN_ID, Amount.fromRaw(escrow.amount, 6)),
    [escrow.amount],
  );

  return (
    <div
      className="rounded-2xl p-4 transition"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(18,45,69,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="display font-semibold truncate text-sm leading-tight" style={{ color: 'var(--ink)' }}>
            {escrow.title || `Escrow #${escrow.id.toString()}`}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            #{escrow.id.toString()} · {role}
          </p>
        </div>
        <span
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
          style={{
            background: STATE_BG[escrow.state],
            color: STATE_COLORS[escrow.state],
          }}
        >
          {STATE_LABELS[escrow.state]}
        </span>
      </div>

      {/* Amount */}
      <div className="mt-3 flex items-baseline gap-1">
        <span className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {formattedAmount}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <ArrowRightCircle className="size-3.5 shrink-0" />
          <span>
            {counterpartyLabel}:{' '}
            <a
              href={`https://explorer.testnet.arc.io/address/${counterparty}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:underline"
            >
              {formatAddress(counterparty)}
            </a>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: deadlinePassed && escrow.state === 0 ? 'var(--danger)' : 'var(--muted)' }}>
          <Clock className="size-3.5 shrink-0" />
          <span>Deadline: {formatDeadline(escrow.deadline)}</span>
        </div>
        {escrow.state === 1 && escrow.deliveredAt > 0n && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <CheckCircle className="size-3.5 shrink-0" />
            <span>Delivered: {formatDeadline(escrow.deliveredAt)}</span>
          </div>
        )}
        {txHash && (
          <a
            href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, txHash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--accent-hover)' }}
          >
            <ExternalLink className="size-3" /> View last tx
          </a>
        )}
      </div>

      {/* Actions */}
      {(escrow.state === 0 || escrow.state === 1) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Mark delivered — payee, state Funded */}
          {isPayee && escrow.state === 0 && (
            <ActionBtn
              label="Mark Delivered"
              busy={isBusy}
              onClick={handleMarkDelivered}
              variant="primary"
            />
          )}
          {/* Release — payer, state Funded or Delivered */}
          {isPayer && (escrow.state === 0 || escrow.state === 1) && (
            <ActionBtn
              label="Release"
              busy={isBusy}
              onClick={handleRelease}
              variant="success"
            />
          )}
          {/* Refund — payer, state Funded, after deadline */}
          {isPayer && escrow.state === 0 && (
            <ActionBtn
              label={deadlinePassed ? 'Refund' : 'Refund (after deadline)'}
              busy={isBusy}
              disabled={!deadlinePassed}
              onClick={handleRefund}
              variant="danger"
            />
          )}
          {/* Claim after review — payee, state Delivered, after window */}
          {isPayee && escrow.state === 1 && (
            <ActionBtn
              label={reviewWindowPassed ? 'Claim' : 'Claim (after review window)'}
              busy={isBusy}
              disabled={!reviewWindowPassed}
              onClick={handleClaim}
              variant="success"
            />
          )}
        </div>
      )}

      {(escrow.state === 2 || escrow.state === 3) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {escrow.state === 2
            ? <><CheckCircle className="size-3.5" style={{ color: 'var(--success)' }} /> Payment released</>
            : <><XCircle className="size-3.5" style={{ color: 'var(--danger)' }} /> Refunded to payer</>
          }
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  busy,
  disabled,
  onClick,
  variant,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant: 'primary' | 'success' | 'danger';
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--accent)', text: '#fff' },
    success: { bg: 'rgba(26,128,71,0.12)', text: 'var(--success)' },
    danger: { bg: 'rgba(186,43,76,0.10)', text: 'var(--danger)' },
  };
  const c = colors[variant];
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: c.bg, color: c.text }}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {label}
    </button>
  );
}
