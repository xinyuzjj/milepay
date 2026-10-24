export interface EscrowData {
  id: bigint;
  payer: string;
  payee: string;
  amount: bigint;
  deadline: bigint;
  reviewWindowSeconds: bigint;
  deliveredAt: bigint;
  juryWindowSeconds: bigint;
  disputeEndsAt: bigint;
  payeeVotes: bigint;
  payerVotes: bigint;
  state: number; // 0 Funded, 1 Delivered, 2 Released, 3 Refunded, 4 Disputed, 5 Resolved
  title: string;
}

export interface StreamData {
  id: bigint;
  payer: string;
  payee: string;
  amountPerPeriod: bigint;
  periodSeconds: bigint;
  totalPeriods: bigint;
  claimedPeriods: bigint;
  startTime: bigint;
  cancelled: boolean;
  vestedCap: bigint;
  title: string;
  claimablePeriods: bigint;
}
