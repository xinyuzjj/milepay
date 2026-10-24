export interface EscrowData {
  id: bigint;
  payer: string;
  payee: string;
  amount: bigint;
  deadline: bigint;
  reviewWindowSeconds: bigint;
  deliveredAt: bigint;
  state: number;
  title: string;
}
