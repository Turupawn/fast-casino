const NETWORK_ID = 6342

const POLL_INTERVAL = 150

const MY_CONTRACT_ADDRESS = "0xcf96BBf8932689C98940cb3e8D4750E6632f4005"
const MY_CONTRACT_ABI_PATH = "./json_abi/MyContract.json"
var my_contract

var web3

// Add at the top with other global variables
const DEBUG_LOGS = false; // Controls general debug logging
const PROFILE_LOGS = true; // Controls performance profiling logs
const processingGameIds = new Set(); // Track games being processed
const MIN_BALANCE = "0.00000001"; // Minimum balance required in ETH
let commitStartTime = null;

// Simplify web3 initialization without MetaMask
const getWeb3 = async () => {
  return new Promise((resolve, reject) => {
    // Use an RPC provider directly instead of MetaMask
    const provider = new Web3.providers.HttpProvider("https://carrot.megaeth.com/rpc"); // Using a public RPC endpoint
    const web3 = new Web3(provider);
    resolve(web3);
  });
};

const getContract = async (web3, address, abi_path) => {
  const response = await fetch(abi_path);
  const data = await response.json();
  
  contract = new web3.eth.Contract(
    data,
    address
    );
  return contract
}

async function loadDapp() {
  var awaitWeb3 = async function () {
    web3 = await getWeb3()
        var awaitContract = async function () {
      try {
          my_contract = await getContract(web3, MY_CONTRACT_ADDRESS, MY_CONTRACT_ABI_PATH)
        
        // Check for local wallet
        let wallet = getLocalWallet();
        if (!wallet) {
          wallet = generateWallet();
        }
        
        checkLocalWalletBalance();
        onContractInitCallback();
        
      } catch (error) {
        console.error("Error initializing contract:", error);
        document.getElementById("game-status").textContent = "Error connecting to blockchain";
      }
    };
    awaitContract();
  };
  awaitWeb3();
}

loadDapp()

const onContractInitCallback = async () => {
  try {
    // Check and display balance first
    await checkLocalWalletBalance();

    // Get and display game state
    updateGameState();

    // Check if stored secret is still valid
    const secretData = getStoredSecret();
    if (secretData) {
      try {
        const wallet = getLocalWallet();
        if (wallet) {
          const gameState = await my_contract.methods.getGameState(wallet.address).call();
          const commitHash = web3.utils.soliditySha3(secretData.secret);
          const isSecretValid = 
            gameState.gameState === "1"; // Committed state
        }
      } catch (error) {
        console.error("Error checking secret validity:", error);
      }
    }
    
    // Start the game loop
    startGameLoop();
  } catch (error) {
    console.error("Error in contract initialization:", error);
    const personalGamesList = document.getElementById("personal-games-list");
    if (personalGamesList) {
      personalGamesList.innerHTML = "<li>Error loading games</li>";
    } else {
      console.error("Cannot find personal-games-list element");
    }
  }
}

function generateRandomBytes32() {
    return web3.utils.randomHex(32);
}

function storeSecret(secret) {
    console.log("=== STORE SECRET ===");
    console.log("Previous secret:", getStoredSecret());
    console.log("New secret:", secret);
    console.log("Commitment:", web3.utils.soliditySha3(secret));
    localStorage.setItem('playerSecret', JSON.stringify({
        secret: secret,
        timestamp: Date.now()
    }));
    console.log("Stored secret:", getStoredSecret());
    console.log("===================");
}

function getStoredSecret() {
    const secretData = localStorage.getItem('playerSecret');
    return secretData ? JSON.parse(secretData) : null;
}

function clearStoredSecret() {
    console.log("=== CLEAR SECRET ===");
    console.log("Secret before clearing:", getStoredSecret());
    localStorage.removeItem('playerSecret');
    console.log("Secret after clearing:", getStoredSecret());
    console.log("===================");
}

// Function to get card display value (J, Q, K, A or number)
function getCardDisplay(cardValue) {
    if (cardValue === 1) return "A";
    if (cardValue === 11) return "J";
    if (cardValue === 12) return "Q";
    if (cardValue === 13) return "K";
    return cardValue.toString();
}

