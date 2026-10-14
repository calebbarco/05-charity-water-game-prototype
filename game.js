const ROWS = 12;
const COLUMNS = 18;
const GHOST_STEP_DELAY = 800;
const DOUBLE_POINTS_DURATION = 10000;
const WATER_CAN_SPEED = 180;
const WATER_CAN_RESPAWN_DELAY = 10000;
const DONATION_POINTS = 1000;
const GAME_DURATION_SECONDS = 60;
const FEET_PER_TILE = 25;
const DIRECTIONS = {
    up: { row: -1, column: 0 },
    down: { row: 1, column: 0 },
    left: { row: 0, column: -1 },
    right: { row: 0, column: 1 }
};

const board = document.querySelector('#game-board');
const scoreValue = document.querySelector('#score-value');
const gallonsValue = document.querySelector('#gallons-value');
const livesValue = document.querySelector('#lives-value');
const pointsBoostValue = document.querySelector('#points-boost-value');
const depthValue = document.querySelector('#depth-value');
const timeValue = document.querySelector('#time-value');
const message = document.querySelector('#game-message');
const overlay = document.querySelector('#game-overlay');
const endTitle = document.querySelector('#end-title');
const endMessage = document.querySelector('#end-message');
const gameStage = document.querySelector('.game-stage');
const movingWaterCan = document.querySelector('#moving-water-can');
const donationNotice = document.querySelector('#donation-notice');

const worldTiles = new Map();
const tileElements = [];
let player = { row: 0, column: 0 };
let playerElement = null;
let facing = 'down';
let ghosts = createStartingGhosts();
let score = 0;
let gallons = 0;
let lives = 3;
let gameIsOver = false;
let isInvulnerable = false;
let playerHasStarted = false;
let hasBeenUnderground = false;
let deepestRow = 0;
let nextGhostColor = 'yellow';
let doublePointsUntil = 0;
let secondsRemaining = GAME_DURATION_SECONDS;
let waterCanX = 0;
let waterCanY = 0;
let previousWaterCanFrame = null;
let waterCanAnimationFrame;
let waterCanPath = [];
let waterCanSegment = 0;
let waterCanSegmentTime = 0;
let waterCanIsActive = true;
let waterCanRespawnTimeout;
let donationNoticeTimeout;
let ghostTimer;
let gameTimer;

function createStartingGhosts() {
    return [
        { row: 0, column: -5, color: 'yellow', direction: 1 },
        { row: 0, column: 5, color: 'blue', direction: -1 }
    ];
}

function getTileKey(row, column) {
    return `${row},${column}`;
}

function getWorldTile(row, column) {
    const key = getTileKey(row, column);

    if (!worldTiles.has(key)) {
        let tile;

        if (row <= 0) {
            tile = { type: 'air' };
        } else {
            const chance = Math.random();

            if (chance < 0.08) {
                tile = { type: 'rock' };
            } else if (chance < 0.12) {
                tile = { type: 'clean-water', gallons: 100 + Math.floor(Math.random() * 401) };
            } else if (chance < 0.16) {
                tile = { type: 'dirty-water' };
            } else {
                tile = { type: 'soil' };
            }
        }

        worldTiles.set(key, tile);
    }

    return worldTiles.get(key);
}

function createBoard() {
    for (let row = 0; row < ROWS; row += 1) {
        tileElements[row] = [];

        for (let column = 0; column < COLUMNS; column += 1) {
            const tile = document.createElement('div');
            tile.className = 'tile tile-air';
            tile.setAttribute('role', 'gridcell');
            tileElements[row][column] = tile;
            board.append(tile);
        }
    }
}

