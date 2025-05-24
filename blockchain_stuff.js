const NETWORK_ID = 6342

const POLL_INTERVAL = 150 // 150

const MY_CONTRACT_ADDRESS = "0x9590F386eC21A221646A19ac03984683713366d7"
const MY_CONTRACT_ABI_PATH = "./json_abi/MyContract.json"
var my_contract

var web3

const MIN_BALANCE = "0.00001";
let commitStartTime = null;

const PRINT_LEVELS = ['profile', 'error']; //['debug', 'profile', 'error'];

let globalGameState = null;
let globalStakeAmount = null;

const getWeb3 = async () => {
  return new Promise((resolve, reject) => {
    const provider = new Web3.providers.HttpProvider("https://carrot.megaeth.com/rpc");
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
        let wallet = getLocalWallet();
        if (!wallet) {
          wallet = generateWallet();
        }
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
    globalStakeAmount = await my_contract.methods.STAKE_AMOUNT().call();
    printLog(['debug'], "Stake amount initialized:", globalStakeAmount);
    await checkLocalWalletBalance();
    updateGameState();
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

function getStoredSecret() {
    const secretData = localStorage.getItem('playerSecret');
    return secretData ? JSON.parse(secretData) : null;
}

function clearStoredSecret() {
    printLog(['debug'], "=== CLEAR SECRET ===");
    printLog(['debug'], "Secret before clearing:", getStoredSecret());
    printLog(['debug'], "===================");
    localStorage.removeItem('playerSecret');
    clearStoredCommit()
    clearPendingReveal()
}

function getCardDisplay(cardValue) {
    if (cardValue === 1) return "A";
    if (cardValue === 11) return "J";
    if (cardValue === 12) return "Q";
    if (cardValue === 13) return "K";
    return cardValue.toString();
}

function updateCardDisplay(playerCard, houseCard) {
    document.getElementById("player-card").textContent = getCardDisplay(playerCard);
    document.getElementById("house-card").textContent = getCardDisplay(houseCard);
    
    if (playerCard > houseCard) {
        document.getElementById("game-status").textContent = "You won!";
        document.getElementById("game-status").style.color = "#28a745";
    } else {
        document.getElementById("game-status").textContent = "House wins";
        document.getElementById("game-status").style.color = "#dc3545";
    }
}

function resetCardDisplay() {
    document.getElementById("player-card").textContent = "0";
    document.getElementById("house-card").textContent = "0";
    document.getElementById("game-status").textContent = "";
}

async function gameLoop() {
    const wallet = getLocalWallet();
    if (!wallet) {
        printLog(['debug'], "No wallet found, skipping game loop");
        return;
    }

    try {
        printLog(['debug'], "=== GAME LOOP START ===");

        await checkLocalWalletBalance();
        await checkGameState();
        printLog(['debug'], "Current game state:", globalGameState);
        
        const pendingCommit = getStoredCommit();
        const pendingReveal = getPendingReveal();
        
        if (globalGameState.gameState === "2" && pendingCommit) {
            const result = calculateCards(pendingCommit.secret, globalGameState.houseHash);
            
            if (commitStartTime) {
                const endTime = Date.now();
                const totalTime = endTime - commitStartTime;
                printLog(['profile'], "=== PERFORMANCE METRICS ===");
                printLog(['profile'], "Total time from commit to result:", totalTime, "ms");
                printLog(['profile'], "Start time:", new Date(commitStartTime).toISOString());
                printLog(['profile'], "End time:", new Date(endTime).toISOString());
                printLog(['profile'], "=========================");
                commitStartTime = null;
            }

            storePendingReveal(pendingCommit.secret);
            clearStoredCommit();
            updateCardDisplay(result.playerCard, result.houseCard);
            printLog(['debug'], "Conditions met for reveal, attempting...");
            await performReveal(wallet, pendingCommit.secret);
        }
        if (pendingReveal && globalGameState.gameState === "0") {
            clearPendingReveal();
        }
        updateGameState();
        printLog(['debug'], "=== GAME LOOP END ===");
    } catch (error) {
        printLog(['error'], "Error in game loop:", error);
    }
}

async function commit() {
    const wallet = getLocalWallet();
    if (!wallet) {
        alert("No local wallet found!");
        return;
    }

    try {
        const pendingCommit = getStoredCommit();
        if (pendingCommit) {
            printLog(['debug'], "Found pending commit from previous game:", pendingCommit);
            alert("Cannot start new game while previous game's commit is still pending. Please wait for the current game to complete.");
            return;
        }

        commitStartTime = Date.now();
        printLog(['profile'], "=== COMMIT STARTED ===");
        printLog(['profile'], "Start time:", new Date(commitStartTime).toISOString());

        if (!globalGameState) {
            printLog(['error'], "Global game state not initialized");
            return;
        }

        if (BigInt(globalGameState.playerBalance) < BigInt(web3.utils.toWei(MIN_BALANCE, 'ether'))) {
            const currentEth = web3.utils.fromWei(globalGameState.playerBalance, 'ether');
            alert(`Insufficient balance! You need at least ${MIN_BALANCE} ETH to play.\nCurrent balance: ${parseFloat(currentEth).toFixed(6)} ETH`);
            return;
        }
        
        printLog(['debug'], "Game state:", globalGameState);

        resetCardDisplay();
        document.getElementById("game-status").textContent = "Please wait...";

        const secret = generateRandomBytes32();
        storeCommit(secret);
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
            value: globalStakeAmount,
            data: data
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        printLog(['debug'], "Commit Transaction Receipt:", {
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status ? "Confirmed" : "Failed",
            gasUsed: receipt.gasUsed
        });
        
        await checkLocalWalletBalance();
        updateGameState();
    } catch (error) {
        printLog(['error'], "Error in commit:", error);
        document.getElementById("game-status").textContent = "";
        commitStartTime = null;
        clearStoredCommit();
    }
}

async function checkGameState() {
    try {
        const wallet = getLocalWallet();
        if (!wallet) return null;
        const gameState = await my_contract.methods.getGameState(wallet.address).call({}, 'pending');
        globalGameState = {
            playerBalance: gameState.player_balance,
            gameState: gameState.gameState,
            playerCommit: gameState.playerCommit,
            houseHash: gameState.houseHash,
            gameId: gameState.gameId,
            recentHistory: gameState.recentHistory
        };
        return globalGameState;
    } catch (error) {
        console.error("Error checking game state:", error);
        return null;
    }
}

function calculateCards(secret, houseHash) {
    const secretBig = BigInt(secret);
    const houseHashBig = BigInt(houseHash);
    const xorResult = secretBig ^ houseHashBig;
    const playerCard = Number((xorResult >> 128n) % 13n) + 1;
    const houseCard = Number((xorResult & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn) % 13n) + 1;
    let winner;
    if (playerCard > houseCard) {
        winner = 'Player';
    } else {
        winner = 'House';
    }
    return { playerCard, houseCard, winner };
}

async function updateGameState() {
    try {
        if (!globalGameState) return;
        const gameStateElement = document.getElementById("game-state");
        if (gameStateElement) {
            let stateText = `Game State: ${globalGameState.gameState}`;
            if (globalGameState.gameState === "2" && !getStoredSecret()) {
                stateText += " (Secret lost - can forfeit)";
            }
            gameStateElement.textContent = stateText;
        }
        const personalGamesList = document.getElementById("personal-games-list");
        if (personalGamesList) {
            personalGamesList.innerHTML = "";
            
            if (globalGameState.recentHistory.length === 0) {
                personalGamesList.innerHTML = "<li>No games yet</li>";
            } else {
                for (let i = globalGameState.recentHistory.length - 1; i >= 0; i--) {
                    const result = globalGameState.recentHistory[i];
                    const isForfeit = result.playerCard === 0 && result.houseCard === 0;
                    const playerCard = getCardDisplay(parseInt(result.playerCard));
                    const houseCard = getCardDisplay(parseInt(result.houseCard));
                    const isWin = result.winner.toLowerCase() === getLocalWallet().address.toLowerCase();
                    
                    addGameToPersonalList(playerCard, houseCard, isWin, isForfeit);
                }
            }
        }
    } catch (error) {
        console.error("Error updating game state:", error);
    }
}

function startGameLoop() {
    gameLoop();
    setInterval(gameLoop, POLL_INTERVAL);
}
const onWalletConnectedCallback = async () => {
}

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

async function checkLocalWalletBalance() {
    const wallet = getLocalWallet();
    if (wallet && globalGameState) {
        const ethBalance = web3.utils.fromWei(globalGameState.playerBalance, 'ether');
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
        printLog(['debug'], "Forfeit Transaction Receipt:", {
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status ? "Confirmed" : "Failed",
            gasUsed: receipt.gasUsed
        });

        if (receipt.status) {
            window.location.reload();
        } else {
            updateGameState();
        }
    } catch (error) {
        printLog(['error'], "Error in forfeit:", error);
    }
}

async function performReveal(wallet, secret) {
    try {
        printLog(['debug'], "=== PERFORM REVEAL START ===");
        if (!globalGameState) {
            printLog(['error'], "Global game state not initialized");
            return;
        }
        const gameId = globalGameState.gameId;
        printLog(['debug'], "Game state at reveal start:", {
            gameId: gameId,
            gameState: globalGameState.gameState,
            playerCommit: globalGameState.playerCommit,
            houseHash: globalGameState.houseHash
        });
        printLog(['debug'], `Started processing reveal for game ${gameId}`);
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
        printLog(['debug'], "Sending reveal transaction...");
        const signedTx = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        printLog(['debug'], "Reveal Transaction Receipt:", {
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status ? "Confirmed" : "Failed",
            gasUsed: receipt.gasUsed
        });
        if (receipt.status) {
            printLog(['debug'], "=== REVEAL SUCCESSFUL ===");
            if (globalGameState.gameId === gameId &&
                globalGameState.gameState === "0" &&
                globalGameState.playerCommit === "0x0000000000000000000000000000000000000000000000000000000000000000") {
                printLog(['debug'], "Same game ID, completed state, and zero commit - clearing secret");
            } else {
                printLog(['debug'], "Game state changed or new game started, keeping secret");
            }
        }
        printLog(['debug'], "=== PERFORM REVEAL END ===");
        updateGameState();
    } catch (error) {
        printLog(['error'], "Error in reveal:", error);
    }
}

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
        const ethLeftForGas = web3.utils.toWei("0.000000001", "ether");
        if (BigInt(balance) <= BigInt(ethLeftForGas)) {
            alert("Balance too low! Leaving funds for gas fees.");
            return;
        }
        const destinationAddress = prompt("Enter the wallet address to withdraw funds to:");
        if (!destinationAddress || !web3.utils.isAddress(destinationAddress)) {
            alert("Invalid Ethereum address!");
            return;
        }
        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = 21000;
        const gasCost = BigInt(gasPrice) * BigInt(gasLimit);
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
            checkLocalWalletBalance();
        } else {
            alert("Withdrawal failed!");
            document.getElementById("game-status").textContent = "";
        }
    } catch (error) {
        printLog(['error'], "Error withdrawing funds:", error);
        alert("Error withdrawing funds: " + error.message);
        document.getElementById("game-status").textContent = "";
    }
}

