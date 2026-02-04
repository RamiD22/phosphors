// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Phosphors Purchase Registry
 * @notice On-chain record of agent-to-agent art purchases
 * @dev Demonstrates the "loop" - agents buying from agents who bought from agents
 */
contract PurchaseRegistry {
    struct Purchase {
        address buyer;
        address seller;
        string pieceId;
        uint256 priceUsdc;  // in 6 decimals (USDC)
        uint256 timestamp;
        bytes32 paymentTxHash;
    }

    Purchase[] public purchases;
    
    // Track agent activity
    mapping(address => uint256) public purchaseCount;
    mapping(address => uint256) public salesCount;
    mapping(address => bool) public isCollector;
    mapping(address => bool) public isArtist;
    
    // The loop: track if an address has both bought AND sold
    mapping(address => bool) public isInTheLoop;
    
    address public owner;
    address public recorder;  // The platform address that can record purchases
    
    event PurchaseRecorded(
        uint256 indexed purchaseId,
        address indexed buyer,
        address indexed seller,
        string pieceId,
        uint256 priceUsdc,
        bytes32 paymentTxHash
    );
    
    event LoopCompleted(address indexed agent);
    
    modifier onlyRecorder() {
        require(msg.sender == recorder || msg.sender == owner, "Not authorized");
        _;
    }
    
    constructor(address _recorder) {
        owner = msg.sender;
        recorder = _recorder;
    }
    
    /**
     * @notice Record a purchase that happened via x402 payment
     * @param buyer The agent wallet that bought
     * @param seller The artist wallet that sold
     * @param pieceId The off-chain piece identifier
     * @param priceUsdc Price in USDC (6 decimals)
     * @param paymentTxHash The USDC transfer transaction hash
     */
    function recordPurchase(
        address buyer,
        address seller,
        string calldata pieceId,
        uint256 priceUsdc,
        bytes32 paymentTxHash
    ) external onlyRecorder returns (uint256 purchaseId) {
        purchaseId = purchases.length;
        
        purchases.push(Purchase({
            buyer: buyer,
            seller: seller,
            pieceId: pieceId,
            priceUsdc: priceUsdc,
            timestamp: block.timestamp,
            paymentTxHash: paymentTxHash
        }));
        
        // Update stats
        purchaseCount[buyer]++;
        salesCount[seller]++;
        isCollector[buyer] = true;
        isArtist[seller] = true;
        
        // Check if buyer completed the loop (was a seller before)
        if (isArtist[buyer] && !isInTheLoop[buyer]) {
            isInTheLoop[buyer] = true;
            emit LoopCompleted(buyer);
        }
        
        // Check if seller completed the loop (was a buyer before)
        if (isCollector[seller] && !isInTheLoop[seller]) {
            isInTheLoop[seller] = true;
            emit LoopCompleted(seller);
        }
        
        emit PurchaseRecorded(purchaseId, buyer, seller, pieceId, priceUsdc, paymentTxHash);
    }
    
    /**
     * @notice Get total number of purchases
     */
    function totalPurchases() external view returns (uint256) {
        return purchases.length;
    }
    
    /**
     * @notice Get purchase details by ID
     */
    function getPurchase(uint256 id) external view returns (Purchase memory) {
        require(id < purchases.length, "Invalid purchase ID");
        return purchases[id];
    }
    
    /**
     * @notice Check if an agent is "in the loop" (both bought and sold)
     */
    function checkLoop(address agent) external view returns (bool bought, bool sold, bool inLoop) {
        bought = isCollector[agent];
        sold = isArtist[agent];
        inLoop = isInTheLoop[agent];
    }
    
    /**
     * @notice Get recent purchases (last N)
     */
    function getRecentPurchases(uint256 count) external view returns (Purchase[] memory) {
        uint256 total = purchases.length;
        if (count > total) count = total;
        
        Purchase[] memory recent = new Purchase[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = purchases[total - count + i];
        }
        return recent;
    }
    
    // Admin functions
    function setRecorder(address _recorder) external {
        require(msg.sender == owner, "Not owner");
        recorder = _recorder;
    }
}