function drawBoard() {
    const topRow = player.row - 4;
    const leftColumn = player.column - Math.floor(COLUMNS / 2);
    playerElement = null;

    for (let screenRow = 0; screenRow < ROWS; screenRow += 1) {
        for (let screenColumn = 0; screenColumn < COLUMNS; screenColumn += 1) {
            const worldRow = topRow + screenRow;
            const worldColumn = leftColumn + screenColumn;
            const tile = tileElements[screenRow][screenColumn];
            const terrainTile = getWorldTile(worldRow, worldColumn);
            tile.className = `tile tile-${terrainTile.type}`;
            tile.dataset.worldRow = worldRow;
            tile.dataset.worldColumn = worldColumn;
            tile.setAttribute('aria-label', getTileLabel(terrainTile.type));
            tile.replaceChildren();

            if (worldRow === 0) {
                tile.classList.add('tile-surface');
            } else if (worldRow < 0) {
                tile.classList.add('tile-sky');
            }

            if (player.row === worldRow && player.column === worldColumn) {
                tile.insertAdjacentHTML('beforeend', `
                    <span class="miner-avatar" aria-hidden="true">
                        <span class="miner-helmet"></span>
                        <span class="miner-face"></span>
                        <span class="miner-body"></span>
                    </span>
                `);
                playerElement = tile.querySelector('.miner-avatar');
            } else {
                const ghost = ghosts.find((character) => character.row === worldRow
                    && character.column === worldColumn);

                if (ghost) {
                    tile.insertAdjacentHTML('beforeend', `
                        <span class="ghost ghost-${ghost.color}" aria-hidden="true">
                            <span class="ghost-eyes"></span>
                        </span>
                    `);
                }
            }
        }
    }

    updateStats();
}

function getTileLabel(type) {
    const labels = {
        air: 'Open space',
        soil: 'Soil',
        rock: 'Rock, cannot be dug',
        'clean-water': 'Clean water pocket',
        'dirty-water': 'Dirty water pocket'
    };

    return labels[type] || type;
}

function updateStats() {
    const livesDisplay = `${'♥ '.repeat(lives).trim()}${'♡ '.repeat(3 - lives).trim()}`.trim();
    const boostSeconds = Math.max(0, Math.ceil((doublePointsUntil - Date.now()) / 1000));
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = String(secondsRemaining % 60).padStart(2, '0');

    scoreValue.textContent = score;
    gallonsValue.textContent = `${gallons.toLocaleString()} gal`;
    livesValue.textContent = livesDisplay;
    pointsBoostValue.textContent = boostSeconds > 0 ? `2× active · ${boostSeconds}s` : '2× inactive';
    pointsBoostValue.classList.toggle('is-active', boostSeconds > 0);
    depthValue.textContent = `${deepestRow * FEET_PER_TILE} ft`;
    timeValue.textContent = `${minutes}:${seconds}`;
    timeValue.classList.toggle('time-running-low', secondsRemaining <= 10);
}

function getRandomWaterCanPoint() {
    const canWidth = movingWaterCan.offsetWidth;
    const canHeight = movingWaterCan.offsetHeight;

    return {
        x: Math.random() * Math.max(0, gameStage.clientWidth - canWidth),
        y: Math.random() * Math.max(0, gameStage.clientHeight - canHeight)
    };
}

function createWaterCanPath() {
    const canWidth = movingWaterCan.offsetWidth;
    const canHeight = movingWaterCan.offsetHeight;
    const stageWidth = gameStage.clientWidth;
    const stageHeight = gameStage.clientHeight;
    const startPoint = waterCanPath.length === 0
        ? { x: 0, y: Math.max(0, stageHeight * 0.35) }
        : getRandomWaterCanPoint();
    const path = [startPoint];
    const maneuvers = 2 + Math.floor(Math.random() * 3);

    for (let maneuver = 0; maneuver < maneuvers; maneuver += 1) {
        const center = getRandomWaterCanPoint();
        const radiusX = Math.min(stageWidth * 0.22, 80 + Math.random() * 100);
        const radiusY = Math.min(stageHeight * 0.2, 45 + Math.random() * 75);
        const makesLoop = Math.random() < 0.5;
        const pointCount = makesLoop ? 5 : 3;
        const startAngle = Math.random() * Math.PI * 2;
        const turnDirection = Math.random() < 0.5 ? 1 : -1;

        for (let point = 0; point < pointCount; point += 1) {
            const angle = startAngle + (point / (pointCount - 1)) * Math.PI * 2 * turnDirection;
            path.push({
                x: Math.max(-canWidth, Math.min(stageWidth, center.x + Math.cos(angle) * radiusX)),
                y: Math.max(-canHeight, Math.min(stageHeight, center.y + Math.sin(angle) * radiusY))
            });
        }
    }

    const exitSide = Math.floor(Math.random() * 4);
    path.push({
        x: exitSide === 1 ? stageWidth + canWidth : exitSide === 3 ? -canWidth : Math.random() * stageWidth,
        y: exitSide === 0 ? -canHeight : exitSide === 2 ? stageHeight + canHeight : Math.random() * stageHeight
    });

    waterCanPath = path;
    waterCanSegment = 0;
    waterCanSegmentTime = 0;
    waterCanX = startPoint.x;
    waterCanY = startPoint.y;
    previousWaterCanFrame = null;
}

