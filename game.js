const ROWS = 12;
const COLUMNS = 18;
const MAX_DEPTH_FEET = 1000;
const METERS_PER_FOOT = 0.3048;
const MAX_DEPTH_METERS = MAX_DEPTH_FEET * METERS_PER_FOOT;
const GHOST_STEP_DELAY = 800;
const DOUBLE_POINTS_DURATION = 10000;
const WATER_CAN_SPEED = 180;
const WATER_CAN_RESPAWN_DELAY = 10000;
const DONATION_POINTS = 1000;
const DIRECTIONS = {
    up: { row: -1, column: 0 },
    down: { row: 1, column: 0 },
    left: { row: 0, column: -1 },
    right: { row: 0, column: 1 }
};

const board = document.querySelector('#game-board');
const scoreValue = document.querySelector('#score-value');
const livesValue = document.querySelector('#lives-value');
const pointsBoostValue = document.querySelector('#points-boost-value');
const depthValue = document.querySelector('#depth-value');
const depthGauge = document.querySelector('.depth-gauge');
const depthFill = document.querySelector('#depth-fill');
const message = document.querySelector('#game-message');
const overlay = document.querySelector('#game-overlay');
const endTitle = document.querySelector('#end-title');
const endMessage = document.querySelector('#end-message');
const gameStage = document.querySelector('.game-stage');
const movingWaterCan = document.querySelector('#moving-water-can');
const donationNotice = document.querySelector('#donation-notice');

const terrain = [];
const tileElements = [];
let player = { row: 1, column: 8 };
let facing = 'down';
let ghosts = createGhosts();
let score = 0;
let lives = 3;
let gameIsOver = false;
let isInvulnerable = false;
let playerHasStarted = false;
let doublePointsUntil = 0;
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

function createGhosts() {
    return [
        { row: 1, column: 1, color: 'yellow', direction: 1, patrolStart: 1, patrolEnd: 6 },
        { row: 1, column: COLUMNS - 2, color: 'blue', direction: -1, patrolStart: 10, patrolEnd: COLUMNS - 2 }
    ];
}

function createTerrain() {
    for (let row = 0; row < ROWS; row += 1) {
        terrain[row] = [];
        tileElements[row] = [];

        for (let column = 0; column < COLUMNS; column += 1) {
            let tileType = 'soil';

            if (row < 2) {
                tileType = 'air';
            } else if (row === ROWS - 1) {
                tileType = 'water';
            }

            terrain[row][column] = tileType;

            const tile = document.createElement('div');
            tile.className = `tile tile-${tileType}`;
            tile.setAttribute('role', 'gridcell');
            tileElements[row][column] = tile;
            board.append(tile);
        }
    }

    for (let row = 2; row < ROWS - 1; row += 1) {
        const rockCount = row > 5 ? 4 : 3;
        const availableColumns = [];

        for (let column = 0; column < COLUMNS; column += 1) {
            if (column !== player.column) {
                availableColumns.push(column);
            }
        }

        for (let index = availableColumns.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [availableColumns[index], availableColumns[randomIndex]] = [availableColumns[randomIndex], availableColumns[index]];
        }

        for (let index = 0; index < rockCount; index += 1) {
            const column = availableColumns[index];
            terrain[row][column] = 'rock';
            tileElements[row][column].className = 'tile tile-rock';
        }
    }
}