// Function to update the card display
function updateCardDisplay(playerCard, houseCard) {
    document.getElementById("player-card").textContent = getCardDisplay(playerCard);
    document.getElementById("house-card").textContent = getCardDisplay(houseCard);
    
    // Determine and display the winner
    if (playerCard > houseCard) {
        document.getElementById("game-status").textContent = "You won!";
        document.getElementById("game-status").style.color = "#28a745"; // Green
    } else {
        document.getElementById("game-status").textContent = "House wins";
        document.getElementById("game-status").style.color = "#dc3545"; // Red
    }
}

// Function to reset card display
function resetCardDisplay() {
    document.getElementById("player-card").textContent = "0";
    document.getElementById("house-card").textContent = "0";
    document.getElementById("game-status").textContent = "";
}

// Update the game loop function
async function gameLoop() {
    const wallet = getLocalWallet();
    if (!wallet) {
        if (DEBUG_LOGS) console.log("No wallet found, skipping game loop");
        return;
    }

    try {
        if (DEBUG_LOGS) console.log("=== GAME LOOP START ===");

        // Check and update balance
        await checkLocalWalletBalance();

        const gameState = await checkGameState();
        if (DEBUG_LOGS) console.log("Current game state:", gameState);
        
        const secretData = getStoredSecret();
        if (DEBUG_LOGS) console.log("Secret in storage:", secretData);
        
        if (gameState.gameState === "2" && !secretData) {
            console.log("=== CRITICAL STATE DETECTED ===");
            console.log("Game is in HashPosted state but no secret found!");
            console.log("Game state:", gameState);
            console.log("Local storage state:", {
                secret: getStoredSecret(),
                wallet: getLocalWallet()
            });
            console.log("========================");
        }
        
        if(secretData && DEBUG_LOGS) {
            console.log("Secret:",{secret: secretData.secret, commitment: web3.utils.soliditySha3(secretData.secret)})
        } else if (DEBUG_LOGS) {
            console.log("No secret data found")
        }

        if(wallet && DEBUG_LOGS) {
            const balance = await web3.eth.getBalance(wallet.address);
            const ethBalance = web3.utils.fromWei(balance, 'ether');
            console.log("Wallet:",{address: wallet.address, privateKey: wallet.privateKey, balance: ethBalance})
        } else if (DEBUG_LOGS) {
            console.log("No wallet found")
        }
        
        // If game is in HashPosted state and we have a secret, calculate and reveal
        if (gameState.gameState === "2" && // HashPosted
            secretData &&
            !processingGameIds.has(gameState.gameId)) { // Only attempt reveal if not already processing
            
            // Calculate cards locally
            const result = calculateCards(secretData.secret, gameState.houseHash);
            
            // Update the card display with results
            updateCardDisplay(result.playerCard, result.houseCard);
            
            // If we were timing from commit, log the total time
            if (commitStartTime && PROFILE_LOGS) {
                const endTime = Date.now();
                const totalTime = endTime - commitStartTime;
                console.log("=== PERFORMANCE METRICS ===");
                console.log("Total time from commit to result:", totalTime, "ms");
                console.log("Start time:", new Date(commitStartTime).toISOString());
                console.log("End time:", new Date(endTime).toISOString());
                console.log("=========================");
                commitStartTime = null; // Reset the timer
            }

            if (DEBUG_LOGS) console.log("Conditions met for reveal, attempting...");
            await performReveal(wallet, secretData.secret);
        }
        
        if (DEBUG_LOGS) console.log("=== GAME LOOP END ===");
    } catch (error) {
        console.error("Error in game loop:", error); // Always log errors
    }
}