function showWaterCan() {
    if (gameIsOver) {
        return;
    }

    waterCanIsActive = true;
    movingWaterCan.hidden = false;
    createWaterCanPath();
    waterCanAnimationFrame = window.requestAnimationFrame(moveWaterCan);
}

function hideWaterCanUntilRespawn() {
    waterCanIsActive = false;
    movingWaterCan.hidden = true;
    window.clearTimeout(waterCanRespawnTimeout);
    waterCanRespawnTimeout = window.setTimeout(showWaterCan, WATER_CAN_RESPAWN_DELAY);
}

function showDonationNotice() {
    donationNotice.hidden = false;
    window.clearTimeout(donationNoticeTimeout);
    donationNoticeTimeout = window.setTimeout(() => {
        donationNotice.hidden = true;
    }, 2500);
}

function moveWaterCan(frameTime) {
    if (gameIsOver || !waterCanIsActive) {
        return;
    }

    const elapsedSeconds = previousWaterCanFrame === null
        ? 0
        : Math.min((frameTime - previousWaterCanFrame) / 1000, 0.05);
    previousWaterCanFrame = frameTime;
    let distanceToTravel = WATER_CAN_SPEED * elapsedSeconds;

    while (distanceToTravel > 0 && waterCanSegment < waterCanPath.length - 1) {
        const start = waterCanPath[waterCanSegment];
        const end = waterCanPath[waterCanSegment + 1];
        const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
        const segmentDuration = segmentLength / WATER_CAN_SPEED;
        const elapsedSegmentTime = Math.min(
            distanceToTravel / WATER_CAN_SPEED,
            segmentDuration - waterCanSegmentTime
        );

        waterCanSegmentTime += elapsedSegmentTime;
        distanceToTravel -= elapsedSegmentTime * WATER_CAN_SPEED;

        const progress = segmentDuration === 0 ? 1 : waterCanSegmentTime / segmentDuration;
        const pointBefore = waterCanPath[Math.max(0, waterCanSegment - 1)];
        const pointAfter = waterCanPath[Math.min(waterCanPath.length - 1, waterCanSegment + 2)];
        const tSquared = progress * progress;
        const tCubed = tSquared * progress;

        waterCanX = 0.5 * (
            2 * start.x
            + (-pointBefore.x + end.x) * progress
            + (2 * pointBefore.x - 5 * start.x + 4 * end.x - pointAfter.x) * tSquared
            + (-pointBefore.x + 3 * start.x - 3 * end.x + pointAfter.x) * tCubed
        );
        waterCanY = 0.5 * (
            2 * start.y
            + (-pointBefore.y + end.y) * progress
            + (2 * pointBefore.y - 5 * start.y + 4 * end.y - pointAfter.y) * tSquared
            + (-pointBefore.y + 3 * start.y - 3 * end.y + pointAfter.y) * tCubed
        );

        if (waterCanSegmentTime >= segmentDuration) {
            waterCanSegment += 1;
            waterCanSegmentTime = 0;
        }
    }

    movingWaterCan.style.transform = `translate3d(${waterCanX}px, ${waterCanY}px, 0)`;

    if (playerElement) {
        const canRect = movingWaterCan.getBoundingClientRect();
        const playerRect = playerElement.getBoundingClientRect();
        const touchedPlayer = canRect.left < playerRect.right
            && canRect.right > playerRect.left
            && canRect.top < playerRect.bottom
            && canRect.bottom > playerRect.top;

        if (touchedPlayer) {
            score += DONATION_POINTS;
            updateStats();
            showDonationNotice();
            hideWaterCanUntilRespawn();
            return;
        }
    }

    const canHeight = movingWaterCan.offsetHeight;
    const hasLeftStage = waterCanX + movingWaterCan.offsetWidth < 0
        || waterCanX > gameStage.clientWidth
        || waterCanY + canHeight < 0
        || waterCanY > gameStage.clientHeight;

    if (hasLeftStage || waterCanSegment >= waterCanPath.length - 1) {
        hideWaterCanUntilRespawn();
        return;
    }

    waterCanAnimationFrame = window.requestAnimationFrame(moveWaterCan);
}

