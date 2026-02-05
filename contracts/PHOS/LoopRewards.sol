// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LoopRewards
 * @notice Distributes $PHOS rewards when agents complete "the loop"
 * @dev Listens for LoopCompleted events from PurchaseRegistry and rewards participants
 * 
 * The Loop: When an agent both buys AND sells art, they've completed the loop.
 * This creates a circular economy where agents aren't just consumers or producers
 * but active participants in the creative ecosystem.
 */
contract LoopRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    /// @notice The $PHOS token contract
    IERC20 public immutable phosToken;
    
    /// @notice The PurchaseRegistry contract
    address public purchaseRegistry;
    
    /// @notice Reward amount for completing the loop
    uint256 public loopReward = 50 * 1e18; // 50 PHOS default
    
    /// @notice Reward for being the counterparty in a loop completion
    uint256 public counterpartyReward = 10 * 1e18; // 10 PHOS default
    
    /// @notice Track if an agent has claimed their loop reward
    mapping(address => bool) public hasClaimedLoopReward;
    
    /// @notice Total rewards distributed
    uint256 public totalDistributed;
    
    /// @notice Number of loop completions rewarded
    uint256 public loopsRewarded;
    
    /// @notice Addresses authorized to trigger reward distribution
    mapping(address => bool) public distributors;
    
    /// @notice Reward record for transparency
    struct RewardRecord {
        address recipient;
        uint256 amount;
        uint256 timestamp;
        RewardType rewardType;
    }
    
    enum RewardType { LoopCompletion, Counterparty }
    
    /// @notice Historical reward records
    RewardRecord[] public rewardHistory;
    
    // Events
    event LoopRewardDistributed(
        address indexed agent,
        uint256 amount,
        uint256 totalDistributedAfter
    );
    event CounterpartyRewardDistributed(
        address indexed agent,
        address indexed loopCompleter,
        uint256 amount
    );
    event RewardAmountUpdated(uint256 loopReward, uint256 counterpartyReward);
    event PurchaseRegistryUpdated(address indexed registry);
    event DistributorAdded(address indexed distributor);
    event DistributorRemoved(address indexed distributor);
    event RewardPoolFunded(address indexed funder, uint256 amount);
    
    // Errors
    error NotAuthorized();
    error AlreadyClaimed();
    error InsufficientRewardPool();
    error InvalidAddress();
    error ZeroAmount();
    
    modifier onlyDistributor() {
        if (!distributors[msg.sender] && msg.sender != owner() && msg.sender != purchaseRegistry) {
            revert NotAuthorized();
        }
        _;
    }
    
    /**
     * @notice Deploy the rewards contract
     * @param _phosToken Address of the $PHOS token
     * @param _purchaseRegistry Address of the PurchaseRegistry contract
     */
    constructor(address _phosToken, address _purchaseRegistry) Ownable(msg.sender) {
        if (_phosToken == address(0)) revert InvalidAddress();
        
        phosToken = IERC20(_phosToken);
        purchaseRegistry = _purchaseRegistry;
    }
    
    /**
     * @notice Distribute reward when an agent completes the loop
     * @param agent The agent who completed the loop
     * @param counterparty The other agent involved (buyer or seller that triggered completion)
     * @dev Can be called by PurchaseRegistry or authorized distributors
     */
    function distributeLoopReward(
        address agent,
        address counterparty
    ) external onlyDistributor nonReentrant {
        if (hasClaimedLoopReward[agent]) revert AlreadyClaimed();
        
        uint256 totalNeeded = loopReward + (counterparty != address(0) ? counterpartyReward : 0);
        if (phosToken.balanceOf(address(this)) < totalNeeded) {
            revert InsufficientRewardPool();
        }
        
        // Mark as claimed before transfers (reentrancy protection)
        hasClaimedLoopReward[agent] = true;
        
        // Distribute loop completion reward
        phosToken.safeTransfer(agent, loopReward);
        totalDistributed += loopReward;
        loopsRewarded++;
        
        rewardHistory.push(RewardRecord({
            recipient: agent,
            amount: loopReward,
            timestamp: block.timestamp,
            rewardType: RewardType.LoopCompletion
        }));
        
        emit LoopRewardDistributed(agent, loopReward, totalDistributed);
        
        // Distribute counterparty reward
        if (counterparty != address(0) && counterpartyReward > 0) {
            phosToken.safeTransfer(counterparty, counterpartyReward);
            totalDistributed += counterpartyReward;
            
            rewardHistory.push(RewardRecord({
                recipient: counterparty,
                amount: counterpartyReward,
                timestamp: block.timestamp,
                rewardType: RewardType.Counterparty
            }));
            
            emit CounterpartyRewardDistributed(counterparty, agent, counterpartyReward);
        }
    }
    
    /**
     * @notice Check if an agent can claim loop reward
     * @param agent Address to check
     */
    function canClaimReward(address agent) external view returns (bool) {
        return !hasClaimedLoopReward[agent];
    }
    
    /**
     * @notice Get current reward pool balance
     */
    function rewardPoolBalance() external view returns (uint256) {
        return phosToken.balanceOf(address(this));
    }
    
    /**
     * @notice Get reward record by ID
     */
    function getRewardRecord(uint256 id) external view returns (RewardRecord memory) {
        require(id < rewardHistory.length, "Invalid record ID");
        return rewardHistory[id];
    }
    
    /**
     * @notice Get recent reward records
     */
    function getRecentRewards(uint256 count) external view returns (RewardRecord[] memory) {
        uint256 total = rewardHistory.length;
        if (count > total) count = total;
        
        RewardRecord[] memory recent = new RewardRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = rewardHistory[total - count + i];
        }
        return recent;
    }
    
    /**
     * @notice Get statistics
     */
    function getStats() external view returns (
        uint256 _totalDistributed,
        uint256 _loopsRewarded,
        uint256 _rewardPoolBalance,
        uint256 _loopReward,
        uint256 _counterpartyReward
    ) {
        return (
            totalDistributed,
            loopsRewarded,
            phosToken.balanceOf(address(this)),
            loopReward,
            counterpartyReward
        );
    }
    
    // Admin functions
    
    /**
     * @notice Update reward amounts
     * @param _loopReward New reward for loop completion
     * @param _counterpartyReward New reward for counterparty
     */
    function setRewardAmounts(uint256 _loopReward, uint256 _counterpartyReward) external onlyOwner {
        loopReward = _loopReward;
        counterpartyReward = _counterpartyReward;
        emit RewardAmountUpdated(_loopReward, _counterpartyReward);
    }
    
    /**
     * @notice Update PurchaseRegistry address
     */
    function setPurchaseRegistry(address _registry) external onlyOwner {
        purchaseRegistry = _registry;
        emit PurchaseRegistryUpdated(_registry);
    }
    
    /**
     * @notice Add authorized distributor
     */
    function addDistributor(address distributor) external onlyOwner {
        if (distributor == address(0)) revert InvalidAddress();
        distributors[distributor] = true;
        emit DistributorAdded(distributor);
    }
    
    /**
     * @notice Remove authorized distributor
     */
    function removeDistributor(address distributor) external onlyOwner {
        distributors[distributor] = false;
        emit DistributorRemoved(distributor);
    }
    
    /**
     * @notice Fund the reward pool (anyone can call)
     * @param amount Amount of $PHOS to add to the pool
     */
    function fundRewardPool(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        phosToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardPoolFunded(msg.sender, amount);
    }
    
    /**
     * @notice Emergency withdrawal (owner only)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        phosToken.safeTransfer(to, amount);
    }
}
