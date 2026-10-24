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
- **Auto-claim path**: create `0x809e36c06606f8eb08f9f3d8ffd2d4585db02f5c4c223c67f43b73ec36edbff9` → deliver `0x8b17f888adbccbd7eb5612b3e6db47c052c555dd8dd2c9e8500791eb59ccce0e` → payer stays silent → payee `claimAfterReview` after the 60s review window `0xb2ece32e6d3548e236ae9b4ac6421b5647a46c6a554a3ce774b3e19042d02311`

The hosted app is this Studio-built frontend configured for Arc Mainnet
(`src/contract.ts`, `src/config.ts`), built with `vite.pages.config.ts`
(single-file build) and published to the `gh-pages` branch.

## MilePay V2 — public jury, payroll streams, agent settlement (Arc Mainnet)

V2 keeps the v1 escrow semantics and adds three primitives. The source
(`contracts/MilePayV2.sol`) was adopted verbatim by Arc Studio, passed its dual
audits, and is deployed on both networks:

| Item | Value |
|---|---|
| MilePayV2 (mainnet) | `0x91de4E76fb4e7809B4C6e00FF65F5e7D8331A887` |
| Deploy tx | `0x02e35b7e7fef03de7544953034f742bcdd291c5ce75585d26cb23459cd51fb32` |
| MilePayV2 (testnet, Studio) | `0xe2a5f9a111434367be08792c554d70a0b1a8e4dd` |

Mainnet demonstrations (real USDC):

- **Core release**: create `0x071069bdd6e6b81533ded12fe27797aca3d03be5957f8d93937622752572135e` → deliver `0xc3a82eb62187f4ddd55fa5bd7830b06d6c68b30aa4c51b418cebd244b089752c` → release `0x71253b4849cdcbc5138def2f7777be549c294e363d09359450846255769a807b`
- **Public jury dispute**: escrow delivered, payer disputed, both sides submitted evidence, three independent juror wallets voted 2:1 for the payee, and `resolveDispute` paid the payee in full — resolve tx `0x09b325ebf476b72287bc44f865c7226ca256357922676cb3dc4b8514df282a4b`
- **Payroll stream**: 3 periods × 0.003 USDC at 90 s per period — create `0xcf38d488a0af0aed92fc3502904bcb7b2367d6bed23b548a4bc86eae3d3fede0`, claim after vesting `0x60dc8ab5e77d69cd9a639e6120c148014af06079ed7e2466e30f91f6fab619a3`, cancel with unvested refund `0xcb7bc8e6bf7e47a9355653a519f05622704ca82054e65205cc5b83efd5dbd534`
- **Agent-to-agent**: two autonomous agents settled a paid micro-job with no human clicks — HirerAgent funded escrow `0x5ceebe11e722a0564f446db1e9eaee80e290064c41230d1f15e3dd6fc194b463`, WorkerAgent delivered `0x4ff2dfabd6f0f39ba87d7ec416d61d73d539aaac0883bde80bcbe321aae786d2`, HirerAgent verified the deliverable hash and released `0xbd241ad88a51226eb184f90c461d3b2b19cfa982b31c2f74d33d67b563609451` (script: `agent/run-agent-demo.mjs`)
- **Live jury escrow (open for anyone to judge)**: escrow #3 on the mainnet V2 contract is sitting in `Disputed` state with a 10-day jury window from 2026-10-24 — connect a wallet in the app and cast a vote.

How the jury works: either party can freeze an escrow into dispute before
settlement; both sides publish evidence links on-chain; any address that is not
a party may vote once during the jury window; the majority wins the full
amount and a tie splits 50/50. Known limitation, stated plainly: one address
one vote is sybil-able — stake-weighted juror selection is the roadmap answer,
not a hidden flaw.
