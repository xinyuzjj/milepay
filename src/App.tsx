import { useState, useMemo, useEffect } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useReadContracts } from 'wagmi';
import {
  Plus, ShieldCheck, ExternalLink, Copy, Eye, Scale, CalendarClock,
  Bot, Landmark, Lock, PackageCheck, Vote, Code2, ArrowUpRight,
  Wallet, CircleDollarSign, Milestone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Amount, formatAmount } from '@/onchain-money';
import { MILEPAY_ESCROW, MILEPAY_ESCROW_V1, ARC_CHAIN_ID } from '@/contract';
import EscrowCard from '@/components/EscrowCard';
import StreamCard from '@/components/StreamCard';
import CreateEscrowSheet from '@/components/CreateEscrowSheet';
import CreateStreamSheet from '@/components/CreateStreamSheet';
import type { EscrowData, StreamData } from '@/types';

const EXPLORER = 'https://explorer.arc.io';
const STUDIO_URL = 'https://studio.arc.io/app/810ab724-d29a-4b75-98e1-3c3dfe1105e5';
const REPO_URL = 'https://github.com/xinyuzjj/milepay';

const PROOF = [
  {
    label: 'V2 jury verdict',
    detail: '3 public jurors voted 2:1 — payee paid in full',
    tx: '0x09b325ebf476b72287bc44f865c7226ca256357922676cb3dc4b8514df282a4b',
  },
  {
    label: 'Agent hires agent',
    detail: 'Two AI agents settled a paid job with zero human clicks',
    tx: '0xbd241ad88a51226eb184f90c461d3b2b19cfa982b31c2f74d33d67b563609451',
  },
  {
    label: 'Payroll stream',
    detail: 'Period vested, claimed, remainder refunded on cancel',
    tx: '0x60dc8ab5e77d69cd9a639e6120c148014af06079ed7e2466e30f91f6fab619a3',
  },
  {
    label: 'V1 milestone release',
    detail: 'First mainnet escrow: delivered, reviewed, released',
    tx: '0x9fca4d5d90f6fc9d2605fab7435d7941075984370013d4730fc57d90b074afd7',
  },
];

const AGENT_TXS = [
  { label: 'HirerAgent funds the job escrow', tx: '0x5ceebe11e722a0564f446db1e9eaee80e290064c41230d1f15e3dd6fc194b463' },
  { label: 'WorkerAgent delivers the result', tx: '0x4ff2dfabd6f0f39ba87d7ec416d61d73d539aaac0883bde80bcbe321aae786d2' },
  { label: 'HirerAgent verifies & releases', tx: '0xbd241ad88a51226eb184f90c461d3b2b19cfa982b31c2f74d33d67b563609451' },
];

type Tab = 'escrows' | 'payroll' | 'agents';
type Filter = 'all' | 'mine' | 'active' | 'disputed' | 'settled';

function shortAddr(a: string) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

async function copyText(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  } catch {
    toast.error('Copy failed');
  }
}

