// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VerificationStaking
 * @notice Agents stake $PHOS to achieve verification tiers with benefits
 * @dev Implements tiered staking with timelock and admin slashing capability
 * 
 * Tiers:
 *   - Tier 1 (100 PHOS): Verified badge
 *   - Tier 2 (500 PHOS): Featured placement
 *   - Tier 3 (1000 PHOS): Premium tier
 */
contract VerificationStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    /// @notice The $PHOS token contract
    IERC20 public immutable phosToken;
    
    /// @notice Timelock duration for unstaking (7 days)
    uint256 public constant UNSTAKE_TIMELOCK = 7 days;
    
    /// @notice Tier thresholds (in wei, assuming 18 decimals)
    uint256 public constant TIER_1_THRESHOLD = 100 * 1e18;   // 100 PHOS
    uint256 public constant TIER_2_THRESHOLD = 500 * 1e18;   // 500 PHOS
    uint256 public constant TIER_3_THRESHOLD = 1000 * 1e18;  // 1000 PHOS
    
    /// @notice Verification tier levels
    enum Tier { None, Verified, Featured, Premium }
    
    /// @notice Staker information
    struct StakeInfo {
        uint256 stakedAmount;
        uint256 unstakeRequestTime;
        uint256 unstakeRequestAmount;
        bool isSlashed;
    }
    
    /// @notice Mapping of agent address to stake info
    mapping(address => StakeInfo) public stakes;
    
    /// @notice Total $PHOS staked in the contract
    uint256 public totalStaked;
    
    /// @notice Count of stakers per tier
    mapping(Tier => uint256) public tierCounts;
    
    /// @notice Addresses authorized to slash stakes
    mapping(address => bool) public slashers;
    
    /// @notice Treasury address for slashed tokens
    address public slashTreasury;
    
    // Events
    event Staked(address indexed agent, uint256 amount, Tier newTier);
    event UnstakeRequested(address indexed agent, uint256 amount, uint256 unlockTime);
    event UnstakeCancelled(address indexed agent);
    event Unstaked(address indexed agent, uint256 amount, Tier newTier);
    event Slashed(address indexed agent, uint256 amount, string reason);
    event SlasherAdded(address indexed slasher);
    event SlasherRemoved(address indexed slasher);
    event SlashTreasuryUpdated(address indexed treasury);
    
    // Errors
    error ZeroAmount();
    error InsufficientStake();
    error NoUnstakeRequest();
    error TimelockNotExpired();
    error AlreadySlashed();
    error NotAuthorized();
    error InvalidAddress();
    error UnstakeRequestPending();
    
    modifier onlySlasher() {
        if (!slashers[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }
    
    /**
     * @notice Deploy the staking contract
     * @param _phosToken Address of the $PHOS token
     * @param _slashTreasury Address to receive slashed tokens
     */
    constructor(address _phosToken, address _slashTreasury) Ownable(msg.sender) {
        if (_phosToken == address(0)) revert InvalidAddress();
        if (_slashTreasury == address(0)) revert InvalidAddress();
        
        phosToken = IERC20(_phosToken);
        slashTreasury = _slashTreasury;
    }
    
    /**
     * @notice Stake $PHOS to achieve verification tier
     * @param amount Amount of $PHOS to stake
     */
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        
        StakeInfo storage info = stakes[msg.sender];
        if (info.isSlashed) revert AlreadySlashed();
        
        // Cancel any pending unstake request if staking more
        if (info.unstakeRequestTime > 0) {
            info.unstakeRequestTime = 0;
            info.unstakeRequestAmount = 0;
            emit UnstakeCancelled(msg.sender);
        }
        
        Tier oldTier = getTier(msg.sender);
        
        // Transfer tokens to contract
        phosToken.safeTransferFrom(msg.sender, address(this), amount);
        
        info.stakedAmount += amount;
        totalStaked += amount;
        
        Tier newTier = _calculateTier(info.stakedAmount);
        
        // Update tier counts
        if (oldTier != newTier) {
            if (oldTier != Tier.None) tierCounts[oldTier]--;
            if (newTier != Tier.None) tierCounts[newTier]++;
        }
        
        emit Staked(msg.sender, amount, newTier);
    }
    
    /**
     * @notice Request to unstake tokens (starts timelock)
     * @param amount Amount to unstake
     */
    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        
        StakeInfo storage info = stakes[msg.sender];
        if (info.stakedAmount < amount) revert InsufficientStake();
        if (info.unstakeRequestTime > 0) revert UnstakeRequestPending();
        
        info.unstakeRequestTime = block.timestamp;
        info.unstakeRequestAmount = amount;
        
        uint256 unlockTime = block.timestamp + UNSTAKE_TIMELOCK;
        emit UnstakeRequested(msg.sender, amount, unlockTime);
    }
    
    /**
     * @notice Cancel a pending unstake request
     */
    function cancelUnstake() external {
        StakeInfo storage info = stakes[msg.sender];
        if (info.unstakeRequestTime == 0) revert NoUnstakeRequest();
        
        info.unstakeRequestTime = 0;
        info.unstakeRequestAmount = 0;
        
        emit UnstakeCancelled(msg.sender);
    }
    
    /**
     * @notice Complete unstaking after timelock expires
     */
    function unstake() external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        
        if (info.unstakeRequestTime == 0) revert NoUnstakeRequest();
        if (block.timestamp < info.unstakeRequestTime + UNSTAKE_TIMELOCK) {
            revert TimelockNotExpired();
        }
        
        uint256 amount = info.unstakeRequestAmount;
        Tier oldTier = getTier(msg.sender);
        
        info.stakedAmount -= amount;
        info.unstakeRequestTime = 0;
        info.unstakeRequestAmount = 0;
        totalStaked -= amount;
        
        Tier newTier = _calculateTier(info.stakedAmount);
        
        // Update tier counts
        if (oldTier != newTier) {
            if (oldTier != Tier.None) tierCounts[oldTier]--;
            if (newTier != Tier.None) tierCounts[newTier]++;
        }
        
        phosToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, newTier);
    }
    
    /**
     * @notice Slash an agent's stake (admin function for policy violations)
     * @param agent Address of the agent to slash
     * @param amount Amount to slash (0 = slash all)
     * @param reason Reason for slashing
     */
    function slash(address agent, uint256 amount, string calldata reason) external onlySlasher nonReentrant {
        StakeInfo storage info = stakes[agent];
        
        uint256 slashAmount = amount == 0 ? info.stakedAmount : amount;
        if (slashAmount > info.stakedAmount) slashAmount = info.stakedAmount;
        if (slashAmount == 0) revert ZeroAmount();
        
        Tier oldTier = getTier(agent);
        
        info.stakedAmount -= slashAmount;
        info.isSlashed = true;
        info.unstakeRequestTime = 0;
        info.unstakeRequestAmount = 0;
        totalStaked -= slashAmount;
        
        Tier newTier = _calculateTier(info.stakedAmount);
        
        // Update tier counts
        if (oldTier != newTier) {
            if (oldTier != Tier.None) tierCounts[oldTier]--;
            if (newTier != Tier.None) tierCounts[newTier]++;
        }
        
        // Send slashed tokens to treasury
        phosToken.safeTransfer(slashTreasury, slashAmount);
        
        emit Slashed(agent, slashAmount, reason);
    }
    
    /**
     * @notice Get the current tier of an agent
     * @param agent Address to check
     * @return tier The agent's current tier
     */
    function getTier(address agent) public view returns (Tier tier) {
        return _calculateTier(stakes[agent].stakedAmount);
    }
    
    /**
     * @notice Calculate tier based on staked amount
     */
    function _calculateTier(uint256 amount) internal pure returns (Tier) {
        if (amount >= TIER_3_THRESHOLD) return Tier.Premium;
        if (amount >= TIER_2_THRESHOLD) return Tier.Featured;
        if (amount >= TIER_1_THRESHOLD) return Tier.Verified;
        return Tier.None;
    }
    
    /**
     * @notice Check if an agent is verified (any tier)
     * @param agent Address to check
     */
    function isVerified(address agent) external view returns (bool) {
        return getTier(agent) != Tier.None;
    }
    
    /**
     * @notice Get full stake info for an agent
     * @param agent Address to check
     */
    function getStakeInfo(address agent) external view returns (
        uint256 stakedAmount,
        Tier tier,
        uint256 unstakeRequestTime,
        uint256 unstakeRequestAmount,
        uint256 timeUntilUnlock,
        bool isSlashed
    ) {
        StakeInfo storage info = stakes[agent];
        stakedAmount = info.stakedAmount;
        tier = getTier(agent);
        unstakeRequestTime = info.unstakeRequestTime;
        unstakeRequestAmount = info.unstakeRequestAmount;
        isSlashed = info.isSlashed;
        
        if (info.unstakeRequestTime > 0) {
            uint256 unlockTime = info.unstakeRequestTime + UNSTAKE_TIMELOCK;
            timeUntilUnlock = block.timestamp >= unlockTime ? 0 : unlockTime - block.timestamp;
        }
    }
    
    /**
     * @notice Get amount needed to reach next tier
     * @param agent Address to check
     */
    function amountToNextTier(address agent) external view returns (uint256 amount, Tier nextTier) {
        uint256 staked = stakes[agent].stakedAmount;
        
        if (staked < TIER_1_THRESHOLD) {
            return (TIER_1_THRESHOLD - staked, Tier.Verified);
        } else if (staked < TIER_2_THRESHOLD) {
            return (TIER_2_THRESHOLD - staked, Tier.Featured);
        } else if (staked < TIER_3_THRESHOLD) {
            return (TIER_3_THRESHOLD - staked, Tier.Premium);
        } else {
            return (0, Tier.Premium); // Already at max tier
        }
    }
    
    // Admin functions
    
    /**
     * @notice Add an authorized slasher
     */
    function addSlasher(address slasher) external onlyOwner {
        if (slasher == address(0)) revert InvalidAddress();
        slashers[slasher] = true;
        emit SlasherAdded(slasher);
    }
    
    /**
     * @notice Remove an authorized slasher
     */
    function removeSlasher(address slasher) external onlyOwner {
        slashers[slasher] = false;
        emit SlasherRemoved(slasher);
    }
    
    /**
     * @notice Update slash treasury address
     */
    function setSlashTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        slashTreasury = _treasury;
        emit SlashTreasuryUpdated(_treasury);
    }
    
    /**
     * @notice Reinstate a slashed agent (allow them to stake again)
     */
    function reinstateAgent(address agent) external onlyOwner {
        stakes[agent].isSlashed = false;
    }
}