function movePlayer(directionName) {
    if (gameIsOver) {
        return;
    }

    facing = directionName;
    const direction = DIRECTIONS[directionName];
    const nextRow = player.row + direction.row;
    const nextColumn = player.column + direction.column;

    if (nextRow < 0) {
        message.textContent = 'You are at the surface. Dig down to explore!';
        return;
    }

    const nextTile = getWorldTile(nextRow, nextColumn);

    if (nextTile.type === 'rock' || nextTile.type === 'soil'
        || nextTile.type === 'clean-water' || nextTile.type === 'dirty-water') {
        message.textContent = nextTile.type === 'rock'
            ? 'A rock blocks the way. Try another route!'
            : 'That tile is in the way. Face it and press Dig.';
        return;
    }

    playerHasStarted = true;
    player = { row: nextRow, column: nextColumn };

    if (player.row > 0) {
        hasBeenUnderground = true;
        deepestRow = Math.max(deepestRow, player.row);
    } else if (hasBeenUnderground) {
        drawBoard();
        finishGame(true);
        return;
    }

    message.textContent = player.row === 0
        ? 'Dig down to collect water, then return to this surface!'
        : 'Keep exploring for clean water, and watch out for ghosts!';
    drawBoard();
}

function dig() {
    if (gameIsOver) {
        return;
    }

    playerHasStarted = true;
    const direction = DIRECTIONS[facing];
    const targetRow = player.row + direction.row;
    const targetColumn = player.column + direction.column;
    const targetTile = getWorldTile(targetRow, targetColumn);

    if (targetRow <= 0) {
        message.textContent = 'There is no more ground to dig in that direction.';
        return;
    }

    const ghostIndex = ghosts.findIndex((ghost) => ghost.row === targetRow
        && ghost.column === targetColumn);

    if (ghostIndex !== -1) {
        const [defeatedGhost] = ghosts.splice(ghostIndex, 1);
        nextGhostColor = defeatedGhost.color === 'yellow' ? 'blue' : 'yellow';
        score += 20;
        doublePointsUntil = Date.now() + DOUBLE_POINTS_DURATION;
        message.textContent = 'Ghost defeated! Double points are active for 10 seconds!';

        if (ghosts.length === 0) {
            spawnNextGhost();
        }

        drawBoard();
        return;
    }

    if (targetTile.type === 'rock') {
        message.textContent = 'Rocks cannot be dug through. Try another route!';
        return;
    }

    const isDoublePointsActive = Date.now() < doublePointsUntil;

    if (targetTile.type === 'clean-water') {
        gallons += targetTile.gallons;
        score += isDoublePointsActive ? 20 : 10;
        targetTile.type = 'air';
        message.textContent = `Clean water found! +${targetTile.gallons} gallons.`;
    } else if (targetTile.type === 'dirty-water') {
        score = Math.max(0, score - 100);
        targetTile.type = 'air';
        message.textContent = 'Dirty water pocket! You lost 100 points.';
    } else {
        targetTile.type = 'air';
        score += isDoublePointsActive ? 20 : 10;
        message.textContent = isDoublePointsActive
            ? 'Double points! Move into the cleared space.'
            : 'Nice digging! Move into the cleared space.';
    }

    drawBoard();
}

