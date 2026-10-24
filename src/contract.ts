import artifact from '../contracts/out/MilePayEscrow.sol/MilePayEscrow.json';

// Production instance: MilePayEscrow deployed on Arc Mainnet.
// (Built with Arc Studio; the Studio project targets Arc Testnet — this hosted
// build is configured for the mainnet deployment of the same audited contract.)
export const MILEPAY_ESCROW = {
  address: '0x4154268BEF790A1328407e4D80F109E110328Df4' as const,
  abi: artifact.abi,
} as const;

export const ARC_CHAIN_ID = 5042;
