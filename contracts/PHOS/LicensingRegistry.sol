// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LicensingRegistry
 * @notice Manages commercial licensing of art pieces for $PHOS
 * @dev Brands pay $PHOS to license specific art for commercial use
 * 
 * Flow:
 * 1. Artist registers their piece for licensing with price & terms
 * 2. Brand purchases license by paying $PHOS
 * 3. Revenue splits between artist and platform
 * 4. License tracked on-chain with duration and rights
 */
contract LicensingRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    /// @notice The $PHOS token contract
    IERC20 public immutable phosToken;
    
    /// @notice Platform fee percentage (in basis points, e.g., 1000 = 10%)
    uint256 public platformFeeBps = 1000; // 10% default
    
    /// @notice Platform treasury for fee collection
    address public platformTreasury;
    
    /// @notice License types
    enum LicenseType {
        Personal,       // Personal/non-commercial use
        Commercial,     // Standard commercial rights
        Exclusive,      // Exclusive commercial rights (no other licensees)
        Perpetual       // Perpetual commercial rights
    }
    
    /// @notice Licensable piece information
    struct LicensablePiece {
        address artist;
        string pieceId;
        bool isAvailable;
        bool exclusiveLicensed; // True if someone holds exclusive license
        uint256[4] prices;      // Price for each LicenseType in $PHOS
        uint256 defaultDuration; // Default license duration in seconds
        uint256 totalLicenses;
        uint256 totalRevenue;
    }
    
    /// @notice Active license information
    struct License {
        address licensee;
        string pieceId;
        LicenseType licenseType;
        uint256 purchaseTime;
        uint256 expirationTime;
        uint256 pricePaid;
        bool isActive;
    }
    
    /// @notice Piece ID => LicensablePiece
    mapping(string => LicensablePiece) public pieces;
    
    /// @notice License ID => License
    mapping(uint256 => License) public licenses;
    
    /// @notice Track licenses by licensee
    mapping(address => uint256[]) public licenseeToLicenses;
    
    /// @notice Track licenses by piece
    mapping(string => uint256[]) public pieceToLicenses;
    
    /// @notice Next license ID
    uint256 public nextLicenseId;
    
    /// @notice Total licensing revenue through platform
    uint256 public totalRevenue;
    
    // Events
    event PieceRegistered(
        string indexed pieceId,
        address indexed artist,
        uint256[4] prices,
        uint256 defaultDuration
    );
    event PieceUpdated(string indexed pieceId, uint256[4] prices, bool isAvailable);
    event LicensePurchased(
        uint256 indexed licenseId,
        string indexed pieceId,
        address indexed licensee,
        LicenseType licenseType,
        uint256 price,
        uint256 expirationTime
    );
    event LicenseRevoked(uint256 indexed licenseId, string reason);
    event RevenueDistributed(
        string indexed pieceId,
        address indexed artist,
        uint256 artistShare,
        uint256 platformShare
    );
    event PlatformFeeUpdated(uint256 newFeeBps);
    event PlatformTreasuryUpdated(address indexed treasury);
    
    // Errors
    error PieceNotAvailable();
    error PieceAlreadyExclusiveLicensed();
    error InvalidLicenseType();
    error LicenseExpired();
    error NotArtist();
    error NotLicensee();
    error InvalidAddress();
    error InvalidPrice();
    error PieceAlreadyRegistered();
    error LicenseNotActive();
    
    /**
     * @notice Deploy the licensing registry
     * @param _phosToken Address of the $PHOS token
     * @param _platformTreasury Address for platform fee collection
     */
    constructor(address _phosToken, address _platformTreasury) Ownable(msg.sender) {
        if (_phosToken == address(0)) revert InvalidAddress();
        if (_platformTreasury == address(0)) revert InvalidAddress();
        
        phosToken = IERC20(_phosToken);
        platformTreasury = _platformTreasury;
    }
    
    /**
     * @notice Register a piece for licensing
     * @param pieceId Unique identifier for the piece
     * @param prices Array of prices for each license type [Personal, Commercial, Exclusive, Perpetual]
     * @param defaultDuration Default license duration in seconds (0 for perpetual types)
     */
    function registerPiece(
        string calldata pieceId,
        uint256[4] calldata prices,
        uint256 defaultDuration
    ) external {
        if (pieces[pieceId].artist != address(0)) revert PieceAlreadyRegistered();
        
        pieces[pieceId] = LicensablePiece({
            artist: msg.sender,
            pieceId: pieceId,
            isAvailable: true,
            exclusiveLicensed: false,
            prices: prices,
            defaultDuration: defaultDuration,
            totalLicenses: 0,
            totalRevenue: 0
        });
        
        emit PieceRegistered(pieceId, msg.sender, prices, defaultDuration);
    }
    
    /**
     * @notice Update piece licensing details (artist only)
     * @param pieceId The piece to update
     * @param prices New prices for each license type
     * @param isAvailable Whether the piece is available for licensing
     */
    function updatePiece(
        string calldata pieceId,
        uint256[4] calldata prices,
        bool isAvailable
    ) external {
        LicensablePiece storage piece = pieces[pieceId];
        if (piece.artist != msg.sender) revert NotArtist();
        
        piece.prices = prices;
        piece.isAvailable = isAvailable;
        
        emit PieceUpdated(pieceId, prices, isAvailable);
    }
    
    /**
     * @notice Purchase a license for a piece
     * @param pieceId The piece to license
     * @param licenseType Type of license to purchase
     * @param duration Custom duration (0 to use default, ignored for perpetual)
     */
    function purchaseLicense(
        string calldata pieceId,
        LicenseType licenseType,
        uint256 duration
    ) external nonReentrant returns (uint256 licenseId) {
        LicensablePiece storage piece = pieces[pieceId];
        
        if (!piece.isAvailable) revert PieceNotAvailable();
        if (licenseType == LicenseType.Exclusive && piece.exclusiveLicensed) {
            revert PieceAlreadyExclusiveLicensed();
        }
        
        uint256 price = piece.prices[uint256(licenseType)];
        if (price == 0) revert InvalidPrice();
        
        // Calculate duration
        uint256 expirationTime;
        if (licenseType == LicenseType.Perpetual) {
            expirationTime = type(uint256).max; // Never expires
        } else {
            uint256 licenseDuration = duration > 0 ? duration : piece.defaultDuration;
            expirationTime = block.timestamp + licenseDuration;
        }
        
        // Transfer payment
        phosToken.safeTransferFrom(msg.sender, address(this), price);
        
        // Calculate and distribute revenue split
        uint256 platformShare = (price * platformFeeBps) / 10000;
        uint256 artistShare = price - platformShare;
        
        phosToken.safeTransfer(piece.artist, artistShare);
        phosToken.safeTransfer(platformTreasury, platformShare);
        
        emit RevenueDistributed(pieceId, piece.artist, artistShare, platformShare);
        
        // Create license
        licenseId = nextLicenseId++;
        
        licenses[licenseId] = License({
            licensee: msg.sender,
            pieceId: pieceId,
            licenseType: licenseType,
            purchaseTime: block.timestamp,
            expirationTime: expirationTime,
            pricePaid: price,
            isActive: true
        });
        
        // Update tracking
        licenseeToLicenses[msg.sender].push(licenseId);
        pieceToLicenses[pieceId].push(licenseId);
        piece.totalLicenses++;
        piece.totalRevenue += price;
        totalRevenue += price;
        
        // Mark exclusive if applicable
        if (licenseType == LicenseType.Exclusive) {
            piece.exclusiveLicensed = true;
        }
        
        emit LicensePurchased(
            licenseId,
            pieceId,
            msg.sender,
            licenseType,
            price,
            expirationTime
        );
    }
    
    /**
     * @notice Check if a license is valid
     * @param licenseId The license to check
     */
    function isLicenseValid(uint256 licenseId) public view returns (bool) {
        License storage license = licenses[licenseId];
        return license.isActive && block.timestamp < license.expirationTime;
    }
    
    /**
     * @notice Check if an address has a valid license for a piece
     * @param licensee Address to check
     * @param pieceId Piece to check
     * @param minLicenseType Minimum license type required
     */
    function hasValidLicense(
        address licensee,
        string calldata pieceId,
        LicenseType minLicenseType
    ) external view returns (bool) {
        uint256[] storage licenseIds = licenseeToLicenses[licensee];
        
        for (uint256 i = 0; i < licenseIds.length; i++) {
            License storage license = licenses[licenseIds[i]];
            if (
                keccak256(bytes(license.pieceId)) == keccak256(bytes(pieceId)) &&
                license.isActive &&
                block.timestamp < license.expirationTime &&
                uint256(license.licenseType) >= uint256(minLicenseType)
            ) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @notice Get license details
     * @param licenseId The license ID
     */
    function getLicense(uint256 licenseId) external view returns (
        address licensee,
        string memory pieceId,
        LicenseType licenseType,
        uint256 purchaseTime,
        uint256 expirationTime,
        uint256 pricePaid,
        bool isValid
    ) {
        License storage license = licenses[licenseId];
        return (
            license.licensee,
            license.pieceId,
            license.licenseType,
            license.purchaseTime,
            license.expirationTime,
            license.pricePaid,
            isLicenseValid(licenseId)
        );
    }
    
    /**
     * @notice Get all licenses for a licensee
     */
    function getLicensesForLicensee(address licensee) external view returns (uint256[] memory) {
        return licenseeToLicenses[licensee];
    }
    
    /**
     * @notice Get all licenses for a piece
     */
    function getLicensesForPiece(string calldata pieceId) external view returns (uint256[] memory) {
        return pieceToLicenses[pieceId];
    }
    
    /**
     * @notice Get piece information
     */
    function getPiece(string calldata pieceId) external view returns (
        address artist,
        bool isAvailable,
        bool exclusiveLicensed,
        uint256[4] memory prices,
        uint256 defaultDuration,
        uint256 totalLicenses,
        uint256 totalRevenueForPiece
    ) {
        LicensablePiece storage piece = pieces[pieceId];
        return (
            piece.artist,
            piece.isAvailable,
            piece.exclusiveLicensed,
            piece.prices,
            piece.defaultDuration,
            piece.totalLicenses,
            piece.totalRevenue
        );
    }
    
    /**
     * @notice Revoke a license (admin only, for policy violations)
     * @param licenseId The license to revoke
     * @param reason Reason for revocation
     */
    function revokeLicense(uint256 licenseId, string calldata reason) external onlyOwner {
        License storage license = licenses[licenseId];
        if (!license.isActive) revert LicenseNotActive();
        
        license.isActive = false;
        
        // If it was exclusive, free up the piece
        if (license.licenseType == LicenseType.Exclusive) {
            pieces[license.pieceId].exclusiveLicensed = false;
        }
        
        emit LicenseRevoked(licenseId, reason);
    }
    
    /**
     * @notice Release exclusive license (by licensee or after expiration)
     * @param licenseId The exclusive license to release
     */
    function releaseExclusiveLicense(uint256 licenseId) external {
        License storage license = licenses[licenseId];
        
        // Only licensee can release early, or anyone after expiration
        if (block.timestamp < license.expirationTime && license.licensee != msg.sender) {
            revert NotLicensee();
        }
        
        if (license.licenseType == LicenseType.Exclusive) {
            pieces[license.pieceId].exclusiveLicensed = false;
        }
    }
    
    // Admin functions
    
    /**
     * @notice Update platform fee
     * @param newFeeBps New fee in basis points (max 3000 = 30%)
     */
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 3000, "Fee too high"); // Max 30%
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(newFeeBps);
    }
    
    /**
     * @notice Update platform treasury
     */
    function setPlatformTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        platformTreasury = _treasury;
        emit PlatformTreasuryUpdated(_treasury);
    }
}