function spawnNextGhost() {
    const spawnColumn = player.column >= 0 ? player.column + 8 : player.column - 8;
    ghosts.push({
        row: 0,
        column: spawnColumn,
        color: nextGhostColor,
        direction: player.column >= 0 ? -1 : 1
    });
    message.textContent += ' Another ghost is approaching from the surface!';
}

function moveGhosts() {
    if (gameIsOver) {
        return;
    }

    for (const ghost of ghosts) {
        let directionOptions = Object.values(DIRECTIONS);

        if (!playerHasStarted) {
            directionOptions = [
                { row: 0, column: ghost.direction },
                { row: 0, column: -ghost.direction },
                DIRECTIONS.down,
                DIRECTIONS.up
            ];
        } else {
            directionOptions = directionOptions.sort((first, second) => {
                const firstDistance = Math.abs(ghost.row + first.row - player.row)
                    + Math.abs(ghost.column + first.column - player.column);
                const secondDistance = Math.abs(ghost.row + second.row - player.row)
                    + Math.abs(ghost.column + second.column - player.column);

                return firstDistance - secondDistance;
            });
        }

        const nextStep = directionOptions.find((direction) => {
            const row = ghost.row + direction.row;
            const column = ghost.column + direction.column;
            const occupiedByGhost = ghosts.some((otherGhost) => otherGhost !== ghost
                && otherGhost.row === row
                && otherGhost.column === column);

            return !occupiedByGhost;
        });

        if (nextStep) {
            ghost.row += nextStep.row;
            ghost.column += nextStep.column;
        }
    }

    const hasCollision = ghosts.some((ghost) => ghost.row === player.row
        && ghost.column === player.column);

    if (hasCollision && playerHasStarted && !isInvulnerable) {
        loseLife();
        return;
    }

    drawBoard();
}

function loseLife() {
    lives -= 1;

    if (lives === 0) {
        updateStats();
        finishGame(false, 'The ghosts caught you. Your final score is');
        return;
    }

    player = { row: 0, column: 0 };
    hasBeenUnderground = false;
    isInvulnerable = true;
    message.textContent = 'A ghost caught you! You lost a life. Get back to digging!';
    drawBoard();
    window.setTimeout(() => {
        isInvulnerable = false;
    }, 1800);
}

function finishGame(completed, reason = '') {
    gameIsOver = true;
    window.clearInterval(ghostTimer);
    window.clearInterval(gameTimer);
    window.cancelAnimationFrame(waterCanAnimationFrame);
    window.clearTimeout(waterCanRespawnTimeout);
    window.clearTimeout(donationNoticeTimeout);

    if (completed) {
        const depthInFeet = deepestRow * FEET_PER_TILE;
        const peopleHelped = Math.round(score * 10.21);

        window.location.href = `success.html?depth=${depthInFeet}&people=${peopleHelped}&score=${score}&gallons=${gallons}`;
        return;
    }

    endTitle.textContent = secondsRemaining === 0 ? "Time's up!" : 'Game over';
    endMessage.textContent = `${reason} ${score}.`;
    updateStats();
    overlay.hidden = false;
}

function countDown() {
    if (gameIsOver) {
        return;
    }

    secondsRemaining -= 1;
    updateStats();

    if (secondsRemaining <= 0) {
        secondsRemaining = 0;
        finishGame(false, 'Time ran out. Your final score is');
    }
}

document.addEventListener('keydown', (event) => {
    const directionName = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right'
    }[event.key];

    if (directionName) {
        event.preventDefault();
        movePlayer(directionName);
    } else if (event.code === 'Space') {
        event.preventDefault();
        dig();
    }
});

document.querySelectorAll('[data-direction]').forEach((button) => {
    button.addEventListener('click', () => movePlayer(button.dataset.direction));
});

document.querySelector('#dig-button').addEventListener('click', dig);

createBoard();
drawBoard();
createWaterCanPath();
ghostTimer = window.setInterval(moveGhosts, GHOST_STEP_DELAY);
gameTimer = window.setInterval(countDown, 1000);
waterCanAnimationFrame = window.requestAnimationFrame(moveWaterCan);
