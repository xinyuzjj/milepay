import { useState, useCallback } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { Plus, RefreshCw, Shield } from 'lucide-react';
import { TokenUSDC } from '@web3icons/react';
import type { Abi } from 'viem';
import CreateEscrowSheet from '@/components/CreateEscrowSheet';
import EscrowCard from '@/components/EscrowCard';
import { MILEPAY_ESCROW, ARC_TESTNET_CHAIN_ID } from '@/contract';
import type { EscrowData } from '@/types';

type RawEscrow = {
  payer: string;
  payee: string;
  amount: bigint;
  deadline: bigint;
  reviewWindowSeconds: bigint;
  deliveredAt: bigint;
  state: number;
  title: string;
};

export default function App() {
  const { address, isConnected } = useAccount();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Read total escrow count
  const { data: countData } = useReadContract({
    address: MILEPAY_ESCROW.address,
    abi: MILEPAY_ESCROW.abi as Abi,
    functionName: 'escrowCount',
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { refetchInterval: 8_000 },
  });

  const totalCount = countData ? Number(countData) : 0;

  // Build calls for all escrow IDs
  const escrowCalls = Array.from({ length: totalCount }, (_, i) => ({
    address: MILEPAY_ESCROW.address as `0x${string}`,
    abi: MILEPAY_ESCROW.abi as Abi,
    functionName: 'getEscrow' as const,
    args: [BigInt(i + 1)] as readonly [bigint],
    chainId: ARC_TESTNET_CHAIN_ID,
  }));

  const { data: escrowResults, refetch } = useReadContracts({
    contracts: escrowCalls,
    query: { enabled: totalCount > 0, refetchInterval: 8_000 },
  });

  const refreshEscrows = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void refetch();
  }, [refetch]);

  // Derive escrows in render — no setState in effects
  const myEscrows: EscrowData[] = [];
  if (escrowResults && address) {
    for (let i = 0; i < escrowResults.length; i++) {
      const r = escrowResults[i];
      if (r.status !== 'success' || !r.result) continue;
      const raw = r.result as RawEscrow;
      if (
        raw.payer.toLowerCase() === address.toLowerCase() ||
        raw.payee.toLowerCase() === address.toLowerCase()
      ) {
        myEscrows.push({
          id: BigInt(i + 1),
          payer: raw.payer,
          payee: raw.payee,
          amount: raw.amount,
          deadline: raw.deadline,
          reviewWindowSeconds: raw.reviewWindowSeconds,
          deliveredAt: raw.deliveredAt,
          state: Number(raw.state),
          title: raw.title,
        });
      }
    }
    myEscrows.reverse(); // newest first
  }

  // Suppress refreshKey unused warning
  void refreshKey;

  const activeCount = myEscrows.filter((e) => e.state === 0 || e.state === 1).length;

  return (
    <div
      className="min-h-dvh"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(255,255,255,0.80)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent)' }}
            >
              <Shield className="size-4 text-white" />
            </div>
            <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              MilePay
            </span>
          </div>
          <ConnectKitButton />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {!isConnected ? (
          /* Not connected hero */
          <div className="flex flex-col items-center py-20 text-center">
            <div
              className="mb-6 flex size-20 items-center justify-center rounded-3xl"
              style={{ background: 'rgba(18,45,69,0.06)' }}
            >
              <Shield className="size-10" style={{ color: 'var(--accent)' }} />
            </div>
            <h1
              className="display text-3xl font-bold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
            >
              Milestone payments,
              <br />
              held in escrow.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              Lock USDC into an escrow on Arc. The payee gets paid when work is released or
              the review window expires. Connect your wallet to get started.
            </p>
            <div className="mt-6">
              <ConnectKitButton label="Connect wallet" />
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
              <TokenUSDC variant="branded" size={16} />
              <span>Powered by USDC on Arc Testnet</span>
            </div>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <section
              className="rounded-3xl p-5 mb-5"
              style={{
                background: 'var(--surface)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border)',
                boxShadow: '0 4px 24px rgba(18,45,69,0.08)',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TokenUSDC variant="branded" size={18} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                      My Escrows
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {myEscrows.length}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>total</span>
                    {activeCount > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: 'rgba(26,128,71,0.12)', color: 'var(--success)' }}
                      >
                        {activeCount} active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    Arc Testnet · USDC
                  </p>
                </div>

                <button
                  onClick={() => setSheetOpen(true)}
                  className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.97]"
                  style={{ background: 'var(--accent)' }}
                >
                  <Plus className="size-4" />
                  Create
                </button>
              </div>
            </section>

            {/* Escrow list */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                {myEscrows.length === 0 ? 'No escrows yet' : 'Your escrows'}
              </h2>
              <button
                onClick={refreshEscrows}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:bg-black/5"
                style={{ color: 'var(--muted)' }}
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </div>

            {myEscrows.length === 0 ? (
              <div
                className="rounded-2xl p-10 text-center"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px dashed var(--border)',
                }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                  No escrows found for your wallet.
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                  Create one above, or ask someone to create one with your address as the payee.
                </p>
                <button
                  onClick={() => setSheetOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: 'var(--accent)' }}
                >
                  <Plus className="size-4" />
                  Create escrow
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myEscrows.map((e) => (
                  <EscrowCard key={e.id.toString()} escrow={e} onAction={refreshEscrows} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <CreateEscrowSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => {
          setSheetOpen(false);
          setTimeout(refreshEscrows, 2000);
        }}
      />
    </div>
  );
}
