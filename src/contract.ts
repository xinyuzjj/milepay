import type { Abi } from 'viem';
import artifactV1 from '../contracts/out/MilePayEscrow.sol/MilePayEscrow.json';
import artifactV2 from '../contracts/out/MilePayV2.sol/MilePayV2.json';

// MilePay V1 — the original Studio-built escrow, live on Arc Mainnet since
// 2026-10-24. Kept for reference; the app now runs on V2.
export const MILEPAY_ESCROW_V1 = {
  address: '0x4154268BEF790A1328407e4D80F109E110328Df4' as const,
  abi: artifactV1.abi as Abi,
} as const;

// MilePay V2 — milestone escrow + public jury + payroll streams.
// Built in Arc Studio (source adopted verbatim), deployed on Arc Mainnet.
export const MILEPAY_ESCROW = {
  address: '0x91de4E76fb4e7809B4C6e00FF65F5e7D8331A887' as const,
  abi: artifactV2.abi as Abi,
} as const;

/** Block where MilePayV2 was deployed — event queries start here. */
export const V2_DEPLOY_BLOCK = 27626934n;

export const ARC_CHAIN_ID = 5042;
