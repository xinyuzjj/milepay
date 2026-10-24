import artifact from '../contracts/out/MilePayEscrow.sol/MilePayEscrow.json';

export const MILEPAY_ESCROW = {
  address: '0xdae6aa0bd15299b8c37a15e132cf5e67ac3d8e02' as const,
  abi: artifact.abi,
} as const;

export const ARC_TESTNET_CHAIN_ID = 5042002;
