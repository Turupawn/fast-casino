// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TwoPartyWarGame {
    enum State { NotStarted, Committed, HashPosted }

    struct Game {
        bytes32 playerCommit;
        bytes32 houseHash;
        State gameState;
        uint256 gameId;
    }

    struct GameResult {
        uint256 playerCard;
        uint256 houseCard;
        address winner;
        uint256 timestamp;
    }

    // Map player address to their current game
    mapping(address => Game) public games;
    
    // Map player address to their game history
    mapping(address => GameResult[]) public gameHistory;
    
    // Maximum number of games to return in getGameState
    uint256 public constant MAX_RETURN_HISTORY = 10;
    
    address public immutable house;
    uint256 public constant STAKE_AMOUNT = 0.000001 ether;

    // Add gameId to track individual games
    uint256 public nextGameId;

    event GameForfeited(address indexed player, address house);
    event GameCreated(address indexed player, bytes32 commitHash, uint256 gameId);

    modifier onlyHouse() {
        require(msg.sender == house, "Not house");
        _;
    }

    modifier hasStaked() {
        require(msg.value == STAKE_AMOUNT, "Incorrect stake amount");
        _;
    }

    constructor(address _house) {
        house = _house;
    }

    /// @dev Player commits to the game by sending ETH and a hash of their secret
    function commit(bytes32 _commitHash) external payable hasStaked {
        Game storage playerGame = games[msg.sender];
        require(playerGame.gameState == State.NotStarted, "Player already committed");
        
        playerGame.playerCommit = _commitHash;
        playerGame.gameState = State.Committed;
        playerGame.gameId = nextGameId;
        
        emit GameCreated(msg.sender, _commitHash, nextGameId);
        
        nextGameId++;
    }

    /// @dev House posts their hash and stake for a specific player's game
    function postHash(address player, bytes32 _hash) external payable hasStaked {
        require(msg.sender == house, "Only house can post hash");
        Game storage playerGame = games[player];
        require(playerGame.gameState == State.Committed, "Player must commit first");
        
        playerGame.houseHash = _hash;
        playerGame.gameState = State.HashPosted;
    }

    /// @dev Player reveals their secret and the result is computed
    function reveal(bytes32 _secret) external {
        Game storage playerGame = games[msg.sender];
        require(playerGame.gameState == State.HashPosted, "Game not ready for reveal");
        require(keccak256(abi.encode(_secret)) == playerGame.playerCommit, "Player secret invalid");
        
        // Generate result using house's hash and player's secret
        uint256 xorResult = uint256(_secret) ^ uint256(playerGame.houseHash);
        
        // Extract two card values (1-13) from the XOR result
        uint256 playerCard = ((xorResult >> 128) % 13) + 1;
        uint256 houseCard = ((xorResult & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) % 13) + 1;
        
        // Determine winner: highest card wins, ties go to house
        address winner;
        if (playerCard > houseCard) {
            winner = msg.sender;
        } else {
            winner = house;
        }
        
        // Store game result in history
        GameResult memory result = GameResult({
            playerCard: playerCard,
            houseCard: houseCard,
            winner: winner,
            timestamp: block.timestamp
        });
        
        // Add to history (no size limit)
        gameHistory[msg.sender].push(result);
        
        // Reset game state BEFORE transfer
        _resetGame(msg.sender);
        
        // Transfer stakes to winner
        uint256 totalStake = STAKE_AMOUNT * 2;
        payable(winner).transfer(totalStake);
    }

    /// @dev Internal function to reset the game
    function _resetGame(address player) internal {
        Game storage playerGame = games[player];
        playerGame.playerCommit = bytes32(0);
        playerGame.houseHash = bytes32(0);
        playerGame.gameState = State.NotStarted;
    }

    /// @dev Player can forfeit the game if they lost their secret
    function forfeit() external {
        Game storage playerGame = games[msg.sender];
        // AI: keep it commented out for now
        //require(playerGame.gameState == State.HashPosted, "Game not in correct state to forfeit");
        
        // Store forfeit result in history
        GameResult memory result = GameResult({
            playerCard: 0,
            houseCard: 0,
            winner: house,
            timestamp: block.timestamp
        });
        
        // Add to history (no size limit)
        gameHistory[msg.sender].push(result);
        
        // Reset game state BEFORE transfer
        _resetGame(msg.sender);
        
        // Transfer stakes to house
        uint256 totalStake = STAKE_AMOUNT * 2;
        // AI: keep it commented out for now
        //payable(house).transfer(totalStake);
        
        // Emit events
        emit GameForfeited(msg.sender, house);
    }

    // Add a function to withdraw stuck funds (only house)
    function withdrawStuckFunds() external onlyHouse {
        require(address(this).balance > 0, "No funds to withdraw");
        (bool sent,) = payable(house).call{value: address(this).balance}("");
        require(sent, "Failed to send Ether");
    }

    // Function to get game state and last 10 games for a specific player
    function getGameState(address player) external view returns (
        uint player_balance,
        State gameState,
        bytes32 playerCommit,
        bytes32 houseHash,
        uint256 gameId,
        GameResult[] memory recentHistory
    ) {
        Game storage playerGame = games[player];
        GameResult[] storage fullHistory = gameHistory[player];
        
        // Create a new array for the last 10 games
        uint256 historyLength = fullHistory.length;
        uint256 returnLength = historyLength > MAX_RETURN_HISTORY ? MAX_RETURN_HISTORY : historyLength;
        recentHistory = new GameResult[](returnLength);
        
        // Copy the last 10 games (or all if less than 10)
        for (uint256 i = 0; i < returnLength; i++) {
            recentHistory[i] = fullHistory[historyLength - returnLength + i];
        }
        
        return (
            player.balance,
            playerGame.gameState,
            playerGame.playerCommit,
            playerGame.houseHash,
            playerGame.gameId,
            recentHistory
        );
    }
}
