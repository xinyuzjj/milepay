import artifact from '../contracts/out/MilePayEscrow.sol/MilePayEscrow.json';

export const MILEPAY_ESCROW = {
  address: '0xbfa6176e074bc704cdc9350c0694362438eb00f6' as const,
  abi: artifact.abi,
} as const;

export const ARC_TESTNET_CHAIN_ID = 5042002;
