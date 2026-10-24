// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MilePayV2 — milestone escrow with public-jury dispute resolution and payroll streams
/// @notice Extends the MilePay v1 escrow (built in Arc Studio, deployed on Arc Mainnet)
///         with two new primitives:
///         1. Public jury arbitration: if either party disputes before settlement, the
///            escrow freezes and both sides publish evidence. Anyone else may vote
///            during the jury window; the majority decides who is paid. A tie splits
///            the amount 50/50. No single arbiter exists to bribe, coerce, or trust.
///         2. Payroll streams: a payer pre-funds N periods of salary; one installment
///            vests per period and the payee claims vested installments at any time.
///         The v1 guarantees are unchanged: the payer can never redirect escrowed
///         funds, and every settlement path is enforced by the contract alone.
contract MilePayV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    // ---------------------------------------------------------------- escrows

    enum State {
        Funded, // 0 — v1 numbering preserved
        Delivered, // 1
        Released, // 2
        Refunded, // 3
        Disputed, // 4 — v2
        Resolved // 5 — v2 (jury decision)
    }

    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        uint256 deadline;
        uint256 reviewWindowSeconds;
        uint256 deliveredAt;
        uint256 juryWindowSeconds; // 0 = disputes disabled for this escrow
        uint256 disputeEndsAt;
        uint256 payeeVotes;
        uint256 payerVotes;
        State state;
        string title;
    }

    uint256 private _escrowCount; // last issued id (ids start at 1)
    mapping(uint256 id => Escrow escrow) private _escrows;
    mapping(uint256 id => mapping(address juror => bool)) private _hasVoted;

    // ---------------------------------------------------------------- streams

    struct Stream {
        address payer;
        address payee;
        uint256 amountPerPeriod;
        uint256 periodSeconds;
        uint256 totalPeriods;
        uint256 claimedPeriods;
        uint256 startTime;
        bool cancelled;
        uint256 vestedCap; // set at cancellation: periods vested by then
        string title;
    }

    uint256 private _streamCount; // last issued id (ids start at 1)
    mapping(uint256 id => Stream stream) private _streams;

    // ---------------------------------------------------------------- errors

    error NotPayee();
    error NotPayer();
    error NotParty();
    error InvalidState();
    error DeadlineNotPassed();
    error ReviewWindowNotPassed();
    error InvalidPayee();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewWindow();
    error NoJury();
    error PartyCannotVote();
    error AlreadyVoted();
    error VotingClosed();
    error VotingOpen();
    error InvalidPeriod();
    error InvalidPeriods();
    error NothingToClaim();
    error AlreadyCancelled();

    // ---------------------------------------------------------------- events

    event EscrowCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 deadline,
        uint256 juryWindowSeconds,
        string title
    );
    event Delivered(uint256 indexed id, uint256 deliveredAt);
    event Released(uint256 indexed id);
    event Refunded(uint256 indexed id);
    event DisputeRaised(uint256 indexed id, address indexed raisedBy, uint256 disputeEndsAt);
    event EvidenceSubmitted(uint256 indexed id, address indexed party, string uri);
    event JuryVoted(uint256 indexed id, address indexed juror, bool supportPayee);
    event JuryResolved(uint256 indexed id, uint256 payeeVotes, uint256 payerVotes, uint256 payeeAmount, uint256 payerAmount);
    event StreamCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amountPerPeriod,
        uint256 periodSeconds,
        uint256 totalPeriods,
        string title
    );
    event InstallmentClaimed(uint256 indexed id, uint256 periods, uint256 amount);
    event StreamCancelled(uint256 indexed id, uint256 refundedAmount);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "usdc=0");
        usdc = IERC20(usdcAddress);
    }

    // ================================================================ escrows

    function createEscrow(
        address payee,
        uint256 amount,
        uint256 deadline,
        uint256 reviewWindowSeconds,
        uint256 juryWindowSeconds,
        string calldata title
    ) external nonReentrant returns (uint256) {
        if (payee == address(0) || payee == msg.sender) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (reviewWindowSeconds == 0) revert InvalidReviewWindow();

        uint256 id = ++_escrowCount;

        _escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            deadline: deadline,
            reviewWindowSeconds: reviewWindowSeconds,
            deliveredAt: 0,
            juryWindowSeconds: juryWindowSeconds,
            disputeEndsAt: 0,
            payeeVotes: 0,
            payerVotes: 0,
            state: State.Funded,
            title: title
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(id, msg.sender, payee, amount, deadline, juryWindowSeconds, title);

        return id;
    }

    function markDelivered(uint256 id) external {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payee) revert NotPayee();
        if (escrow.state != State.Funded) revert InvalidState();

        escrow.state = State.Delivered;
        escrow.deliveredAt = block.timestamp;

        emit Delivered(id, block.timestamp);
    }

    function release(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payer) revert NotPayer();
        if (escrow.state != State.Funded && escrow.state != State.Delivered) revert InvalidState();

        escrow.state = State.Released;
        usdc.safeTransfer(escrow.payee, escrow.amount);

        emit Released(id);
    }

    function claimAfterReview(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payee) revert NotPayee();
        if (escrow.state != State.Delivered) revert InvalidState();
        if (block.timestamp <= escrow.deliveredAt + escrow.reviewWindowSeconds) {
            revert ReviewWindowNotPassed();
        }

        escrow.state = State.Released;
        usdc.safeTransfer(escrow.payee, escrow.amount);

        emit Released(id);
    }

    function refund(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payer) revert NotPayer();
        if (escrow.state != State.Funded) revert InvalidState();
        if (block.timestamp <= escrow.deadline) revert DeadlineNotPassed();

        escrow.state = State.Refunded;
        usdc.safeTransfer(escrow.payer, escrow.amount);

        emit Refunded(id);
    }

    // ------------------------------------------------------------ public jury

    /// @notice Either party freezes the escrow into dispute. All automatic
    ///         settlement paths stop applying; the public jury decides.
    function raiseDispute(uint256 id) external {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payer && msg.sender != escrow.payee) revert NotParty();
        if (escrow.juryWindowSeconds == 0) revert NoJury();
        if (escrow.state != State.Funded && escrow.state != State.Delivered) revert InvalidState();

        escrow.state = State.Disputed;
        escrow.disputeEndsAt = block.timestamp + escrow.juryWindowSeconds;

        emit DisputeRaised(id, msg.sender, escrow.disputeEndsAt);
    }

    /// @notice A party publishes evidence for the jury (an IPFS/URL link to
    ///         their materials) while voting is open.
    function submitEvidence(uint256 id, string calldata uri) external {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payer && msg.sender != escrow.payee) revert NotParty();
        if (escrow.state != State.Disputed) revert InvalidState();
        if (block.timestamp > escrow.disputeEndsAt) revert VotingClosed();

        emit EvidenceSubmitted(id, msg.sender, uri);
    }

    /// @notice Vote in an open dispute. One vote per address; the two parties
    ///         cannot vote. `supportPayee` = the payee should be paid in full,
    ///         otherwise the payer should be refunded in full.
    function vote(uint256 id, bool supportPayee) external {
        Escrow storage escrow = _escrows[id];

        if (escrow.state != State.Disputed) revert InvalidState();
        if (block.timestamp > escrow.disputeEndsAt) revert VotingClosed();
        if (msg.sender == escrow.payer || msg.sender == escrow.payee) revert PartyCannotVote();
        if (_hasVoted[id][msg.sender]) revert AlreadyVoted();

        _hasVoted[id][msg.sender] = true;
        if (supportPayee) {
            escrow.payeeVotes += 1;
        } else {
            escrow.payerVotes += 1;
        }

        emit JuryVoted(id, msg.sender, supportPayee);
    }

    /// @notice Settle a dispute after the jury window closes. Anyone may call.
    ///         Majority wins the full amount; a tie (including no votes at
    ///         all) splits 50/50 with rounding dust to the payer.
    function resolveDispute(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (escrow.state != State.Disputed) revert InvalidState();
        if (block.timestamp <= escrow.disputeEndsAt) revert VotingOpen();

        uint256 payeeAmount = 0;
        uint256 payerAmount = 0;
        if (escrow.payeeVotes > escrow.payerVotes) {
            payeeAmount = escrow.amount;
        } else if (escrow.payerVotes > escrow.payeeVotes) {
            payerAmount = escrow.amount;
        } else {
            payeeAmount = escrow.amount / 2;
            payerAmount = escrow.amount - payeeAmount;
        }

        escrow.state = State.Resolved;

        if (payeeAmount > 0) usdc.safeTransfer(escrow.payee, payeeAmount);
        if (payerAmount > 0) usdc.safeTransfer(escrow.payer, payerAmount);

        emit JuryResolved(id, escrow.payeeVotes, escrow.payerVotes, payeeAmount, payerAmount);
    }

    function hasVoted(uint256 id, address juror) external view returns (bool) {
        return _hasVoted[id][juror];
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrows[id];
    }

    function escrowCount() external view returns (uint256) {
        return _escrowCount;
    }

    // ================================================================ streams

    /// @notice Pre-fund a payroll stream: the full amount for all periods is
    ///         pulled up front. One installment vests per elapsed period.
    function createStream(
        address payee,
        uint256 amountPerPeriod,
        uint256 periodSeconds,
        uint256 totalPeriods,
        string calldata title
    ) external nonReentrant returns (uint256) {
        if (payee == address(0) || payee == msg.sender) revert InvalidPayee();
        if (amountPerPeriod == 0) revert InvalidAmount();
        if (periodSeconds == 0) revert InvalidPeriod();
        if (totalPeriods == 0) revert InvalidPeriods();

        uint256 id = ++_streamCount;

        _streams[id] = Stream({
            payer: msg.sender,
            payee: payee,
            amountPerPeriod: amountPerPeriod,
            periodSeconds: periodSeconds,
            totalPeriods: totalPeriods,
            claimedPeriods: 0,
            startTime: block.timestamp,
            cancelled: false,
            vestedCap: 0,
            title: title
        });

        usdc.safeTransferFrom(msg.sender, address(this), amountPerPeriod * totalPeriods);

        emit StreamCreated(id, msg.sender, payee, amountPerPeriod, periodSeconds, totalPeriods, title);

        return id;
    }

    function _vestedPeriods(Stream storage stream) internal view returns (uint256) {
        uint256 cap = stream.cancelled ? stream.vestedCap : stream.totalPeriods;
        uint256 elapsed = (block.timestamp - stream.startTime) / stream.periodSeconds;
        return elapsed < cap ? elapsed : cap;
    }

    /// @notice Claim every vested-but-unclaimed installment. Works after
    ///         cancellation too: installments vested by cancellation stay the
    ///         payee's.
    function claimInstallment(uint256 id) external nonReentrant {
        Stream storage stream = _streams[id];

        if (msg.sender != stream.payee) revert NotPayee();

        uint256 claimable = _vestedPeriods(stream) - stream.claimedPeriods;
        if (claimable == 0) revert NothingToClaim();

        stream.claimedPeriods += claimable;
        uint256 amount = claimable * stream.amountPerPeriod;
        usdc.safeTransfer(stream.payee, amount);

        emit InstallmentClaimed(id, claimable, amount);
    }

    /// @notice Stop the stream: installments not yet vested refund to the payer
    ///         immediately; vested-but-unclaimed installments stay claimable.
    function cancelStream(uint256 id) external nonReentrant {
        Stream storage stream = _streams[id];

        if (msg.sender != stream.payer) revert NotPayer();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = _vestedPeriods(stream);
        stream.cancelled = true;
        stream.vestedCap = vested;

        uint256 refundAmount = (stream.totalPeriods - vested) * stream.amountPerPeriod;
        if (refundAmount > 0) usdc.safeTransfer(stream.payer, refundAmount);

        emit StreamCancelled(id, refundAmount);
    }

    function claimablePeriods(uint256 id) external view returns (uint256) {
        Stream storage stream = _streams[id];
        return _vestedPeriods(stream) - stream.claimedPeriods;
    }

    function getStream(uint256 id) external view returns (Stream memory) {
        return _streams[id];
    }

    function streamCount() external view returns (uint256) {
        return _streamCount;
    }
}
