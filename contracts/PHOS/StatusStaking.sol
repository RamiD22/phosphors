// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StatusStaking
 * @notice Stake $PHOS to climb status tiers and unlock prestige benefits
 * @dev Implements tiered staking with multipliers and badges
 * 
 * Artist Tiers:
 *   - Bronze (100 PHOS): 🥉 Bronze badge, profile border
 *   - Silver (500 PHOS): 🥈 Silver badge, 1.25x leaderboard multiplier
 *   - Gold (2000 PHOS): 🥇 Gold badge, 1.5x multiplier, gallery spotlight
 *   - Diamond (10000 PHOS): 💎 Diamond badge, 2x multiplier, homepage feature
 * 
 * Collector Tiers:
 *   - Collector (100 PHOS): 🎨 Collector badge
 *   - Connoisseur (1000 PHOS): 🖼️ Connoisseur badge, early drop access
 *   - Patron (5000 PHOS): 👑 Patron badge, exclusive pieces, artist intros
 */
contract StatusStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    /// @notice The $PHOS token contract
    IERC20 public immutable phosToken;
    
    /// @notice Timelock duration for unstaking (7 days)
    uint256 public constant UNSTAKE_TIMELOCK = 7 days;
    
    /// @notice Artist tier thresholds (in wei, assuming 18 decimals)
    uint256 public constant BRONZE_THRESHOLD = 100 * 1e18;     // 100 PHOS
    uint256 public constant SILVER_THRESHOLD = 500 * 1e18;     // 500 PHOS
    uint256 public constant GOLD_THRESHOLD = 2000 * 1e18;      // 2,000 PHOS
    uint256 public constant DIAMOND_THRESHOLD = 10000 * 1e18;  // 10,000 PHOS
    
    /// @notice Collector tier thresholds
    uint256 public constant COLLECTOR_THRESHOLD = 100 * 1e18;     // 100 PHOS
    uint256 public constant CONNOISSEUR_THRESHOLD = 1000 * 1e18;  // 1,000 PHOS
    uint256 public constant PATRON_THRESHOLD = 5000 * 1e18;       // 5,000 PHOS
    
    /// @notice Leaderboard multipliers (basis points, 10000 = 1x)
    uint256 public constant BRONZE_MULTIPLIER = 10000;   // 1x
    uint256 public constant SILVER_MULTIPLIER = 12500;   // 1.25x
    uint256 public constant GOLD_MULTIPLIER = 15000;     // 1.5x
    uint256 public constant DIAMOND_MULTIPLIER = 20000;  // 2x
    
    /// @notice Artist tier levels
    enum ArtistTier { None, Bronze, Silver, Gold, Diamond }
    
    /// @notice Collector tier levels
    enum CollectorTier { None, Collector, Connoisseur, Patron }
    
    /// @notice Staker information
    struct StakeInfo {
        uint256 stakedAmount;
        uint256 unstakeRequestTime;
        uint256 unstakeRequestAmount;
        bool isSlashed;
        bool isArtist;  // true = artist tiers, false = collector tiers
    }
    
    /// @notice Mapping of agent address to stake info
    mapping(address => StakeInfo) public stakes;
    
    /// @notice Total $PHOS staked in the contract
    uint256 public totalStaked;
    
    /// @notice Treasury address for slashed funds
    address public treasury;
    
    // Events
    event Staked(address indexed agent, uint256 amount, bool isArtist);
    event UnstakeRequested(address indexed agent, uint256 amount);
    event Unstaked(address indexed agent, uint256 amount);
    event Slashed(address indexed agent, uint256 amount, string reason);
    event Reinstated(address indexed agent);
    event TierChanged(address indexed agent, uint256 newTier, bool isArtist);
    
    // Errors
    error InsufficientStake();
    error NoUnstakeRequest();
    error TimelockNotExpired();
    error AlreadySlashed();
    error NotSlashed();
    error ZeroAmount();
    
    constructor(address _phosToken, address _treasury) Ownable(msg.sender) {
        phosToken = IERC20(_phosToken);
        treasury = _treasury;
    }
    
    /**
     * @notice Stake $PHOS to achieve status tier
     * @param amount Amount of $PHOS to stake
     * @param isArtist True for artist tiers, false for collector tiers
     */
    function stake(uint256 amount, bool isArtist) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        
        StakeInfo storage info = stakes[msg.sender];
        if (info.isSlashed) revert AlreadySlashed();
        
        // Transfer tokens to contract
        phosToken.safeTransferFrom(msg.sender, address(this), amount);
        
        uint256 previousAmount = info.stakedAmount;
        info.stakedAmount += amount;
        info.isArtist = isArtist;
        totalStaked += amount;
        
        emit Staked(msg.sender, amount, isArtist);
        
        // Check for tier change
        if (isArtist) {
            ArtistTier prevTier = _getArtistTier(previousAmount);
            ArtistTier newTier = _getArtistTier(info.stakedAmount);
            if (newTier != prevTier) {
                emit TierChanged(msg.sender, uint256(newTier), true);
            }
        } else {
            CollectorTier prevTier = _getCollectorTier(previousAmount);
            CollectorTier newTier = _getCollectorTier(info.stakedAmount);
            if (newTier != prevTier) {
                emit TierChanged(msg.sender, uint256(newTier), false);
            }
        }
    }
    
    /**
     * @notice Request to unstake $PHOS (starts timelock)
     * @param amount Amount to unstake
     */
    function requestUnstake(uint256 amount) external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > info.stakedAmount) revert InsufficientStake();
        
        info.unstakeRequestTime = block.timestamp;
        info.unstakeRequestAmount = amount;
        
        emit UnstakeRequested(msg.sender, amount);
    }
    
    /**
     * @notice Complete unstaking after timelock expires
     */
    function unstake() external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        if (info.unstakeRequestAmount == 0) revert NoUnstakeRequest();
        if (block.timestamp < info.unstakeRequestTime + UNSTAKE_TIMELOCK) {
            revert TimelockNotExpired();
        }
        
        uint256 amount = info.unstakeRequestAmount;
        info.stakedAmount -= amount;
        info.unstakeRequestTime = 0;
        info.unstakeRequestAmount = 0;
        totalStaked -= amount;
        
        phosToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount);
    }
    
    /**
     * @notice Slash a staker's funds (admin only)
     * @param agent Address to slash
     * @param reason Reason for slashing
     */
    function slash(address agent, string calldata reason) external onlyOwner {
        StakeInfo storage info = stakes[agent];
        if (info.isSlashed) revert AlreadySlashed();
        if (info.stakedAmount == 0) revert InsufficientStake();
        
        uint256 slashedAmount = info.stakedAmount;
        info.stakedAmount = 0;
        info.isSlashed = true;
        info.unstakeRequestTime = 0;
        info.unstakeRequestAmount = 0;
        totalStaked -= slashedAmount;
        
        // Send slashed funds to treasury
        phosToken.safeTransfer(treasury, slashedAmount);
        
        emit Slashed(agent, slashedAmount, reason);
    }
    
    /**
     * @notice Reinstate a slashed agent (admin only)
     * @param agent Address to reinstate
     */
    function reinstate(address agent) external onlyOwner {
        StakeInfo storage info = stakes[agent];
        if (!info.isSlashed) revert NotSlashed();
        
        info.isSlashed = false;
        emit Reinstated(agent);
    }
    
    // View functions
    
    /**
     * @notice Get artist tier for an amount
     */
    function _getArtistTier(uint256 amount) internal pure returns (ArtistTier) {
        if (amount >= DIAMOND_THRESHOLD) return ArtistTier.Diamond;
        if (amount >= GOLD_THRESHOLD) return ArtistTier.Gold;
        if (amount >= SILVER_THRESHOLD) return ArtistTier.Silver;
        if (amount >= BRONZE_THRESHOLD) return ArtistTier.Bronze;
        return ArtistTier.None;
    }
    
    /**
     * @notice Get collector tier for an amount
     */
    function _getCollectorTier(uint256 amount) internal pure returns (CollectorTier) {
        if (amount >= PATRON_THRESHOLD) return CollectorTier.Patron;
        if (amount >= CONNOISSEUR_THRESHOLD) return CollectorTier.Connoisseur;
        if (amount >= COLLECTOR_THRESHOLD) return CollectorTier.Collector;
        return CollectorTier.None;
    }
    
    /**
     * @notice Get artist tier for an address
     */
    function getArtistTier(address agent) external view returns (ArtistTier) {
        return _getArtistTier(stakes[agent].stakedAmount);
    }
    
    /**
     * @notice Get collector tier for an address
     */
    function getCollectorTier(address agent) external view returns (CollectorTier) {
        return _getCollectorTier(stakes[agent].stakedAmount);
    }
    
    /**
     * @notice Get leaderboard multiplier for an address (basis points)
     */
    function getMultiplier(address agent) external view returns (uint256) {
        StakeInfo storage info = stakes[agent];
        if (!info.isArtist) return 10000; // Collectors don't get multipliers
        
        ArtistTier tier = _getArtistTier(info.stakedAmount);
        if (tier == ArtistTier.Diamond) return DIAMOND_MULTIPLIER;
        if (tier == ArtistTier.Gold) return GOLD_MULTIPLIER;
        if (tier == ArtistTier.Silver) return SILVER_MULTIPLIER;
        if (tier == ArtistTier.Bronze) return BRONZE_MULTIPLIER;
        return 10000;
    }
    
    /**
     * @notice Get full stake info for an address
     */
    function getStakeInfo(address agent) external view returns (
        uint256 stakedAmount,
        ArtistTier artistTier,
        CollectorTier collectorTier,
        uint256 multiplier,
        bool isSlashed,
        uint256 unstakeRequestTime,
        uint256 unstakeRequestAmount
    ) {
        StakeInfo storage info = stakes[agent];
        return (
            info.stakedAmount,
            _getArtistTier(info.stakedAmount),
            _getCollectorTier(info.stakedAmount),
            info.isArtist ? this.getMultiplier(agent) : 10000,
            info.isSlashed,
            info.unstakeRequestTime,
            info.unstakeRequestAmount
        );
    }
    
    /**
     * @notice Update treasury address (admin only)
     */
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
