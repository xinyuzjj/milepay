import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { toast } from 'sonner';
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, formatAmount } from '@/onchain-money';
import { MILEPAY_ESCROW, ARC_CHAIN_ID } from '@/contract';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const USDC = getUsdc(ARC_CHAIN_ID)!;

export default function CreateEscrowSheet({ open, onClose, onCreated }: Props) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = chainId !== ARC_CHAIN_ID;

  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [reviewHours, setReviewHours] = useState('24');
  const [juryHours, setJuryHours] = useState('72');
  const [title, setTitle] = useState('');

  // Step 1: approve
  const {
    writeContract: approve,
    data: approveTx,
    isPending: approveWaiting,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTx });

  // Step 2: createEscrow
  const {
    writeContract: create,
    data: createTx,
    isPending: createWaiting,
    reset: resetCreate,
  } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({
    hash: createTx,
  });

  const isSubmitting = approveWaiting || approveConfirming || createWaiting || createConfirming;

  // When approval confirms, send the create transaction
  const handleApproveSuccess = () => {
    if (!address || !payee || !amount || !deadline || !reviewHours || !title) return;
    const parsed = parseAmount(ARC_CHAIN_ID, amount);
    const deadlineTs = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
    const reviewSecs = BigInt(Math.floor(parseFloat(reviewHours) * 3600));
    const jurySecs = BigInt(Math.floor(parseFloat(juryHours || '0') * 3600));
    create({
      address: MILEPAY_ESCROW.address,
      abi: MILEPAY_ESCROW.abi,
      functionName: 'createEscrow',
      args: [payee as `0x${string}`, parsed.raw, deadlineTs, reviewSecs, jurySecs, title],
    });
  };

  // Watch approval success
  if (approveSuccess && !createTx && !createWaiting) {
    handleApproveSuccess();
  }

  if (createSuccess) {
    toast.success('Escrow created!', {
      description: createTx ? (
        <a href={buildTxExplorerUrl(ARC_CHAIN_ID, createTx)} target="_blank" rel="noreferrer" className="underline">
          View on ArcScan
        </a>
      ) : undefined,
    });
    onCreated();
    handleClose();
  }

  function handleClose() {
    resetApprove();
    resetCreate();
    setPayee('');
    setAmount('');
    setDeadline('');
    setReviewHours('24');
    setJuryHours('72');
    setTitle('');
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !payee || !amount || !deadline || !reviewHours || !title) return;
    if (wrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID });
      return;
    }
    const parsed = parseAmount(ARC_CHAIN_ID, amount);
    // Approve USDC
    approve({
      address: USDC.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [MILEPAY_ESCROW.address, parsed.raw],
    });
  }

  const statusLabel = () => {
    if (approveWaiting) return 'Confirm approval in wallet...';
    if (approveConfirming) return 'Approving USDC...';
    if (createWaiting) return 'Confirm escrow in wallet...';
    if (createConfirming) return 'Creating escrow...';
    if (wrongChain) return 'Switch to Arc';
    return 'Create Escrow';
  };

  // Minimum datetime: now + 1 min
  const minDatetime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{
              background: 'rgba(9,18,34,0.96)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* spectral strip */}
            <div
              className="h-1 w-full"
              style={{
                background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#a855f7,#ec4899,#f43f5e)',
              }}
            />

            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                Create Escrow
              </h2>
              <button
                onClick={handleClose}
                className="rounded-full p-1.5 transition hover:bg-white/10"
                aria-label="Close"
              >
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 pb-8 pt-2 space-y-3">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Title
                </label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Logo design for Acme Co."
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              {/* Payee */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Payee address
                </label>
                <input
                  required
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="0x…"
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none transition focus:ring-2"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Amount (USDC)
                </label>
                <div
                  className="mt-1 flex items-center gap-2 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                    }}
                    placeholder="0.00"
                    className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none"
                    style={{ color: 'var(--ink)' }}
                  />
                  <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--muted)' }}>
                    USDC
                  </span>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Delivery deadline
                </label>
                <input
                  required
                  type="datetime-local"
                  min={minDatetime}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              {/* Review window */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Review window (hours)
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={reviewHours}
                  onChange={(e) => setReviewHours(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 tabular-nums"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                  }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                  After delivery, you have this long to release. After this window the payee can claim automatically.
                </p>
              </div>

              {/* Jury window */}
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Public jury window (hours, 0 = disputes off)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={juryHours}
                  onChange={(e) => setJuryHours(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 tabular-nums"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                  }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                  If either side disputes, the escrow freezes and the public votes for this long. Majority wins; a tie splits 50/50.
                </p>
              </div>

              {/* Note about 2-step */}
              {amount && (
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  Creating an escrow requires two wallet confirmations: first approve{' '}
                  <strong>
                    {(() => {
                      try {
                        return formatAmount(ARC_CHAIN_ID, parseAmount(ARC_CHAIN_ID, amount));
                      } catch {
                        return amount;
                      }
                    })()}{' '}
                    USDC
                  </strong>
                  , then create the escrow.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !address}
                className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {statusLabel()}
                  </>
                ) : (
                  statusLabel()
                )}
              </button>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
