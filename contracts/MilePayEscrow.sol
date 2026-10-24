// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilePayEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant USDC = 0x3600000000000000000000000000000000000000;

    enum State {
        Funded,
        Delivered,
        Released,
        Refunded
    }

    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        uint256 deadline;
        uint256 reviewWindowSeconds;
        uint256 deliveredAt;
        State state;
        string title;
    }

    uint256 private _escrowCount;
    mapping(uint256 id => Escrow escrow) private _escrows;

    error NotPayee();
    error NotPayer();
    error InvalidState();
    error DeadlineNotPassed();
    error ReviewWindowNotPassed();
    error InvalidPayee();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewWindow();

    event EscrowCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 deadline,
        string title
    );
    event Delivered(uint256 indexed id, uint256 deliveredAt);
    event Released(uint256 indexed id);
    event Refunded(uint256 indexed id);

    constructor() {
        _escrowCount = 1;
    }

    function createEscrow(
        address payee,
        uint256 amount,
        uint256 deadline,
        uint256 reviewWindowSeconds,
        string calldata title
    ) external nonReentrant returns (uint256) {
        if (payee == address(0)) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (reviewWindowSeconds == 0) revert InvalidReviewWindow();

        uint256 id = _escrowCount;
        _escrowCount = id + 1;

        _escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            deadline: deadline,
            reviewWindowSeconds: reviewWindowSeconds,
            deliveredAt: 0,
            state: State.Funded,
            title: title
        });

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(id, msg.sender, payee, amount, deadline, title);

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
        IERC20(USDC).safeTransfer(escrow.payee, escrow.amount);

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
        IERC20(USDC).safeTransfer(escrow.payee, escrow.amount);

        emit Released(id);
    }

    function refund(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.payer) revert NotPayer();
        if (escrow.state != State.Funded) revert InvalidState();
        if (block.timestamp <= escrow.deadline) revert DeadlineNotPassed();

        escrow.state = State.Refunded;
        IERC20(USDC).safeTransfer(escrow.payer, escrow.amount);

        emit Refunded(id);
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrows[id];
    }

    function escrowCount() external view returns (uint256) {
        return _escrowCount - 1;
    }
}
