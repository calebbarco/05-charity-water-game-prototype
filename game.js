const ROWS = 12;
const COLUMNS = 18;
const MAX_DEPTH = 50;
const GHOST_STEP_DELAY = 800;
const DIRECTIONS = {
    up: { row: -1, column: 0 },
    down: { row: 1, column: 0 },
    left: { row: 0, column: -1 },
    right: { row: 0, column: 1 }
};
const ROCK_SPOTS = [
    [4, 3], [4, 13],
    [5, 6], [5, 11],
    [6, 2], [6, 14],
    [7, 5], [7, 12],
    [8, 3], [8, 15],
    [9, 6], [9, 11]
];

const board = document.querySelector('#game-board');
const scoreValue = document.querySelector('#score-value');
const livesValue = document.querySelector('#lives-value');
const depthValue = document.querySelector('#depth-value');
const depthGauge = document.querySelector('.depth-gauge');
const depthFill = document.querySelector('#depth-fill');
const message = document.querySelector('#game-message');
const overlay = document.querySelector('#game-overlay');
const endTitle = document.querySelector('#end-title');
const endMessage = document.querySelector('#end-message');

const terrain = [];
const tileElements = [];
let player = { row: 1, column: 8 };
let facing = 'down';
let ghosts = [
    { row: 1, column: 1, color: 'pink' },
    { row: 1, column: COLUMNS - 2, color: 'blue' }
];
let score = 0;
let lives = 3;
let gameIsOver = false;
let isInvulnerable = false;

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
            } else if (ROCK_SPOTS.some(([rockRow, rockColumn]) => rockRow === row && rockColumn === column)) {
                tileType = 'rock';
            }

            terrain[row][column] = tileType;

            const tile = document.createElement('div');
            tile.className = `tile tile-${tileType}`;
            tile.setAttribute('role', 'gridcell');
            tileElements[row][column] = tile;
            board.append(tile);
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
    const depth = Math.min(MAX_DEPTH, Math.max(0, (player.row - 1) * 5));
    const livesDisplay = `${'♥ '.repeat(lives).trim()}${'♡ '.repeat(3 - lives).trim()}`.trim();

    scoreValue.textContent = score;
    livesValue.textContent = livesDisplay;
    depthValue.textContent = `${depth} m`;
    depthFill.style.height = `${(depth / MAX_DEPTH) * 100}%`;
    depthGauge.setAttribute('aria-valuenow', depth);
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

    if (terrain[targetRow][targetColumn] === 'soil') {
        terrain[targetRow][targetColumn] = 'air';
        score += 10;
        message.textContent = 'Nice digging! Move into the cleared space.';
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

            const tileType = terrain[row][column];

            if (tileType !== 'air' && tileType !== 'water') {
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

    for (const ghost of ghosts) {
        const nextStep = findGhostStep(ghost);

        if (nextStep) {
            ghost.row = nextStep.row;
            ghost.column = nextStep.column;
        }
    }

    const hasCollision = ghosts.some((ghost) => ghost.row === player.row && ghost.column === player.column);

    if (hasCollision && !isInvulnerable) {
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
    ghosts = [
        { row: 1, column: 1, color: 'pink' },
        { row: 1, column: COLUMNS - 2, color: 'blue' }
    ];
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

    if (foundWater) {
        score += 100;
        const depthInMeters = Math.min(MAX_DEPTH, Math.max(0, (player.row - 1) * 5));
        const depthInFeet = Math.round(depthInMeters * 3.28084);
        const peopleHelped = Math.max(1, Math.round(depthInFeet / 10));

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
const ghostTimer = window.setInterval(moveGhosts, GHOST_STEP_DELAY);
