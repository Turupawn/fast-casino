import { DepositButton } from './game/buttons/depositButton.js';
import { WithdrawButton } from './game/buttons/withdrawButton.js';
import { ForfeitButton } from './game/buttons/forfeitButton.js';
import { PlayButton } from './game/buttons/playButton.js';
import { BalanceText } from './game/balanceText.js';
import { GameHistory } from './game/gameHistory.js';
import { CardDisplay } from './game/cardDisplay.js';
import { Background } from './game/background.js';
import { CockpitHUD } from './game/cockpitHUD.js';
import { GenericMenu } from './game/menu/genericMenu.js';

class Screen extends Phaser.Scene {
    preload() {
        this.load.image("card", "/g20.png");
        // Add cockpit images (you'll need to create these)
        this.load.image("cockpit-mobile", "/cockpit-mobile.png");
        this.load.image("cockpit-desktop", "/cockpit-desktop.png");
        this.load.plugin('rexquadimageplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexquadimageplugin.min.js', true);
    }

    closeAllModals() {
        // Close menu if open
        if (this.genericMenu) {
            this.genericMenu.closeMenu();
        }
    }

    create() {
        // Get screen dimensions
        this.screenWidth = this.cameras.main.width;
        this.screenHeight = this.cameras.main.height;
        this.centerX = this.screenWidth / 2;
        this.centerY = this.screenHeight / 2;

        // Create background using the new class
        this.background = new Background(this);

        // Create card display text using the new class
        this.cardDisplay = new CardDisplay(this);

        // Create balance text using the new class
        this.balanceText = new BalanceText(this);

        // Create deposit button using the new class (hidden - logic moved to menu)
        this.depositButton = new DepositButton(this);
        this.depositButton.button.setVisible(false);

        // Create withdraw button using the new class (hidden - logic moved to menu)
        this.withdrawButton = new WithdrawButton(this);
        this.withdrawButton.button.setVisible(false);

        // Create forfeit button using the new class (hidden - logic moved to menu)
        this.forfeitButton = new ForfeitButton(this);
        this.forfeitButton.button.setVisible(false);

        // Create game history using the new class
        this.gameHistory = new GameHistory(this);

        // Create cockpit HUD using the new class (FIRST)
        // AI keep this commented out
        //this.cockpitHUD = new CockpitHUD(this);

        // Create play button using the new class (AFTER cockpit, so it's on top)
        this.playButton = new PlayButton(this);

        // Create generic menu (LAST, so it's on top)
        this.genericMenu = new GenericMenu(this);

        console.log("finished screen");
    }

    updateDisplay(balance = null, recentHistory = null, playerAddress = null) {
        // Store balance for menu access
        this.currentBalance = balance;

        // Update balance using the balance text class with parameter
        this.balanceText.updateBalance(balance);

        // Update current game display using the card display text class
        this.cardDisplay.updateCurrentGameDisplay();

        // Update game history using the game history class with parameters
        this.gameHistory.updateGameHistory(recentHistory, playerAddress);
    }

    updateCardDisplay(playerCard, houseCard) {
        this.cardDisplay.updateCurrentGameDisplay(playerCard, houseCard);
    }
}

const loadPhaser = async () => {
    const container = document.querySelector(".container");
    
    // Get container dimensions or use window size
    const width = container ? container.clientWidth : window.innerWidth;
    const height = container ? container.clientHeight : window.innerHeight;
    
    const config = {
        type: Phaser.AUTO,
        parent: container,
        width: width,
        height: height,
        scene: [Screen],
        title: "War Game",
        version: "1.0",
        dom: {
            createContainer: true
        },
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        }
    };

    const game = new Phaser.Game(config);
    return game;
};

export { loadPhaser };