// Update the commit function with the new balance check
async function commit() {
    const wallet = getLocalWallet();
    if (!wallet) {
        alert("No local wallet found!");
        return;
    }

    try {
        // Start timing when commit is pressed
        commitStartTime = Date.now();
        if (PROFILE_LOGS) {
            console.log("=== COMMIT STARTED ===");
            console.log("Start time:", new Date(commitStartTime).toISOString());
        }

        // Get required amounts
        const balance = await web3.eth.getBalance(wallet.address);
        const stakeAmount = await my_contract.methods.STAKE_AMOUNT().call();

        if (BigInt(balance) < BigInt(web3.utils.toWei(MIN_BALANCE, 'ether'))) {
            const currentEth = web3.utils.fromWei(balance, 'ether');
            alert(`Insufficient balance! You need at least ${MIN_BALANCE} ETH to play.\nCurrent balance: ${parseFloat(currentEth).toFixed(6)} ETH`);
            return;
        }

        // Check if player is already committed
        const gameState = await my_contract.methods.getGameState(wallet.address).call();
        console.log("Game state:", gameState);
        
        // Check if we have a stored secret from a previous game
        const storedSecret = getStoredSecret();
        if (storedSecret) {
            console.log("Found stored secret from previous game:", storedSecret);
            alert("Cannot start new game while previous game's secret is still stored. Please wait for the current game to complete.");
            return;
        }

        if (gameState.gameState !== "0") { // NotStarted
            alert("You have already committed to this game!");
            return;
        }

        // Reset card display and show waiting status
        resetCardDisplay();
        document.getElementById("game-status").textContent = "Please wait...";

        // Generate random secret
        const secret = generateRandomBytes32();
        storeSecret(secret);
        const commitHash = web3.utils.soliditySha3(secret);
        
        const data = my_contract.methods.commit(commitHash).encodeABI();
        const nonce = await web3.eth.getTransactionCount(wallet.address, 'latest');
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: wallet.address,
            to: MY_CONTRACT_ADDRESS,
            nonce: nonce,
            gasPrice: gasPrice,
            gas: 300000,
            value: stakeAmount,
            data: data
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (DEBUG_LOGS) {
            console.log("Commit Transaction Receipt:", {
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                status: receipt.status ? "Confirmed" : "Failed",
                gasUsed: receipt.gasUsed
            });
        }
        
        // Update balance display after transaction
        await checkLocalWalletBalance();
        updateGameState();
    } catch (error) {
        console.error("Error in commit:", error); // Always log errors
        document.getElementById("game-status").textContent = "";
        commitStartTime = null; // Reset timing on error
    }
}

// Update checkGameState function
async function checkGameState() {
    try {
        const wallet = getLocalWallet();
        if (!wallet) return null;

        // Use 'pending' block tag to get latest state including mini blocks
        const gameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
        return {
            gameState: gameState.gameState,
            playerCommit: gameState.playerCommit,
            houseHash: gameState.houseHash,
            gameId: gameState.gameId
        };
    } catch (error) {
        console.error("Error checking game state:", error);
        return null;
    }
}

// Add this function to calculate cards locally
function calculateCards(secret, houseHash) {
    // Convert to BigInt for proper handling of large numbers
    const secretBig = BigInt(secret);
    const houseHashBig = BigInt(houseHash);
    
    // XOR the secret and house hash
    const xorResult = secretBig ^ houseHashBig;
    
    // Extract two card values (1-13) from the XOR result
    // Player card from upper 128 bits
    const playerCard = Number((xorResult >> 128n) % 13n) + 1;
    // House card from lower 128 bits
    const houseCard = Number((xorResult & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn) % 13n) + 1;
    
    // Determine winner
    let winner;
    if (playerCard > houseCard) {
        winner = 'Player';
    } else {
        winner = 'House';
    }
    
    return { playerCard, houseCard, winner };
}

// Also update updateGameState to show card calculation when hash is posted
async function updateGameState() {
    try {
        const wallet = getLocalWallet();
        if (!wallet) return;

        // Use 'pending' block tag to get latest state including mini blocks
        const gameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
        
        // Update current game state display
        const gameStateElement = document.getElementById("game-state");
        if (gameStateElement) {
            let stateText = `Game State: ${gameState.gameState}`;
            // Add warning if we're in HashPosted state but have no secret
            if (gameState.gameState === "2" && !getStoredSecret()) {
                stateText += " (Secret lost - can forfeit)";
            }
            gameStateElement.textContent = stateText;
        }

        // Update personal games list with history
        const personalGamesList = document.getElementById("personal-games-list");
        if (personalGamesList) {
            personalGamesList.innerHTML = ""; // Clear the list
            
            if (gameState.recentHistory.length === 0) {
                personalGamesList.innerHTML = "<li>No games yet</li>";
            } else {
                // Display games in reverse chronological order (newest first)
                for (let i = gameState.recentHistory.length - 1; i >= 0; i--) {
                    const result = gameState.recentHistory[i];
                    const isForfeit = result.playerCard === 0 && result.houseCard === 0;
                    const playerCard = getCardDisplay(parseInt(result.playerCard));
                    const houseCard = getCardDisplay(parseInt(result.houseCard));
                    const isWin = result.winner.toLowerCase() === wallet.address.toLowerCase();
                    
                    addGameToPersonalList(playerCard, houseCard, isWin, isForfeit);
                }
            }
        }
    } catch (error) {
        console.error("Error updating game state:", error);
    }
}

