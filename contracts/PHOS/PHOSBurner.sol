// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PHOSBurner
 * @notice Receives $PHOS from sales fees and burns them, creating deflationary pressure
 * @dev Platform fees flow here and are permanently removed from circulation
 */
contract PHOSBurner is Ownable, ReentrancyGuard {
    /// @notice The $PHOS token contract (must be ERC20Burnable)
    IERC20 public immutable phosToken;
    
    /// @notice Total $PHOS burned through this contract
    uint256 public totalBurned;
    
    /// @notice Running count of burn operations
    uint256 public burnCount;
    
    /// @notice Addresses authorized to trigger burns
    mapping(address => bool) public burners;
    
    /// @notice Burn record for transparency
    struct BurnRecord {
        address initiator;
        uint256 amount;
        uint256 timestamp;
        string reason;
    }
    
    /// @notice Historical burn records
    BurnRecord[] public burnHistory;
    
    // Events
    event BurnExecuted(
        uint256 indexed burnId,
        address indexed initiator,
        uint256 amount,
        uint256 totalBurnedAfter,
        string reason
    );
    event BurnerAdded(address indexed burner);
    event BurnerRemoved(address indexed burner);
    event TokensReceived(address indexed from, uint256 amount);
    
    // Errors
    error NotAuthorized();
    error ZeroAmount();
    error InsufficientBalance();
    error InvalidAddress();
    
    modifier onlyBurner() {
        if (!burners[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }
    
    /**
     * @notice Deploy the burner contract
     * @param _phosToken Address of the $PHOS token contract
     */
    constructor(address _phosToken) Ownable(msg.sender) {
        if (_phosToken == address(0)) revert InvalidAddress();
        phosToken = IERC20(_phosToken);
    }
    
    /**
     * @notice Burn all $PHOS currently held by this contract
     * @param reason Description of why the burn occurred (e.g., "Q1 2026 fee accumulation")
     */
    function burnAll(string calldata reason) external onlyBurner nonReentrant {
        uint256 balance = phosToken.balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        
        _executeBurn(balance, reason);
    }
    
    /**
     * @notice Burn a specific amount of $PHOS
     * @param amount Amount to burn (in wei)
     * @param reason Description of why the burn occurred
     */
    function burn(uint256 amount, string calldata reason) external onlyBurner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        
        uint256 balance = phosToken.balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();
        
        _executeBurn(amount, reason);
    }
    
    /**
     * @notice Internal burn execution
     * @param amount Amount to burn
     * @param reason Burn reason for records
     */
    function _executeBurn(uint256 amount, string calldata reason) internal {
        // Call burn on the ERC20Burnable token
        ERC20Burnable(address(phosToken)).burn(amount);
        
        totalBurned += amount;
        uint256 burnId = burnCount++;
        
        burnHistory.push(BurnRecord({
            initiator: msg.sender,
            amount: amount,
            timestamp: block.timestamp,
            reason: reason
        }));
        
        emit BurnExecuted(burnId, msg.sender, amount, totalBurned, reason);
    }
    
    /**
     * @notice Get current balance pending burn
     */
    function pendingBurn() external view returns (uint256) {
        return phosToken.balanceOf(address(this));
    }
    
    /**
     * @notice Get burn record by ID
     * @param burnId The burn operation ID
     */
    function getBurnRecord(uint256 burnId) external view returns (BurnRecord memory) {
        require(burnId < burnHistory.length, "Invalid burn ID");
        return burnHistory[burnId];
    }
    
    /**
     * @notice Get recent burn records
     * @param count Number of records to retrieve
     */
    function getRecentBurns(uint256 count) external view returns (BurnRecord[] memory) {
        uint256 total = burnHistory.length;
        if (count > total) count = total;
        
        BurnRecord[] memory recent = new BurnRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = burnHistory[total - count + i];
        }
        return recent;
    }
    
    // Admin functions
    
    /**
     * @notice Add an authorized burner address
     * @param burner Address to authorize
     */
    function addBurner(address burner) external onlyOwner {
        if (burner == address(0)) revert InvalidAddress();
        burners[burner] = true;
        emit BurnerAdded(burner);
    }
    
    /**
     * @notice Remove an authorized burner
     * @param burner Address to remove
     */
    function removeBurner(address burner) external onlyOwner {
        burners[burner] = false;
        emit BurnerRemoved(burner);
    }
    
    /**
     * @notice Emergency withdrawal (only for non-PHOS tokens accidentally sent)
     * @param token The token to withdraw
     * @param to Recipient address
     */
    function emergencyWithdraw(address token, address to) external onlyOwner {
        if (token == address(phosToken)) revert NotAuthorized();
        if (to == address(0)) revert InvalidAddress();
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, balance);
    }
}
