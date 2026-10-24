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
  0: '#4ade80',
  1: '#5ea9ff',
  2: '#eaf2fb',
  3: '#8498b3',
  4: '#f5a524',
  5: '#c4b5fd',
};

const STATE_BG: Record<number, string> = {
  0: 'rgba(47,191,113,0.14)',
  1: 'rgba(94,169,255,0.14)',
  2: 'rgba(234,242,251,0.12)',
  3: 'rgba(132,152,179,0.14)',
  4: 'rgba(245,165,36,0.16)',
  5: 'rgba(167,139,250,0.16)',
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
        chainId: ARC_CHAIN_ID,
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
        { label: 'Funded', done: true, current: false, icon: Lock },
        { label: 'Refunded', done: true, current: false, icon: XCircle },
      ]
    : escrow.state >= 4
      ? [
          { label: 'Funded', done: true, current: false, icon: Lock },
          { label: 'Delivered', done: escrow.deliveredAt > 0n, current: false, icon: PackageCheck },
          { label: 'Disputed', done: true, current: escrow.state === 4, icon: Scale },
          { label: 'Resolved', done: escrow.state === 5, current: false, icon: Gavel },
        ]
      : [
          { label: 'Funded', done: true, current: escrow.state === 0, icon: Lock },
          { label: 'Delivered', done: escrow.state >= 1, current: escrow.state === 1, icon: PackageCheck },
          { label: 'Released', done: escrow.state === 2, current: false, icon: CheckCircle },
        ];
  const trackAmber = escrow.state >= 4;

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
          ? '0 8px 32px rgba(62,143,224,0.30)'
          : '0 10px 30px rgba(0,0,0,0.28)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="display font-semibold truncate text-base leading-tight" style={{ color: 'var(--ink)' }}>
            {escrow.title || `Escrow #${escrow.id.toString()}`}
          </p>
          <p className="mono mt-1 text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            #{escrow.id.toString()}{role ? ` · ${role}` : ''}
            {escrow.juryWindowSeconds > 0n && escrow.state < 4 ? ' · jury enabled' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={shareEscrow}
            title="Copy link to this escrow"
            className="rounded-lg p-1.5 transition hover:bg-white/10"
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

      {/* Route track */}
      <div className="mt-5 flex items-start" aria-label="Milestone track">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start" style={{ flex: i < steps.length - 1 ? '1 1 0%' : '0 0 auto' }}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex size-7 items-center justify-center rounded-full ${s.current ? 'station-live' : ''}`}
                style={{
                  background: s.done
                    ? trackAmber
                      ? 'linear-gradient(135deg,#f5a524,#b45309)'
                      : 'linear-gradient(135deg,#3e8fe0,#1061a6)'
                    : 'rgba(148,184,232,0.10)',
                  color: s.done ? '#fff' : 'var(--subtle)',
                  boxShadow: s.done ? '0 0 14px rgba(62,143,224,0.35)' : 'none',
                  border: s.done ? 'none' : '1px solid var(--border)',
                }}
              >
                <s.icon className="size-3.5" />
              </span>
              <span
                className="mono text-[9px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: s.done ? 'var(--ink-2)' : 'var(--subtle)' }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-1.5 mt-3.5 h-[3px] flex-1 rounded-full"
                style={{
                  background: steps[i + 1].done
                    ? trackAmber
                      ? 'linear-gradient(90deg,#f5a524,#b45309)'
                      : 'linear-gradient(90deg,#3e8fe0,#1061a6)'
                    : 'rgba(148,184,232,0.14)',
                }}
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
            background: deadlinePassed ? 'rgba(251,113,133,0.12)' : 'rgba(148,184,232,0.10)',
            color: deadlinePassed ? '#fda4af' : 'var(--ink-2)',
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
            background: reviewWindowPassed ? 'rgba(47,191,113,0.14)' : 'rgba(94,169,255,0.12)',
            color: reviewWindowPassed ? '#4ade80' : 'var(--accent-hover)',
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
          <button onClick={() => copyText(counterparty, 'Address copied')} title="Copy address" className="rounded p-0.5 transition hover:bg-white/10">
            <Copy className="size-3" />
          </button>
          {!isParty && (
            <span className="truncate font-mono">payee {formatAddress(escrow.payee)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: deadlinePassed && escrow.state === 0 ? '#fda4af' : 'var(--muted)' }}>
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
          style={{ background: 'rgba(245,165,36,0.07)', border: '1px solid rgba(245,165,36,0.32)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: '#fcd9a0' }}>
              <Scale className="size-4" /> Public jury
            </p>
            <span className="text-xs font-medium" style={{ color: '#fcd9a0' }}>
              {votingOpen
                ? `Voting closes in ${formatDuration(escrow.disputeEndsAt - now)}`
                : 'Voting closed — ready to settle'}
            </span>
          </div>

          {/* Tally bar */}
          <div className="mt-3">
            <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <div style={{ width: `${payeePct}%`, background: '#3e8fe0', transition: 'width .4s' }} />
              <div style={{ flex: 1, background: '#f5a524' }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs font-medium">
              <span style={{ color: '#5ea9ff' }}>Pay payee · {escrow.payeeVotes.toString()}</span>
              <span style={{ color: '#f5a524' }}>{escrow.payerVotes.toString()} · Refund payer</span>
            </div>
          </div>

          {/* Evidence */}
          <div className="mt-3 space-y-1.5">
            <p className="mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#fcd9a0' }}>Evidence on chain</p>
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
                  style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--ink)' }}
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
              <p className="flex items-center gap-1 text-xs font-medium" style={{ color: '#4ade80' }}>
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
        <div className="mt-3 rounded-2xl px-3.5 py-2.5 text-xs" style={{ background: 'rgba(167,139,250,0.10)', color: '#c4b5fd' }}>
          <span className="flex items-center gap-1.5 font-medium">
            <Gavel className="size-3.5" />
            Settled by public jury — {escrow.payeeVotes.toString()} votes for payee, {escrow.payerVotes.toString()} for payer.
          </span>
        </div>
      )}

      {(escrow.state === 2 || escrow.state === 3) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {escrow.state === 2
            ? <><CheckCircle className="size-3.5" style={{ color: '#4ade80' }} /> Payment released to payee</>
            : <><XCircle className="size-3.5" style={{ color: '#fda4af' }} /> Refunded to payer</>
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
    success: { bg: 'rgba(47,191,113,0.14)', text: '#4ade80' },
    danger: { bg: 'rgba(251,113,133,0.12)', text: '#fda4af' },
    warn: { bg: 'rgba(245,165,36,0.14)', text: '#fcd9a0' },
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