// Start the game loop
function startGameLoop() {
    // Run immediately
    gameLoop();
    // Then run every 500ms instead of 2000ms since we're using pending block tag
    setInterval(gameLoop, POLL_INTERVAL);
}

const onWalletConnectedCallback = async () => {
}

//// Functions ////

function generateWallet() {
  const account = web3.eth.accounts.create();
  localStorage.setItem('localWallet', JSON.stringify({
    address: account.address,
    privateKey: account.privateKey
  }));
  return account;
}

function getLocalWallet() {
  const walletData = localStorage.getItem('localWallet');
  if (walletData) {
    return JSON.parse(walletData);
  }
  return null;
}

// Update the checkLocalWalletBalance function to be simpler
async function checkLocalWalletBalance() {
    const wallet = getLocalWallet();
    if (wallet) {
        const balance = await web3.eth.getBalance(wallet.address);
        const ethBalance = web3.utils.fromWei(balance, 'ether');

        // Simple display without CSS
        document.getElementById("balance-display").textContent =
            `Balance: ${parseFloat(ethBalance).toFixed(6)} ETH`;
    }
}

async function forfeit() {
    const wallet = getLocalWallet();
    if (!wallet) {
        alert("No local wallet found!");
        return;
    }

    try {
        const data = my_contract.methods.forfeit().encodeABI();
        const nonce = await web3.eth.getTransactionCount(wallet.address, 'latest');
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: wallet.address,
            to: MY_CONTRACT_ADDRESS,
            nonce: nonce,
            gasPrice: gasPrice,
            gas: 300000,
            data: data
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        console.log("Forfeit Transaction Receipt:", {
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status ? "Confirmed" : "Failed",
            gasUsed: receipt.gasUsed
        });

        if (receipt.status) {
            // Reload the page on successful forfeit
            window.location.reload();
        } else {
            updateGameState();
        }
    } catch (error) {
        console.error("Error in forfeit:", error);
    }
}

// Update the performReveal function
async function performReveal(wallet, secret) {
    try {
        if (DEBUG_LOGS) {
            console.log("=== PERFORM REVEAL START ===");
            console.log("Current secret in storage:", getStoredSecret());
        }
        
        // Get current game state to check game ID
        const gameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
        const gameId = gameState.gameId;
        if (DEBUG_LOGS) {
            console.log("Game state at reveal start:", {
                gameId: gameId,
                gameState: gameState.gameState,
                playerCommit: gameState.playerCommit,
                houseHash: gameState.houseHash
            });
        }

        // Check if we're already processing this game
        if (processingGameIds.has(gameId)) {
            if (DEBUG_LOGS) console.log(`Already processing game ${gameId}, skipping reveal`);
            return;
        }

        // Mark game as processing immediately
        processingGameIds.add(gameId);
        if (DEBUG_LOGS) console.log(`Started processing reveal for game ${gameId}`);

        const data = my_contract.methods.reveal(secret).encodeABI();
        const nonce = await web3.eth.getTransactionCount(wallet.address, 'latest');
        const gasPrice = await web3.eth.getGasPrice();
        
        const tx = {
            from: wallet.address,
            to: MY_CONTRACT_ADDRESS,
            nonce: nonce,
            gasPrice: gasPrice,
            gas: 300000,
            data: data
        };

        console.log("Sending reveal transaction...");
        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        if (DEBUG_LOGS) {
            console.log("Reveal Transaction Receipt:", {
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                status: receipt.status ? "Confirmed" : "Failed",
                gasUsed: receipt.gasUsed
            });
        }

        if (receipt.status) {
            if (DEBUG_LOGS) {
                console.log("=== REVEAL SUCCESSFUL ===");
                console.log("Secret in storage before state check:", getStoredSecret());
            }
            
            // Get the current game state again to check if we're still on the same game
            const currentGameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
            console.log("Game state after reveal:", {
                gameId: currentGameState.gameId,
                gameState: currentGameState.gameState,
                playerCommit: currentGameState.playerCommit,
                houseHash: currentGameState.houseHash
            });
            
            // Only clear the secret if we're still on the same game AND the game state has changed
            // AND the player commit is zero (indicating a truly completed game)
            if (currentGameState.gameId === gameId && 
                currentGameState.gameState === "0" && 
                currentGameState.playerCommit === "0x0000000000000000000000000000000000000000000000000000000000000000") {
                console.log("Same game ID, completed state, and zero commit - clearing secret");
                clearStoredSecret();
            } else {
                console.log("Game state changed or new game started, keeping secret");
            }
        } else {
            if (DEBUG_LOGS) console.log("Reveal failed");
            processingGameIds.delete(gameId);
        }
        
        if (DEBUG_LOGS) console.log("=== PERFORM REVEAL END ===");
        updateGameState();
    } catch (error) {
        console.error("Error in reveal:", error); // Always log errors
        const gameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
        processingGameIds.delete(gameState.gameId);
    }
}

