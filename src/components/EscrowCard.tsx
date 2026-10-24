import { useState, useMemo, useEffect } from 'react';
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, usePublicClient,
} from 'wagmi';
import {
  Loader2, ExternalLink, Clock, CheckCircle, XCircle, ArrowRightCircle,
  Copy, Share2, Timer, PackageCheck, Lock, Scale, Vote, FileText, Gavel,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseAbiItem } from 'viem';
import { Amount, formatAmount } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { MILEPAY_ESCROW, ARC_CHAIN_ID, V2_DEPLOY_BLOCK } from '@/contract';
import { useNow, formatDuration } from '@/hooks';
import type { EscrowData } from '@/types';

interface Props {
  escrow: EscrowData;
  onAction: () => void;
  highlighted?: boolean;
}

const STATE_LABELS: Record<number, string> = {
  0: 'Funded',
  1: 'Delivered',
  2: 'Released',
  3: 'Refunded',
  4: 'In dispute',
  5: 'Jury resolved',
};

const STATE_COLORS: Record<number, string> = {
  0: '#1a8047',
  1: '#1061a6',
  2: '#122d45',
  3: '#6b6580',
  4: '#b45309',
  5: '#5b21b6',
};

const STATE_BG: Record<number, string> = {
  0: 'rgba(26,128,71,0.10)',
  1: 'rgba(16,97,166,0.10)',
  2: 'rgba(18,45,69,0.10)',
  3: 'rgba(107,101,128,0.10)',
  4: 'rgba(217,119,6,0.13)',
  5: 'rgba(124,58,237,0.10)',
};

const EVIDENCE_EVENT = parseAbiItem('event EvidenceSubmitted(uint256 indexed id, address indexed party, string uri)');

function formatAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatWhen(ts: bigint) {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface Evidence {
  party: string;
  uri: string;
}

export default function EscrowCard({ escrow, onAction, highlighted }: Props) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const wrongChain = chainId !== ARC_CHAIN_ID;

  const isPayer = address?.toLowerCase() === escrow.payer.toLowerCase();
  const isPayee = address?.toLowerCase() === escrow.payee.toLowerCase();
  const isParty = isPayer || isPayee;

  const now = useNow(1000);
  const deadlinePassed = now > escrow.deadline;
  const reviewEndsAt = escrow.deliveredAt + escrow.reviewWindowSeconds;
  const reviewWindowPassed =
    escrow.state === 1 && escrow.deliveredAt > 0n && now > reviewEndsAt;
  const votingOpen = escrow.state === 4 && now <= escrow.disputeEndsAt;
  const votingClosed = escrow.state === 4 && now > escrow.disputeEndsAt;

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [evidenceUri, setEvidenceUri] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [hasVotedHere, setHasVotedHere] = useState(false);

  // Load evidence + my vote state while disputed
  useEffect(() => {
    if (escrow.state !== 4 || !publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const logs = await publicClient.getLogs({
          address: MILEPAY_ESCROW.address,
          event: EVIDENCE_EVENT,
          args: { id: escrow.id },
          fromBlock: V2_DEPLOY_BLOCK,
          toBlock: 'latest',
        });
        if (!cancelled) {
          setEvidence(logs.map((l) => ({ party: l.args.party as string, uri: l.args.uri as string })));
        }
      } catch {
        /* evidence display is best-effort; submission always works */
      }
      if (address) {
        try {
          const v = await publicClient.readContract({
            address: MILEPAY_ESCROW.address,
            abi: MILEPAY_ESCROW.abi,
            functionName: 'hasVoted',
            args: [escrow.id, address],
          });
          if (!cancelled) setHasVotedHere(Boolean(v));
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [escrow.state, escrow.id, publicClient, address, txHash]);

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

  const run = (fn: () => void, label: string) => {
    if (wrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID });
      return;
    }
    setActiveAction(label);
    fn();
  };

  const call = (functionName: string, args: unknown[], label: string) =>
    run(
      () => writeContract({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName,
        args,
      } as never),
      label
    );

  const isBusy = isPending || confirming;

  const counterparty = isPayer ? escrow.payee : escrow.payer;
  const counterpartyLabel = isPayer ? 'Payee' : isPayee ? 'Payer' : 'Payer';
  const role = isPayer ? 'You pay' : isPayee ? 'You get paid' : null;

  const formattedAmount = useMemo(
    () => formatAmount(ARC_CHAIN_ID, Amount.fromRaw(escrow.amount, 6)),
    [escrow.amount],
  );

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error('Copy failed');
    }
  };

  const shareEscrow = () =>
    copyText(
      `${window.location.origin}${window.location.pathname}?escrow=${escrow.id.toString()}`,
      'Link copied — send it to your counterparty'
    );

  const steps = escrow.state === 3
    ? [
        { label: 'Funded', done: true, icon: Lock },
        { label: 'Refunded', done: true, icon: XCircle },
      ]
    : escrow.state >= 4
      ? [
          { label: 'Funded', done: true, icon: Lock },
          { label: 'Delivered', done: escrow.deliveredAt > 0n, icon: PackageCheck },
          { label: 'Disputed', done: true, icon: Scale },
          { label: 'Resolved', done: escrow.state === 5, icon: Gavel },
        ]
      : [
          { label: 'Funded', done: true, icon: Lock },
          { label: 'Delivered', done: escrow.state >= 1, icon: PackageCheck },
          { label: 'Released', done: escrow.state === 2, icon: CheckCircle },
        ];

  const totalVotes = escrow.payeeVotes + escrow.payerVotes;
  const payeePct = totalVotes === 0n ? 50 : Number((escrow.payeeVotes * 100n) / totalVotes);

  return (
    <div
      id={`escrow-${escrow.id.toString()}`}
      className="rounded-3xl p-4 sm:p-5 transition scroll-mt-24"
      style={{
        background: 'var(--surface-strong)',
        border: highlighted ? '2px solid var(--accent-hover)' : '1px solid var(--border)',
        boxShadow: highlighted
          ? '0 8px 32px rgba(16,97,166,0.18)'
          : '0 1px 4px rgba(18,45,69,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="display font-semibold truncate text-base leading-tight" style={{ color: 'var(--ink)' }}>
            {escrow.title || `Escrow #${escrow.id.toString()}`}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            #{escrow.id.toString()}{role ? ` · ${role}` : ''}
            {escrow.juryWindowSeconds > 0n && escrow.state < 4 ? ' · jury enabled' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={shareEscrow}
            title="Copy link to this escrow"
            className="rounded-lg p-1.5 transition hover:bg-black/5"
            style={{ color: 'var(--muted)' }}
          >
            <Share2 className="size-3.5" />
          </button>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ background: STATE_BG[escrow.state], color: STATE_COLORS[escrow.state] }}
          >
            {STATE_LABELS[escrow.state]}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {formattedAmount}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>

      {/* Timeline */}
      <div className="mt-4 flex items-center" aria-label="Escrow progress">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center" style={{ flex: i < steps.length - 1 ? '1 1 0%' : '0 0 auto' }}>
            <div className="flex flex-col items-center gap-1">
              <span
                className="flex size-6 items-center justify-center rounded-full"
                style={{
                  background: s.done ? 'var(--accent)' : 'rgba(18,45,69,0.10)',
                  color: s.done ? '#fff' : 'var(--subtle)',
                }}
              >
                <s.icon className="size-3" />
              </span>
              <span className="text-[10px] font-medium" style={{ color: s.done ? 'var(--ink-2)' : 'var(--subtle)' }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-1.5 mb-4 h-0.5 flex-1 rounded"
                style={{ background: steps[i + 1].done ? 'var(--accent)' : 'rgba(18,45,69,0.12)' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Countdown chips */}
      {escrow.state === 0 && (
        <div
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            background: deadlinePassed ? 'rgba(186,43,76,0.10)' : 'rgba(18,45,69,0.06)',
            color: deadlinePassed ? 'var(--danger)' : 'var(--ink-2)',
          }}
        >
          <Timer className="size-3.5" />
          {deadlinePassed
            ? 'Deadline passed — payer can refund'
            : `Delivery deadline in ${formatDuration(escrow.deadline - now)}`}
        </div>
      )}
      {escrow.state === 1 && (
        <div
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            background: reviewWindowPassed ? 'rgba(26,128,71,0.12)' : 'rgba(16,97,166,0.10)',
            color: reviewWindowPassed ? 'var(--success)' : 'var(--accent-hover)',
          }}
        >
          <Timer className="size-3.5" />
          {reviewWindowPassed
            ? 'Review window over — payee can claim'
            : `Review window ends in ${formatDuration(reviewEndsAt - now)}`}
        </div>
      )}

      {/* Details */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          <ArrowRightCircle className="size-3.5 shrink-0" />
          <span className="truncate">
            {counterpartyLabel}:{' '}
            <a
              href={`https://explorer.arc.io/address/${counterparty}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:underline"
            >
              {formatAddress(counterparty)}
            </a>
          </span>
          <button onClick={() => copyText(counterparty, 'Address copied')} title="Copy address" className="rounded p-0.5 transition hover:bg-black/5">
            <Copy className="size-3" />
          </button>
          {!isParty && (
            <span className="truncate font-mono">payee {formatAddress(escrow.payee)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: deadlinePassed && escrow.state === 0 ? 'var(--danger)' : 'var(--muted)' }}>
          <Clock className="size-3.5 shrink-0" />
          <span>Deadline: {formatWhen(escrow.deadline)}</span>
        </div>
        {escrow.deliveredAt > 0n && escrow.state >= 1 && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <CheckCircle className="size-3.5 shrink-0" />
            <span>Delivered: {formatWhen(escrow.deliveredAt)}</span>
          </div>
        )}
        {txHash && (
          <a
            href={buildTxExplorerUrl(ARC_CHAIN_ID, txHash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--accent-hover)' }}
          >
            <ExternalLink className="size-3" /> View last tx
          </a>
        )}
      </div>

      {/* Standard actions */}
      {(escrow.state === 0 || escrow.state === 1) && isParty && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isPayee && escrow.state === 0 && (
            <ActionBtn label="Mark Delivered" busy={isBusy} onClick={() => call('markDelivered', [escrow.id], 'delivered')} variant="primary" />
          )}
          {isPayer && (
            <ActionBtn label="Release" busy={isBusy} onClick={() => call('release', [escrow.id], 'released')} variant="success" />
          )}
          {isPayer && escrow.state === 0 && (
            <ActionBtn
              label={deadlinePassed ? 'Refund' : 'Refund (after deadline)'}
              busy={isBusy}
              disabled={!deadlinePassed}
              onClick={() => call('refund', [escrow.id], 'refunded')}
              variant="danger"
            />
          )}
          {isPayee && escrow.state === 1 && (
            <ActionBtn
              label={reviewWindowPassed ? 'Claim' : 'Claim (after review window)'}
              busy={isBusy}
              disabled={!reviewWindowPassed}
              onClick={() => call('claimAfterReview', [escrow.id], 'claimed')}
              variant="success"
            />
          )}
          {escrow.juryWindowSeconds > 0n && (
            <ActionBtn
              label="Raise dispute"
              busy={isBusy}
              onClick={() => call('raiseDispute', [escrow.id], 'dispute raised — jury is voting')}
              variant="warn"
            />
          )}
        </div>
      )}

      {/* Jury panel */}
      {escrow.state === 4 && (
        <div
          className="mt-4 rounded-2xl p-4"
          style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: '#92400e' }}>
              <Scale className="size-4" /> Public jury
            </p>
            <span className="text-xs font-medium" style={{ color: '#92400e' }}>
              {votingOpen
                ? `Voting closes in ${formatDuration(escrow.disputeEndsAt - now)}`
                : 'Voting closed — ready to settle'}
            </span>
          </div>

          {/* Tally bar */}
          <div className="mt-3">
            <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(18,45,69,0.10)' }}>
              <div style={{ width: `${payeePct}%`, background: '#1061a6', transition: 'width .4s' }} />
              <div style={{ flex: 1, background: '#d97706' }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs font-medium">
              <span style={{ color: '#1061a6' }}>Pay payee · {escrow.payeeVotes.toString()}</span>
              <span style={{ color: '#b45309' }}>{escrow.payerVotes.toString()} · Refund payer</span>
            </div>
          </div>

          {/* Evidence */}
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#92400e' }}>Evidence on chain</p>
            {evidence.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {isParty ? 'No evidence submitted yet — add yours below.' : 'No evidence links published yet.'}
              </p>
            ) : (
              evidence.map((e, i) => (
                <p key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
                  <FileText className="size-3.5 shrink-0" />
                  <span className="font-mono">{e.party.toLowerCase() === escrow.payee.toLowerCase() ? 'Payee' : 'Payer'}:</span>
                  <a href={e.uri} target="_blank" rel="noreferrer" className="truncate hover:underline" style={{ color: 'var(--accent-hover)' }}>
                    {e.uri}
                  </a>
                </p>
              ))
            )}
            {isParty && votingOpen && (
              <div className="flex gap-1.5 pt-1">
                <input
                  value={evidenceUri}
                  onChange={(e) => setEvidenceUri(e.target.value)}
                  placeholder="Evidence link (IPFS / URL)"
                  className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.8)', color: 'var(--ink)' }}
                />
                <button
                  disabled={isBusy || !evidenceUri.trim()}
                  onClick={() => call('submitEvidence', [escrow.id, evidenceUri.trim()], 'evidence submitted')}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#b45309' }}
                >
                  Submit
                </button>
              </div>
            )}
          </div>

          {/* Voting */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!address ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Connect a wallet to vote.</p>
            ) : isParty ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Parties can't vote in their own dispute.</p>
            ) : hasVotedHere ? (
              <p className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
                <Vote className="size-3.5" /> Your vote is in.
              </p>
            ) : votingOpen ? (
              <>
                <ActionBtn label="Vote: pay the payee" busy={isBusy} onClick={() => call('vote', [escrow.id, true], 'voted for payee')} variant="primary" />
                <ActionBtn label="Vote: refund the payer" busy={isBusy} onClick={() => call('vote', [escrow.id, false], 'voted for payer')} variant="warn" />
              </>
            ) : null}
            {votingClosed && (
              <ActionBtn label="Settle by jury verdict" busy={isBusy} onClick={() => call('resolveDispute', [escrow.id], 'jury verdict settled')} variant="success" />
            )}
          </div>
        </div>
      )}

      {escrow.state === 5 && (
        <div className="mt-3 rounded-2xl px-3.5 py-2.5 text-xs" style={{ background: 'rgba(124,58,237,0.08)', color: '#5b21b6' }}>
          <span className="flex items-center gap-1.5 font-medium">
            <Gavel className="size-3.5" />
            Settled by public jury — {escrow.payeeVotes.toString()} votes for payee, {escrow.payerVotes.toString()} for payer.
          </span>
        </div>
      )}

      {(escrow.state === 2 || escrow.state === 3) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {escrow.state === 2
            ? <><CheckCircle className="size-3.5" style={{ color: 'var(--success)' }} /> Payment released to payee</>
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
  variant: 'primary' | 'success' | 'danger' | 'warn';
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--accent)', text: '#fff' },
    success: { bg: 'rgba(26,128,71,0.12)', text: 'var(--success)' },
    danger: { bg: 'rgba(186,43,76,0.10)', text: 'var(--danger)' },
    warn: { bg: 'rgba(217,119,6,0.14)', text: '#92400e' },
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
