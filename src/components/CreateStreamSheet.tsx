import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi } from 'viem';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getUsdc } from '@/onchain-facts';
import { Amount, parseAmount, formatAmount } from '@/onchain-money';
import { MILEPAY_ESCROW, ARC_CHAIN_ID } from '@/contract';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateStreamSheet({ open, onClose }: Props) {
  const { address } = useAccount();
  const usdcAddress = getUsdc(ARC_CHAIN_ID)!.address as `0x${string}`;

  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [periodHours, setPeriodHours] = useState('720');
  const [periods, setPeriods] = useState('12');
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<'idle' | 'approve' | 'create'>('idle');

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approvePending,
    reset: resetApprove,
  } = useWriteContract();
  const {
    writeContract: writeCreate,
    data: createTxHash,
    isPending: createPending,
    reset: resetCreate,
  } = useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createTxHash });

  const isSubmitting = approvePending || createPending || phase !== 'idle';

  useEffect(() => {
    if (phase === 'approve' && approveSuccess) {
      setPhase('create');
      const parsed = parseAmount(ARC_CHAIN_ID, amount);
      writeCreate({
        address: MILEPAY_ESCROW.address,
        abi: MILEPAY_ESCROW.abi,
        functionName: 'createStream',
        args: [
          payee as `0x${string}`,
          parsed.raw,
          BigInt(Math.floor(parseFloat(periodHours) * 3600)),
          BigInt(periods),
          title,
        ],
      });
    }
  }, [approveSuccess, phase]);

  useEffect(() => {
    if (phase === 'create' && createSuccess) {
      toast.success('Payroll stream created');
      handleClose();
    }
  }, [createSuccess, phase]);

  const handleClose = () => {
    setPayee('');
    setAmount('');
    setPeriodHours('720');
    setPeriods('12');
    setTitle('');
    setPhase('idle');
    resetApprove();
    resetCreate();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !payee || !amount || !title || !periods) return;
    const parsed = parseAmount(ARC_CHAIN_ID, amount);
    const total = parsed.raw * BigInt(periods);
    setPhase('approve');
    writeApprove({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [MILEPAY_ESCROW.address, total],
    });
  };

  const statusLabel = () => {
    if (phase === 'approve') return 'Approving…';
    if (phase === 'create') return 'Creating…';
    return 'Start payroll stream';
  };

  const totalPreview = (() => {
    try {
      if (!amount || !periods) return null;
      return formatAmount(ARC_CHAIN_ID, Amount.fromRaw(parseAmount(ARC_CHAIN_ID, amount).raw * BigInt(periods), 6));
    } catch {
      return null;
    }
  })();

  const inputCls = 'mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2';
  const inputStyle = {
    borderColor: 'var(--border)',
    background: 'var(--surface-muted)',
    color: 'var(--ink)',
  } as const;

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
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#a855f7,#ec4899,#f43f5e)' }}
            />
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                Create Payroll Stream
              </h2>
              <button onClick={handleClose} className="rounded-full p-1.5 transition hover:bg-black/5" aria-label="Close">
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 pb-8 pt-2 space-y-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Title</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly salary — Alex" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Employee address</label>
                <input required value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" className={`${inputCls} font-mono`} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Amount per period (USDC)</label>
                <input
                  required inputMode="decimal" value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                  }}
                  placeholder="0.00" className={inputCls} style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Period (hours)</label>
                  <input required type="number" min="1" step="1" value={periodHours} onChange={(e) => setPeriodHours(e.target.value)} className={`${inputCls} tabular-nums`} style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Periods</label>
                  <input required type="number" min="1" max="60" step="1" value={periods} onChange={(e) => setPeriods(e.target.value)} className={`${inputCls} tabular-nums`} style={inputStyle} />
                </div>
              </div>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                The full total is pre-funded into the contract now; each period unlocks on schedule and the employee claims it. You can cancel anytime — unvested periods refund to you, vested-but-unclaimed periods stay the employee's.
                {totalPreview ? <> Total lock-up: <strong>{totalPreview} USDC</strong>.</> : null}
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !address}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {isSubmitting ? (<><Loader2 className="size-4 animate-spin" />{statusLabel()}</>) : statusLabel()}
              </button>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
