# MilePay

Milestone-based USDC escrow on Arc Testnet. Payers lock USDC into a titled escrow with a payee address, delivery deadline, and review window. The payee marks work delivered; the payer releases payment (or the payee auto-claims once the review window expires). If the payee never delivers by the deadline, the payer can refund.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Web3**: wagmi v2, viem, ConnectKit
- **Contract**: Solidity 0.8.28, Foundry, OpenZeppelin 5.6.1
- **Chain**: Arc Testnet (chain ID 5042002)
- **Token**: USDC at `0x3600000000000000000000000000000000000000`

## Deployed Contract

| Contract | Network | Address |
|---|---|---|
| MilePayEscrow | Arc Testnet | `0xdae6aa0bd15299b8c37a15e132cf5e67ac3d8e02` |

## Development

### Prerequisites

- [Bun](https://bun.sh)
- [Foundry](https://getfoundry.sh)

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `RPC_PROXY_BASE_URL` | RPC proxy base URL (optional outside Arc Studio) |
| `RPC_PROXY_TOKEN` | RPC proxy auth token (optional outside Arc Studio) |
| `RPC_PROXY_CHAINS` | Comma-separated chain keys for the proxy (optional outside Arc Studio) |

### Run

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Contract

```bash
# Compile
bun run contracts:build

# Test
bun run contracts:test
```

## Features

- **Create escrow**: approve USDC + lock funds in one two-step flow (approve then createEscrow).
- **Mark delivered**: payee confirms work is done.
- **Release**: payer releases funds to payee at any time (Funded or Delivered state).
- **Refund**: payer reclaims funds if the deadline passes without delivery.
- **Claim after review**: payee auto-claims after the review window if payer has not acted.
- **My escrows**: live list of all escrows where the connected wallet is payer or payee.