// Add the withdraw function with ethLeftForGas
async function withdrawFunds() {
    const wallet = getLocalWallet();
    if (!wallet) {
        alert("No local wallet found!");
        return;
    }

    try {
        const balance = await web3.eth.getBalance(wallet.address);
        if (balance <= 0) {
            alert("No funds to withdraw!");
            return;
        }

        // Amount to leave in the wallet for future gas fees (in wei)
        const ethLeftForGas = web3.utils.toWei("0.000000001", "ether"); // 0.005 ETH for future transactions
        
        if (BigInt(balance) <= BigInt(ethLeftForGas)) {
            alert("Balance too low! Leaving funds for gas fees.");
            return;
        }

        const destinationAddress = prompt("Enter the wallet address to withdraw funds to:");
        
        // Validate the address
        if (!destinationAddress || !web3.utils.isAddress(destinationAddress)) {
            alert("Invalid Ethereum address!");
            return;
        }

        // Calculate gas cost for the transaction
        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = 21000; // Standard ETH transfer gas
        const gasCost = BigInt(gasPrice) * BigInt(gasLimit);
        
        // Calculate amount to send (balance - gas cost - ethLeftForGas)
        const amountToSend = BigInt(balance) - gasCost - BigInt(ethLeftForGas);
        
        if (amountToSend <= 0) {
            alert("Balance too low to withdraw after reserving gas fees!");
            return;
        }

        const tx = {
            from: wallet.address,
            to: destinationAddress,
            value: amountToSend.toString(),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: await web3.eth.getTransactionCount(wallet.address, 'latest')
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        document.getElementById("game-status").textContent = "Withdrawing...";
        
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        if (receipt.status) {
            const ethAmount = web3.utils.fromWei(amountToSend.toString(), 'ether');
            const leftAmount = web3.utils.fromWei(ethLeftForGas, 'ether');
            alert(`Successfully withdrew ${ethAmount} ETH to ${destinationAddress}\nLeft ${leftAmount} ETH for future gas fees`);
            document.getElementById("game-status").textContent = "";
            // Update balance display
            checkLocalWalletBalance();
        } else {
            alert("Withdrawal failed!");
            document.getElementById("game-status").textContent = "";
        }
    } catch (error) {
        console.error("Error withdrawing funds:", error);
        alert("Error withdrawing funds: " + error.message);
        document.getElementById("game-status").textContent = "";
    }
}

// Update the addGameToPersonalList function to handle forfeits
function addGameToPersonalList(playerCard, houseCard, isWin, isForfeit = false) {
  const gamesList = document.getElementById("personal-games-list");
  const listItem = document.createElement("li");
  listItem.style.marginBottom = "8px"; // Increased space between items
  
  if (isForfeit) {
    listItem.innerHTML = `<span style="color: #dc3545;">• Game forfeited</span>`;
  } else if (isWin) {
    listItem.innerHTML = `<span style="color: #28a745;">• You won [${playerCard}-${houseCard}]</span>`;
  } else {
    listItem.innerHTML = `<span style="color: #dc3545;">• House wins [${playerCard}-${houseCard}]</span>`;
  }
  
  // Add to the top of the list
  if (gamesList.firstChild) {
    gamesList.insertBefore(listItem, gamesList.firstChild);
  } else {
    gamesList.appendChild(listItem);
  }
}