function addGameToPersonalList(playerCard, houseCard, isWin, isForfeit = false) {
  const gamesList = document.getElementById("personal-games-list");
  const listItem = document.createElement("li");
  listItem.style.marginBottom = "8px";
  
  if (isForfeit) {
    listItem.innerHTML = `<span style="color: #dc3545;">• Game forfeited</span>`;
  } else if (isWin) {
    listItem.innerHTML = `<span style="color: #28a745;">• You won [${playerCard}-${houseCard}]</span>`;
  } else {
    listItem.innerHTML = `<span style="color: #dc3545;">• House wins [${playerCard}-${houseCard}]</span>`;
  }
  if (gamesList.firstChild) {
    gamesList.insertBefore(listItem, gamesList.firstChild);
  } else {
    gamesList.appendChild(listItem);
  }
}

function printLog(levels, ...args) {
    if (!Array.isArray(levels)) levels = [levels];
    const shouldPrint = levels.some(level => PRINT_LEVELS.includes(level));
    if (!shouldPrint) return;
    if (levels.includes('error')) {
        console.error(...args);
    } else {
        console.log(...args);
    }
}

function storeCommit(secret) {
    printLog(['debug'], "=== STORE COMMIT ===");
    printLog(['debug'], "Previous commit:", getStoredCommit());
    printLog(['debug'], "New commit:", secret);
    printLog(['debug'], "Commitment:", web3.utils.soliditySha3(secret));
    localStorage.setItem('pendingCommit', JSON.stringify({
        secret: secret,
        timestamp: Date.now()
    }));
    printLog(['debug'], "Stored commit:", getStoredCommit());
    printLog(['debug'], "===================");
}

