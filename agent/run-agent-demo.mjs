import { ethers } from "ethers";
import fs from "fs";
import crypto from "crypto";

/**
 * MilePay agent-to-agent demo.
 *
 * Two autonomous agents settle a micro-job through a MilePay escrow with no
 * human in the loop:
 *
 *   HirerAgent  — posts a job (creates + funds an escrow), later verifies the
 *                 deliverable and releases payment.
 *   WorkerAgent — watches the job board, accepts jobs that meet its policy
 *                 (pay >= floor, sane deadline), does the work, marks delivery.
 *
 * The job: "compute the SHA-256 of the dataset below and return the digest".
 * Verification is objective — the hirer recomputes the digest and only then
 * releases. If verification failed, the hirer would raise a dispute instead
 * (V2 arbitration), which the arbiter would settle.
 *
 * Agents talk through a file-based mailbox (job.json / delivery.json) — the
 * same pattern two processes or two machines would use with any transport.
 *
 * Usage: RPC_URL=... V2_ADDRESS=... node run-agent-demo.mjs
 * Keys are read from ../.keys (deployer = hirer, payee = worker, arbiter optional).
 */

const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.io";
const V2 = process.env.V2_ADDRESS;
if (!V2) throw new Error("Set V2_ADDRESS to a deployed MilePayV2 contract");

const DIR = new URL(".", import.meta.url).pathname;
const MAIL = DIR + "mailbox";
fs.mkdirSync(MAIL, { recursive: true });

const artifact = JSON.parse(
  fs.readFileSync(DIR + "../artifacts/contracts/MilePayV2.sol/MilePayV2.json", "utf8")
);
const USDC_ABI = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const USDC_ADDR = "0x3600000000000000000000000000000000000000";

const keyOf = (f) => "0x" + fs.readFileSync(DIR + "../.keys/" + f, "utf8").match(/Private key:\s*0x([0-9a-fA-F]{64})/)[1];
const provider = new ethers.JsonRpcProvider(RPC);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (who, msg) => console.log(`[${new Date().toISOString()}] ${who}: ${msg}`);

class Agent {
  constructor(name, keyFile) {
    this.name = name;
    this.wallet = new ethers.Wallet(keyOf(keyFile), provider);
    this.escrow = new ethers.Contract(V2, artifact.abi, this.wallet);
    this.usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, this.wallet);
  }
  get address() {
    return this.wallet.address;
  }
}

const hirer = new Agent("HirerAgent", "deployer.txt");
const worker = new Agent("WorkerAgent", "payee.txt");

// ------------------------------------------------------------------ the job
const DATASET = "arc-mainnet-block-68854625: the quick brown fox jumps over the lazy dog; usdc settles in seconds";
const EXPECTED = crypto.createHash("sha256").update(DATASET).digest("hex");
const PRICE = 5_000n; // 0.005 USDC
const WORKER_FLOOR = 1_000n; // worker accepts jobs paying >= 0.001 USDC

async function hirerAgent() {
  log(hirer.name, `online at ${hirer.address}`);
  log(hirer.name, `posting job: sha256 digest task, price ${ethers.formatUnits(PRICE, 6)} USDC`);

  const now = Math.floor(Date.now() / 1000);
  await (await hirer.usdc.approve(V2, PRICE)).wait();
  const tx = await hirer.escrow.createEscrow(worker.address, PRICE, now + 3600, 120, 0, "Agent job: sha256 digest");
  const receipt = await tx.wait();
  const id = await hirer.escrow.escrowCount();
  log(hirer.name, `escrow #${id} funded (tx ${receipt.hash})`);

  fs.writeFileSync(
    MAIL + "/job.json",
    JSON.stringify({ escrowId: id.toString(), task: "sha256", dataset: DATASET, price: PRICE.toString() }, null, 2)
  );

  // wait for delivery, then verify objectively before paying
  for (;;) {
    await sleep(3000);
    const e = await hirer.escrow.getEscrow(id);
    if (Number(e.state) === 1) {
      const delivery = JSON.parse(fs.readFileSync(MAIL + "/delivery.json", "utf8"));
      log(hirer.name, `delivery received: ${delivery.digest}`);
      if (delivery.digest === EXPECTED) {
        const rel = await hirer.escrow.release(id);
        await rel.wait();
        log(hirer.name, `digest verified ✓ — released payment (tx ${rel.hash})`);
      } else {
        log(hirer.name, "digest MISMATCH — would raiseDispute here (arbiter path)");
      }
      return;
    }
  }
}

async function workerAgent() {
  log(worker.name, `online at ${worker.address} (floor: ${ethers.formatUnits(WORKER_FLOOR, 6)} USDC)`);
  for (;;) {
    await sleep(2000);
    const jobFile = MAIL + "/job.json";
    if (!fs.existsSync(jobFile)) continue;
    const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
    if (BigInt(job.price) < WORKER_FLOOR) {
      log(worker.name, "job below floor — ignored");
      return;
    }
    log(worker.name, `accepted job on escrow #${job.escrowId}; doing the work…`);
    const digest = crypto.createHash("sha256").update(job.dataset).digest("hex");
    fs.writeFileSync(MAIL + "/delivery.json", JSON.stringify({ escrowId: job.escrowId, digest }, null, 2));
    const tx = await worker.escrow.markDelivered(BigInt(job.escrowId));
    await tx.wait();
    log(worker.name, `marked delivered (tx ${tx.hash}); awaiting release`);
    return;
  }
}

await Promise.all([hirerAgent(), workerAgent()]);
const bal = await worker.usdc.balanceOf(worker.address);
log("demo", `complete. Worker USDC balance: ${ethers.formatUnits(bal, 6)}`);
