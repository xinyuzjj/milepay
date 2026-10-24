import { useState, useMemo, useEffect } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useReadContracts } from 'wagmi';
import {
  Plus, ShieldCheck, ExternalLink, Copy, Eye, Scale, CalendarClock,
  Bot, Landmark, Lock, PackageCheck, Vote, Code2, ArrowUpRight,
  Wallet, CircleDollarSign,
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
      { address: MILEPAY_ESCROW.address, abi: MILEPAY_ESCROW.abi, functionName: 'escrowCount' },
      { address: MILEPAY_ESCROW.address, abi: MILEPAY_ESCROW.abi, functionName: 'streamCount' },
    ],
  });
  const escrowCount = (countData?.[0]?.result as bigint | undefined) ?? 0n;
  const streamCount = (countData?.[1]?.result as bigint | undefined) ?? 0n;

  const escrowCalls = useMemo(() => {
    const n = Number(escrowCount);
    return Array.from({ length: n }, (_, i) => ({
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
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'getStream',
        args: [BigInt(i)],
      });
      calls.push({
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
        const t = r.result as unknown as readonly unknown[];
        return {
          id: BigInt(i + 1),
          payer: t[0] as string,
          payee: t[1] as string,
          amount: t[2] as bigint,
          deadline: t[3] as bigint,
          reviewWindowSeconds: t[4] as bigint,
          deliveredAt: t[5] as bigint,
          juryWindowSeconds: t[6] as bigint,
          disputeEndsAt: t[7] as bigint,
          payeeVotes: t[8] as bigint,
          payerVotes: t[9] as bigint,
          state: Number(t[10]),
          title: t[11] as string,
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
      const t = g.result as unknown as readonly unknown[];
      out.push({
        id: BigInt(i / 2 + 1),
        payer: t[0] as string,
        payee: t[1] as string,
        amountPerPeriod: t[2] as bigint,
        periodSeconds: t[3] as bigint,
        totalPeriods: t[4] as bigint,
        claimedPeriods: t[5] as bigint,
        startTime: t[6] as bigint,
        cancelled: t[7] as boolean,
        vestedCap: t[8] as bigint,
        title: t[9] as string,
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
    <div className="relative min-h-dvh overflow-x-clip" style={{ background: 'var(--bg-gradient)' }}>
      {/* ambience */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 90% at 15% 0%, rgba(16,97,166,0.14) 0%, transparent 60%),' +
              'radial-gradient(50% 80% at 85% 0%, rgba(217,119,6,0.10) 0%, transparent 55%),' +
              'radial-gradient(40% 60% at 55% 10%, rgba(124,58,237,0.07) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{ background: 'rgba(255,255,255,0.78)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="display flex size-9 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#1061a6,#122d45)' }}
            >
              M
            </span>
            <div className="leading-tight">
              <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>MilePay</p>
              <p className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Escrow · Jury · Payroll</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex"
              style={{ background: 'rgba(26,128,71,0.10)', color: 'var(--success)' }}
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-green-600" />
              </span>
              Arc Mainnet · Live
            </span>
            <ConnectKitButton showBalance={false} />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="pt-10 sm:pt-14">
          <p
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(16,97,166,0.10)', color: 'var(--accent-hover)' }}
          >
            <Landmark className="size-3.5" /> Built with Arc Studio · Settled in real USDC
          </p>
          <h1
            className="display mt-4 max-w-3xl text-4xl font-bold leading-[1.05] sm:text-6xl"
            style={{ color: 'var(--ink)' }}
          >
            Work gets paid when work gets done.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: 'var(--ink-2)' }}>
            MilePay locks payment in a milestone escrow, pays out when delivery is confirmed,
            lets the <strong>public jury</strong> settle disputes, streams <strong>payroll</strong> period
            by period — and lets <strong>AI agents hire AI agents</strong> with the same guarantees.
          </p>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Escrows on V2" value={String(stats.escrows)} icon={Lock} />
            <Stat label="Locked right now (USDC)" value={stats.locked} icon={CircleDollarSign} />
            <Stat label="Settled to payees (USDC)" value={stats.settled} icon={ShieldCheck} />
            <Stat label="Payroll streams" value={String(stats.streams)} icon={CalendarClock} />
          </div>

          {/* Live dispute banner */}
          {disputed.length > 0 && (
            <button
              onClick={() => { setTab('escrows'); setFilter('disputed'); }}
              className="mt-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:opacity-90"
              style={{ background: 'linear-gradient(90deg, rgba(217,119,6,0.16), rgba(217,119,6,0.06))', border: '1px solid rgba(217,119,6,0.35)' }}
            >
              <Scale className="size-5 shrink-0" style={{ color: '#b45309' }} />
              <span className="text-sm" style={{ color: '#92400e' }}>
                <strong>A jury case is open.</strong> Escrow #{disputed[0].id.toString()} — “{disputed[0].title}” —
                is in dispute on mainnet. Read both sides' evidence and cast your vote.
              </span>
              <ArrowUpRight className="ml-auto size-4 shrink-0" style={{ color: '#b45309' }} />
            </button>
          )}

          {/* Tabs */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <div className="flex rounded-2xl p-1" style={{ background: 'rgba(18,45,69,0.06)' }}>
              <TabBtn active={tab === 'escrows'} onClick={() => setTab('escrows')} icon={Lock} label="Escrows" />
              <TabBtn active={tab === 'payroll'} onClick={() => setTab('payroll')} icon={CalendarClock} label="Payroll" />
              <TabBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={Bot} label="Agents" />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setCreateEscrowOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
                style={{ background: 'var(--accent)' }}
              >
                <Plus className="size-4" /> New escrow
              </button>
              <button
                onClick={() => setCreateStreamOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
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
                        background: filter === key ? 'var(--ink)' : 'rgba(18,45,69,0.06)',
                        color: filter === key ? '#fff' : 'var(--ink-2)',
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
                    className="block rounded-xl px-2.5 py-2 transition hover:bg-black/[0.03]"
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
            <span className="ml-auto">USDC on Arc settles as both the gas token and the ERC-20 — one balance, no bridging.</span>
          </div>
        </footer>
      </main>

      <CreateEscrowSheet open={createEscrowOpen} onClose={() => setCreateEscrowOpen(false)} onCreated={refreshAll} />
      <CreateStreamSheet open={createStreamOpen} onClose={() => { setCreateStreamOpen(false); refreshAll(); }} />
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Lock }) {
  return (
    <div className="rounded-3xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="display mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Lock; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition"
      style={{
        background: active ? 'var(--surface-strong)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--muted)',
        boxShadow: active ? '0 1px 4px rgba(18,45,69,0.12)' : 'none',
      }}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

function RailStep({ icon: Icon, title, text }: { icon: typeof Lock; title: string; text: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(16,97,166,0.10)', color: 'var(--accent-hover)' }}>
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
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-black/[0.03]"
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