function drawBoard() {
    for (let row = 0; row < ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
            const tile = tileElements[row][column];
            const tileType = terrain[row][column];
            tile.className = `tile tile-${tileType}`;
            tile.setAttribute('aria-label', tileType === 'rock' ? 'Rock, cannot be dug' : tileType);
            tile.replaceChildren();

            if (player.row === row && player.column === column) {
                tile.insertAdjacentHTML('beforeend', `
                    <span class="miner-avatar" aria-hidden="true">
                        <span class="miner-helmet"></span>
                        <span class="miner-face"></span>
                        <span class="miner-body"></span>
                    </span>
                `);
            } else {
                const ghost = ghosts.find((character) => character.row === row && character.column === column);

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

function updateStats() {
    const depthProgress = Math.min(1, Math.max(0, (player.row - 1) / (ROWS - 2)));
    const depth = Math.round(depthProgress * MAX_DEPTH_METERS);
    const livesDisplay = `${'♥ '.repeat(lives).trim()}${'♡ '.repeat(3 - lives).trim()}`.trim();
    const boostSeconds = Math.max(0, Math.ceil((doublePointsUntil - Date.now()) / 1000));

    scoreValue.textContent = score;
    livesValue.textContent = livesDisplay;
    pointsBoostValue.textContent = boostSeconds > 0 ? `2× active · ${boostSeconds}s` : '2× inactive';
    pointsBoostValue.classList.toggle('is-active', boostSeconds > 0);
    depthValue.textContent = `${depth} m`;
    depthFill.style.height = `${depthProgress * 100}%`;
    depthGauge.setAttribute('aria-valuenow', depth);
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
        ? {
            x: Math.random() < 0.5 ? 0 : Math.max(0, stageWidth - canWidth),
            y: tileElements[0][0].offsetTop + (tileElements[0][0].clientHeight - canHeight) / 2
        }
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
    const exitPoint = {
        x: exitSide === 1 ? stageWidth + canWidth : exitSide === 3 ? -canWidth : Math.random() * stageWidth,
        y: exitSide === 0 ? -canHeight : exitSide === 2 ? stageHeight + canHeight : Math.random() * stageHeight
    };

    path.push(exitPoint);
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

    const canHeight = movingWaterCan.offsetHeight;
    let distanceToTravel = WATER_CAN_SPEED * elapsedSeconds;

    while (distanceToTravel > 0 && waterCanSegment < waterCanPath.length - 1) {
        const start = waterCanPath[waterCanSegment];
        const end = waterCanPath[waterCanSegment + 1];
        const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
        const segmentDuration = segmentLength / WATER_CAN_SPEED;
        const remainingSegmentTime = segmentDuration - waterCanSegmentTime;
        const elapsedSegmentTime = Math.min(distanceToTravel / WATER_CAN_SPEED, remainingSegmentTime);

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

    const playerAvatar = tileElements[player.row][player.column].querySelector('.miner-avatar');

    if (playerAvatar) {
        const canRect = movingWaterCan.getBoundingClientRect();
        const playerRect = playerAvatar.getBoundingClientRect();
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

function isInsideBoard(row, column) {
    return row >= 0 && row < ROWS && column >= 0 && column < COLUMNS;
}

function movePlayer(directionName) {
    if (gameIsOver) {
        return;
    }

    facing = directionName;
    const direction = DIRECTIONS[directionName];
    const nextRow = player.row + direction.row;
    const nextColumn = player.column + direction.column;

    if (!isInsideBoard(nextRow, nextColumn)) {
        message.textContent = 'You cannot go any farther that way.';
        drawBoard();
        return;
    }

    const nextTile = terrain[nextRow][nextColumn];

    if (nextTile === 'rock') {
        message.textContent = 'A rock blocks the way. Try another route!';
        drawBoard();
        return;
    }

    if (nextTile === 'soil') {
        message.textContent = 'That soil is in the way. Face it and press Dig.';
        drawBoard();
        return;
    }

    playerHasStarted = true;
    player = { row: nextRow, column: nextColumn };

    if (nextTile === 'water') {
        finishGame(true);
        return;
    }

    message.textContent = 'Keep digging toward the water, and watch out for ghosts!';
    drawBoard();
}

function dig() {
    if (gameIsOver) {
        return;
    }

    const direction = DIRECTIONS[facing];
    const targetRow = player.row + direction.row;
    const targetColumn = player.column + direction.column;

    if (!isInsideBoard(targetRow, targetColumn)) {
        message.textContent = 'There is nothing to dig in that direction.';
        return;
    }

    if (terrain[targetRow][targetColumn] === 'rock') {
        message.textContent = 'Rocks cannot be dug through. Try another route!';
        return;
    }

    const ghostIndex = ghosts.findIndex((ghost) => ghost.row === targetRow && ghost.column === targetColumn);

    if (ghostIndex !== -1) {
        playerHasStarted = true;
        ghosts.splice(ghostIndex, 1);
        score += 20;
        doublePointsUntil = Date.now() + DOUBLE_POINTS_DURATION;
        message.textContent = 'Ghost defeated! Double points are active for 10 seconds!';
        drawBoard();
        return;
    }

    if (terrain[targetRow][targetColumn] === 'soil') {
        playerHasStarted = true;
        terrain[targetRow][targetColumn] = 'air';
        const isDoublePointsActive = Date.now() < doublePointsUntil;
        score += isDoublePointsActive ? 20 : 10;
        message.textContent = isDoublePointsActive
            ? 'Double points! Nice digging. Move into the cleared space.'
            : 'Nice digging! Move into the cleared space.';
        drawBoard();
        return;
    }

    message.textContent = 'There is nothing to dig here. Keep moving toward the water!';
}

function findGhostStep(ghost) {
    const queue = [{ row: ghost.row, column: ghost.column, firstStep: null }];
    const visited = new Set([`${ghost.row},${ghost.column}`]);

    for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];

        for (const direction of Object.values(DIRECTIONS)) {
            const row = current.row + direction.row;
            const column = current.column + direction.column;
            const key = `${row},${column}`;

            if (!isInsideBoard(row, column) || visited.has(key)) {
                continue;
            }

            const firstStep = current.firstStep || { row, column };

            if (row === player.row && column === player.column) {
                return firstStep;
            }

            visited.add(key);
            queue.push({ row, column, firstStep });
        }
    }

    return null;
}

function moveGhosts() {
    if (gameIsOver) {
        return;
    }

    if (!playerHasStarted) {
        for (const ghost of ghosts) {
            let nextColumn = ghost.column + ghost.direction;

            if (nextColumn < ghost.patrolStart || nextColumn > ghost.patrolEnd) {
                ghost.direction *= -1;
                nextColumn = ghost.column + ghost.direction;
            }

            const wouldHitPlayer = ghost.row === player.row && nextColumn === player.column;
            const wouldHitGhost = ghosts.some((otherGhost) => otherGhost !== ghost
                && otherGhost.row === ghost.row
                && otherGhost.column === nextColumn);

            if (wouldHitPlayer || wouldHitGhost) {
                ghost.direction *= -1;
                nextColumn = ghost.column + ghost.direction;
            }

            if (nextColumn >= ghost.patrolStart && nextColumn <= ghost.patrolEnd
                && nextColumn !== player.column
                && !ghosts.some((otherGhost) => otherGhost !== ghost
                    && otherGhost.row === ghost.row
                    && otherGhost.column === nextColumn)) {
                ghost.column = nextColumn;
            }
        }

        drawBoard();
        return;
    }

    for (const ghost of ghosts) {
        const nextStep = findGhostStep(ghost);

        if (nextStep) {
            ghost.row = nextStep.row;
            ghost.column = nextStep.column;
        }
    }

    const hasCollision = ghosts.some((ghost) => ghost.row === player.row && ghost.column === player.column);

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
        finishGame(false);
        return;
    }

    player = { row: 1, column: 8 };
    ghosts = createGhosts();
    isInvulnerable = true;
    message.textContent = 'A ghost caught you! You lost a life. Get back to digging!';
    drawBoard();
    window.setTimeout(() => {
        isInvulnerable = false;
    }, 1800);
}

function finishGame(foundWater) {
    gameIsOver = true;
    window.clearInterval(ghostTimer);
    window.cancelAnimationFrame(waterCanAnimationFrame);
    window.clearTimeout(waterCanRespawnTimeout);
    window.clearTimeout(donationNoticeTimeout);

    if (foundWater) {
        score += 100;
        const depthProgress = Math.min(1, Math.max(0, (player.row - 1) / (ROWS - 2)));
        const depthInFeet = Math.round(depthProgress * MAX_DEPTH_FEET);
        const peopleHelped = Math.round(score * 10.21);

        window.location.href = `success.html?depth=${depthInFeet}&people=${peopleHelped}&score=${score}`;
        return;
    }

    endTitle.textContent = 'Game over';
    endMessage.textContent = `The ghosts caught you. Your final score is ${score}.`;
    updateStats();
    overlay.hidden = false;
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

createTerrain();
drawBoard();
createWaterCanPath();
const ghostTimer = window.setInterval(moveGhosts, GHOST_STEP_DELAY);
waterCanAnimationFrame = window.requestAnimationFrame(moveWaterCan);
