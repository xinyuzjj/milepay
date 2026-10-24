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

## Production deployment (Arc Mainnet)

The contract in this repository was built with Arc Studio and deployed by Studio
to Arc Testnet. After an external security review, the Studio builder removed
`updatePayee` (with its `PayeeUpdated` event and `SamePayee` error): a payer must
never be able to redirect escrowed funds after delivery. The final audited source
is `contracts/MilePayEscrow.sol` at commit `5aadb80`.

That exact contract is deployed on **Arc Mainnet** (chain 5042):

| Item | Value |
|---|---|
| MilePayEscrow (mainnet) | `0x4154268BEF790A1328407e4D80F109E110328Df4` |
| Deploy tx | `0xf734d53e654062f3aada7cc80dfb5b4d4f158e6aaa1460c0ca3e2307b57d4967` |
| Explorer | https://explorer.arc.io/address/0x4154268BEF790A1328407e4D80F109E110328Df4 |
| Live app | https://xinyuzjj.github.io/milepay/ |
| MilePayEscrow (testnet, Studio) | `0xbfa6176e074bc704cdc9350c0694362438eb00f6` |

Mainnet demo flows (0.01 USDC each, real funds):

- **Release path**: create `0x57c80b6930d020938b57fef5dbf56f7bb23575451da391e09744a2bd422196dd` → deliver `0x08b611c87b8e7ef479f33377d96ae84f6802a4c555f3255d893a029b86541f74` → release `0x9fca4d5d90f6fc9d2605fab7435d7941075984370013d4730fc57d90b074afd7`
- **Refund path**: create `0x9495ab797ff66036a628cec5c4623c43a802c27d348b3fda7d857734748ae018` → refund after deadline `0xdaf32a89ffb49ddebdf99a710f663ff11b3125c699fdf0aa91029510d2efa052`

The hosted app is this Studio-built frontend configured for Arc Mainnet
(`src/contract.ts`, `src/config.ts`), built with `vite.pages.config.ts`
(single-file build) and published to the `gh-pages` branch.