function getStoredCommit() {
    const commitData = localStorage.getItem('pendingCommit');
    return commitData ? JSON.parse(commitData) : null;
}

function clearStoredCommit() {
    printLog(['debug'], "=== CLEAR COMMIT ===");
    printLog(['debug'], "Commit before clearing:", getStoredCommit());
    printLog(['debug'], "===================");
    localStorage.removeItem('pendingCommit');
}

function storePendingReveal(secret) {
    printLog(['debug'], "=== STORE PENDING REVEAL ===");
    printLog(['debug'], "Previous pending reveal:", getPendingReveal());
    printLog(['debug'], "New pending reveal:", secret);
    localStorage.setItem('pendingReveal', JSON.stringify({
        secret: secret,
        timestamp: Date.now()
    }));
    printLog(['debug'], "Stored pending reveal:", getPendingReveal());
    printLog(['debug'], "===================");
}

function getPendingReveal() {
    const revealData = localStorage.getItem('pendingReveal');
    return revealData ? JSON.parse(revealData) : null;
}

function clearPendingReveal() {
    printLog(['debug'], "=== CLEAR PENDING REVEAL ===");
    printLog(['debug'], "Pending reveal before clearing:", getPendingReveal());
    printLog(['debug'], "===================");
    localStorage.removeItem('pendingReveal');
}