export default function App() {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>('escrows');
  const [filter, setFilter] = useState<Filter>('all');
  const [createEscrowOpen, setCreateEscrowOpen] = useState(false);
  const [createStreamOpen, setCreateStreamOpen] = useState(false);

  const { data: countData, refetch: refetchCount } = useReadContracts({
    contracts: [
      { chainId: ARC_CHAIN_ID, address: MILEPAY_ESCROW.address, abi: MILEPAY_ESCROW.abi, functionName: 'escrowCount' },
      { chainId: ARC_CHAIN_ID, address: MILEPAY_ESCROW.address, abi: MILEPAY_ESCROW.abi, functionName: 'streamCount' },
    ],
  });
  const escrowCount = (countData?.[0]?.result as bigint | undefined) ?? 0n;
  const streamCount = (countData?.[1]?.result as bigint | undefined) ?? 0n;

  const escrowCalls = useMemo(() => {
    const n = Number(escrowCount);
    return Array.from({ length: n }, (_, i) => ({
      chainId: ARC_CHAIN_ID,
      address: MILEPAY_ESCROW.address,
      abi: MILEPAY_ESCROW.abi,
      functionName: 'getEscrow',
      args: [BigInt(i + 1)],
    }));
  }, [escrowCount]);

  const { data: escrowResults, refetch: refetchEscrows, isLoading } = useReadContracts({
    contracts: escrowCalls,
    query: { enabled: escrowCount > 0n },
  });

  const streamCalls = useMemo(() => {
    const n = Number(streamCount);
    const calls = [];
    for (let i = 1; i <= n; i++) {
      calls.push({
        chainId: ARC_CHAIN_ID,
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'getStream',
        args: [BigInt(i)],
      });
      calls.push({
        chainId: ARC_CHAIN_ID,
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'claimablePeriods',
        args: [BigInt(i)],
      });
    }
    return calls;
  }, [streamCount]);

  const { data: streamResults, refetch: refetchStreams } = useReadContracts({
    contracts: streamCalls,
    query: { enabled: streamCount > 0n },
  });

  const escrows = useMemo<EscrowData[]>(() => {
    if (!escrowResults) return [];
    return escrowResults
      .map((r, i) => {
        if (r.status !== 'success' || !r.result) return null;
        const t = r.result as unknown as Record<string, unknown>;
        return {
          id: BigInt(i + 1),
          payer: t.payer as string,
          payee: t.payee as string,
          amount: t.amount as bigint,
          deadline: t.deadline as bigint,
          reviewWindowSeconds: t.reviewWindowSeconds as bigint,
          deliveredAt: t.deliveredAt as bigint,
          juryWindowSeconds: t.juryWindowSeconds as bigint,
          disputeEndsAt: t.disputeEndsAt as bigint,
          payeeVotes: t.payeeVotes as bigint,
          payerVotes: t.payerVotes as bigint,
          state: Number(t.state),
          title: t.title as string,
        } as EscrowData;
      })
      .filter((e): e is EscrowData => e !== null)
      .reverse();
  }, [escrowResults]);

  const streams = useMemo<StreamData[]>(() => {
    if (!streamResults) return [];
    const out: StreamData[] = [];
    for (let i = 0; i < streamResults.length; i += 2) {
      const g = streamResults[i];
      const c = streamResults[i + 1];
      if (g.status !== 'success' || !g.result) continue;
      const t = g.result as unknown as Record<string, unknown>;
      out.push({
        id: BigInt(i / 2 + 1),
        payer: t.payer as string,
        payee: t.payee as string,
        amountPerPeriod: t.amountPerPeriod as bigint,
        periodSeconds: t.periodSeconds as bigint,
        totalPeriods: t.totalPeriods as bigint,
        claimedPeriods: t.claimedPeriods as bigint,
        startTime: t.startTime as bigint,
        cancelled: t.cancelled as boolean,
        vestedCap: t.vestedCap as bigint,
        title: t.title as string,
        claimablePeriods: c.status === 'success' ? (c.result as bigint) : 0n,
      });
    }
    return out.reverse();
  }, [streamResults]);

  const stats = useMemo(() => {
    let locked = 0n;
    let settled = 0n;
    let volume = 0n;
    for (const e of escrows) {
      volume += e.amount;
      if (e.state === 0 || e.state === 1 || e.state === 4) locked += e.amount;
      if (e.state === 2 || e.state === 5) settled += e.amount;
    }
    let streamLocked = 0n;
    for (const s of streams) {
      if (!s.cancelled) {
        streamLocked += s.amountPerPeriod * (s.totalPeriods - s.claimedPeriods);
      }
    }
    const fmt = (v: bigint) => formatAmount(ARC_CHAIN_ID, Amount.fromRaw(v, 6));
    return {
      escrows: escrows.length,
      locked: fmt(locked + streamLocked),
      settled: fmt(settled),
      volume: fmt(volume),
      streams: streams.length,
    };
  }, [escrows, streams]);

  const disputed = escrows.filter((e) => e.state === 4);

  const visible = useMemo(() => {
    const me = address?.toLowerCase();
    switch (filter) {
      case 'mine':
        return me
          ? escrows.filter((e) => e.payer.toLowerCase() === me || e.payee.toLowerCase() === me)
          : [];
      case 'active':
        return escrows.filter((e) => e.state === 0 || e.state === 1);
      case 'disputed':
        return escrows.filter((e) => e.state === 4 || e.state === 5);
      case 'settled':
        return escrows.filter((e) => e.state === 2 || e.state === 3 || e.state === 5);
      default:
        return escrows;
    }
  }, [escrows, filter, address]);

  const refreshAll = () => {
    refetchCount();
    refetchEscrows();
    refetchStreams();
  };

  // Deep link: ?escrow=N scrolls to and highlights that escrow
  const highlightId = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('escrow');
    return v && /^\d+$/.test(v) ? v : null;
  }, []);
  useEffect(() => {
    if (!highlightId || escrows.length === 0) return;
    const t = setTimeout(() => {
      document
        .getElementById(`escrow-${highlightId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    return () => clearTimeout(t);
  }, [highlightId, escrows.length]);

  return (
    <div className="relative min-h-dvh overflow-x-clip" style={{ background: 'var(--bg-gradient)', backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{ background: 'rgba(5,11,22,0.82)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-9 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: 'conic-gradient(from 210deg, #5ea9ff, #1061a6 45%, #0a2c50 70%, #5ea9ff)' }}
              />
              <span className="display relative text-base font-bold text-white">M</span>
            </span>
            <div className="leading-tight">
              <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>MilePay</p>
              <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>Milestone escrow · Arc</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex"
              style={{ background: 'rgba(47,191,113,0.12)', color: '#4ade80' }}
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-green-400" />
              </span>
              Arc Mainnet · Live
            </span>
            <ConnectKitButton showBalance={false} />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="pt-10 sm:pt-16">
          <p className="mono inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-hover)' }}>
            <Milestone className="size-3.5" /> Milestone escrow · Public jury · Payroll · Agents
          </p>
          <h1 className="display mt-5 max-w-4xl text-[42px] font-bold leading-[1.02] sm:text-7xl" style={{ color: 'var(--ink)' }}>
            Paid by the milestone.
            <br />
            <span style={{ background: 'linear-gradient(92deg,#5ea9ff 10%,#9fd0ff 45%,#f5a524 95%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Not by the promise.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: 'var(--ink-2)' }}>
            On Arc, money travels a track with checkpoints. The payer funds a milestone, the payee
            delivers against it, and USDC is released only when the work checks out — with a{' '}
            <strong style={{ color: 'var(--ink)' }}>public jury</strong> for disputes,{' '}
            <strong style={{ color: 'var(--ink)' }}>streaming payroll</strong> for salaries, and the
            same rails for <strong style={{ color: 'var(--ink)' }}>AI agents hiring AI agents</strong>.
          </p>

          {/* The Arc Track */}
          <div
            className="relative mt-10 overflow-hidden rounded-[28px] px-4 pb-2 pt-4 sm:px-8"
            style={{ background: 'rgba(10,22,40,0.55)', border: '1px solid var(--border)', boxShadow: 'inset 0 1px 0 rgba(148,184,232,0.12), 0 24px 60px rgba(0,0,0,0.35)' }}
          >
            <svg viewBox="0 0 1200 240" className="w-full" role="img" aria-label="The milestone track: Fund, Deliver, Review, Settle">
              <path d="M -20 218 C 300 30, 900 30, 1220 218" fill="none" stroke="rgba(94,169,255,0.18)" strokeWidth="10" strokeLinecap="round" />
              <path className="arc-line" d="M -20 218 C 300 30, 900 30, 1220 218" fill="none" stroke="#5ea9ff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className="arc-coin pointer-events-none absolute left-0 top-4 hidden h-full w-full sm:block" aria-hidden>
              <span
                className="display flex size-9 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: 'radial-gradient(circle at 32% 30%, #9fd0ff, #2775ca 55%, #0b4d85)', boxShadow: '0 0 24px rgba(94,169,255,0.8), 0 4px 14px rgba(0,0,0,0.5)', transform: 'translate(-50%,-50%)' }}
              >
                $
              </span>
            </div>
            <div className="relative -mt-[19%] grid grid-cols-4 sm:-mt-[16%]">
              {[
                { n: '01', label: 'Fund', sub: 'USDC locks on Arc' },
                { n: '02', label: 'Deliver', sub: 'Work is submitted' },
                { n: '03', label: 'Review', sub: 'Or the jury decides' },
                { n: '04', label: 'Settle', sub: 'Paid in seconds' },
              ].map((s, i) => (
                <div key={s.n} className={`flex flex-col ${i === 1 || i === 2 ? 'items-center text-center' : i === 3 ? 'items-end text-right' : ''}`}>
                  <span
                    className={`flex size-8 items-center justify-center rounded-full border text-[11px] font-bold ${i === 0 ? 'station-live' : ''}`}
                    style={{
                      background: i === 0 ? 'var(--accent)' : 'rgba(10,22,40,0.9)',
                      borderColor: 'rgba(94,169,255,0.5)',
                      color: '#fff',
                    }}
                  >
                    {s.n}
                  </span>
                  <span className="display mt-2 text-sm font-bold sm:text-base" style={{ color: 'var(--ink)' }}>{s.label}</span>
                  <span className="hidden text-xs sm:block" style={{ color: 'var(--muted)' }}>{s.sub}</span>
                </div>
              ))}
            </div>

            {/* Vitals */}
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl lg:grid-cols-4" style={{ background: 'var(--border)' }}>
              <Vital label="Escrows on V2" value={String(stats.escrows)} />
              <Vital label="Locked on the track" value={`${stats.locked} USDC`} />
              <Vital label="Settled to payees" value={`${stats.settled} USDC`} accent />
              <Vital label="Payroll streams" value={String(stats.streams)} />
            </div>
            <p className="mono py-3 text-center text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--subtle)' }}>
              Every number above is read live from the MilePayV2 contract · Arc Mainnet 5042
            </p>
          </div>

          {/* Live dispute banner */}
          {disputed.length > 0 && (
            <button
              onClick={() => { setTab('escrows'); setFilter('disputed'); }}
              className="mt-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:opacity-90"
              style={{ background: 'linear-gradient(90deg, rgba(245,165,36,0.20), rgba(245,165,36,0.05))', border: '1px solid rgba(245,165,36,0.45)' }}
            >
              <Scale className="size-5 shrink-0" style={{ color: 'var(--amber)' }} />
              <span className="text-sm" style={{ color: '#fcd9a0' }}>
                <strong>A jury case is open.</strong> Escrow #{disputed[0].id.toString()} — “{disputed[0].title}” —
                is in dispute on mainnet. Read both sides' evidence and cast your vote.
              </span>
              <ArrowUpRight className="ml-auto size-4 shrink-0" style={{ color: 'var(--amber)' }} />
            </button>
          )}

          {/* Tabs */}
          <div className="mt-9 flex flex-wrap items-center gap-2">
            <div className="flex rounded-2xl p-1" style={{ background: 'rgba(148,184,232,0.08)', border: '1px solid var(--border)' }}>
              <TabBtn active={tab === 'escrows'} onClick={() => setTab('escrows')} icon={Lock} label="Escrows" />
              <TabBtn active={tab === 'payroll'} onClick={() => setTab('payroll')} icon={CalendarClock} label="Payroll" />
              <TabBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={Bot} label="Agents" />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setCreateEscrowOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#2f7fd0,#1061a6)', boxShadow: '0 6px 20px rgba(38,110,190,0.4)' }}
              >
                <Plus className="size-4" /> New escrow
              </button>
              <button
                onClick={() => setCreateStreamOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(148,184,232,0.10)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                <Plus className="size-4" /> New payroll
              </button>
            </div>
          </div>
        </section>

        {/* Body grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            {tab === 'escrows' && (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ['all', 'All'],
                      ['mine', 'Mine'],
                      ['active', 'Active'],
                      ['disputed', 'Jury cases'],
                      ['settled', 'Settled'],
                    ] as [Filter, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: filter === key ? 'var(--ink)' : 'rgba(148,184,232,0.08)',
                        color: filter === key ? '#050b16' : 'var(--ink-2)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="ml-auto self-center text-xs" style={{ color: 'var(--subtle)' }}>
                    Public feed — every escrow on the V2 contract, read live from chain.
                  </span>
                </div>
                {isLoading && escrows.length === 0 ? (
                  <Empty text="Loading escrows from Arc Mainnet…" />
                ) : filter === 'mine' && !address ? (
                  <Empty text="Connect your wallet to see escrows you're part of — or browse the public feed under All." />
                ) : visible.length === 0 ? (
                  <Empty text="Nothing here yet. Create the first one with New escrow." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {visible.map((e) => (
                      <EscrowCard
                        key={e.id.toString()}
                        escrow={e}
                        onAction={refreshAll}
                        highlighted={highlightId === e.id.toString()}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'payroll' && (
              <>
                <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
                  Pre-funded salary streams: each period unlocks on schedule, the employee claims it,
                  and cancelling refunds only what hasn't vested.
                </p>
                {streams.length === 0 ? (
                  <Empty text="No payroll streams yet. Start one with New payroll." />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {streams.map((s) => (
                      <StreamCard key={s.id.toString()} stream={s} onAction={refreshAll} />
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'agents' && <AgentsPanel />}
          </section>

          {/* Rail */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <h3 className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>How it works</h3>
              <ol className="mt-3 space-y-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                <RailStep icon={Lock} title="Fund" text="Payer locks USDC in the contract. Nobody — not even MilePay — can move it outside the rules." />
                <RailStep icon={PackageCheck} title="Deliver & review" text="Payee marks delivery. Payer releases, or the payee claims automatically once the review window lapses." />
                <RailStep icon={Vote} title="Dispute → public jury" text="Either side can freeze the escrow. Both publish evidence; anyone else votes. Majority wins, a tie splits 50/50." />
              </ol>
            </div>

            <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <h3 className="display flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>
                <Eye className="size-4" /> Verify it yourself
              </h3>
              <div className="mt-3 space-y-2.5 text-sm">
                <ProofLink label="MilePayV2 contract" href={`${EXPLORER}/address/${MILEPAY_ESCROW.address}`} />
                <button
                  onClick={() => copyText(MILEPAY_ESCROW.address, 'V2 contract address copied')}
                  className="flex w-full items-center gap-1.5 text-left text-xs hover:underline"
                  style={{ color: 'var(--muted)' }}
                >
                  <Copy className="size-3.5 shrink-0" />
                  <span className="mono truncate">{MILEPAY_ESCROW.address}</span>
                </button>
                <ProofLink label="MilePay V1 contract" href={`${EXPLORER}/address/${MILEPAY_ESCROW_V1.address}`} />
                <ProofLink label="Source code on GitHub" href={REPO_URL} />
                <ProofLink label="Arc Studio project" href={STUDIO_URL} />
              </div>
              <div className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                {PROOF.map((p) => (
                  <a
                    key={p.tx}
                    href={`${EXPLORER}/tx/${p.tx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl px-2.5 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--ink)' }}>
                      {p.label} <ArrowUpRight className="size-3" />
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.detail}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <h3 className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>Honest edges</h3>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                <li>One address, one vote can be gamed with many wallets — stake-weighted juror selection is the roadmap fix, stated openly.</li>
                <li>If a party's address is ever blacklisted by the USDC issuer, that escrow can't settle — an inherent property of USDC escrows.</li>
                <li>V1 stays live and untouched; V2 is a new contract, audited in Studio and covered by 35 tests.</li>
              </ul>
            </div>

            <div className="rounded-3xl p-5" style={{ background: 'linear-gradient(150deg, rgba(38,110,190,0.25), rgba(10,22,40,0.4))', border: '1px solid var(--border)' }}>
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                <Landmark className="size-4" /> Built with Arc Studio
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Designed, audited and deployed through Arc Studio, then settled in real USDC on Arc
                Mainnet — where USDC is both the gas token and the ERC-20. One balance, no bridging.
              </p>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-14 border-t pt-6 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" /> MilePay — milestone escrow on Arc
            </span>
            <a className="hover:underline" href={`${EXPLORER}/address/${MILEPAY_ESCROW.address}`} target="_blank" rel="noreferrer">V2 {shortAddr(MILEPAY_ESCROW.address)}</a>
            <a className="hover:underline" href={`${EXPLORER}/address/${MILEPAY_ESCROW_V1.address}`} target="_blank" rel="noreferrer">V1 {shortAddr(MILEPAY_ESCROW_V1.address)}</a>
            <a className="hover:underline" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
            <a className="hover:underline" href={STUDIO_URL} target="_blank" rel="noreferrer">Arc Studio</a>
            <span className="ml-auto">Paid by the milestone, not by the promise.</span>
          </div>
        </footer>
      </main>

      <CreateEscrowSheet open={createEscrowOpen} onClose={() => setCreateEscrowOpen(false)} onCreated={refreshAll} />
      <CreateStreamSheet open={createStreamOpen} onClose={() => { setCreateStreamOpen(false); refreshAll(); }} />
    </div>
  );
}

function Vital({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3.5" style={{ background: 'rgba(8,17,32,0.85)' }}>
      <p className="mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="mono mt-1 text-xl font-bold tabular-nums sm:text-2xl" style={{ color: accent ? '#4ade80' : 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Lock; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition"
      style={{
        background: active ? 'rgba(94,169,255,0.16)' : 'transparent',
        color: active ? '#cfe7ff' : 'var(--muted)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(94,169,255,0.35)' : 'none',
      }}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

function RailStep({ icon: Icon, title, text }: { icon: typeof Lock; title: string; text: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(94,169,255,0.12)', color: 'var(--accent-hover)' }}>
        <Icon className="size-4" />
      </span>
      <span>
        <strong className="block text-[13px]" style={{ color: 'var(--ink)' }}>{title}</strong>
        <span className="text-[13px] leading-snug">{text}</span>
      </span>
    </li>
  );
}

function ProofLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium hover:underline" style={{ color: 'var(--accent-hover)' }}>
      <ExternalLink className="size-3.5 shrink-0" /> {label}
    </a>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl px-6 py-12 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)', color: 'var(--muted)' }}>
      {text}
    </div>
  );
}

function AgentsPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        The same escrow that protects two humans protects two programs. In the live mainnet run below,
        a <strong>HirerAgent</strong> posted a paid micro-job and locked 0.005 USDC; a <strong>WorkerAgent</strong>{' '}
        accepted it under its own price policy, did the work, and delivered; the hirer verified the deliverable
        hash <em>programmatically</em> and released — settlement atomic, reputation portable, no human in the loop.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Bot, title: '1 · Post & fund', text: 'HirerAgent creates the escrow with the job spec and price. Funds lock on-chain.' },
          { icon: Code2, title: '2 · Work & deliver', text: 'WorkerAgent checks the price against its floor policy, computes the result, marks delivered.' },
          { icon: ShieldCheck, title: '3 · Verify & release', text: 'HirerAgent re-computes the expected hash; on match it releases instantly. Mismatch → jury.' },
        ].map((c) => (
          <div key={c.title} className="rounded-3xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <c.icon className="size-5" style={{ color: 'var(--accent-hover)' }} />
            <p className="display mt-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>{c.title}</p>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--muted)' }}>{c.text}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>The live run — every step on Arc Mainnet</p>
        <div className="mt-3 space-y-2">
          {AGENT_TXS.map((t) => (
            <a
              key={t.tx}
              href={`${EXPLORER}/tx/${t.tx}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-white/[0.04]"
              style={{ color: 'var(--ink-2)' }}
            >
              <ShieldCheck className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
              {t.label}
              <span className="mono ml-auto text-xs" style={{ color: 'var(--subtle)' }}>{t.tx.slice(0, 10)}…</span>
            </a>
          ))}
        </div>
        <a
          href={`${REPO_URL}/blob/main/agent/run-agent-demo.mjs`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          style={{ color: 'var(--accent-hover)' }}
        >
          <Code2 className="size-4" /> Read the agent script on GitHub
        </a>
      </div>
    </div>
  );
}
