const resultParameters = new URLSearchParams(window.location.search);

function getResultValue(name) {
    const value = Number(resultParameters.get(name));

    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return value;
}

document.querySelector('#depth-result').textContent = getResultValue('depth');
document.querySelector('#gallons-result').textContent = getResultValue('gallons').toLocaleString();
document.querySelector('#people-result').textContent = getResultValue('people');
document.querySelector('#score-result').textContent = getResultValue('score');

const confettiContainer = document.querySelector('#confetti');
const confettiColors = ['#ffc907', '#003366', '#77a8bb', '#bf6c46', '#fff7e1'];

for (let index = 0; index < 48; index += 1) {
    const confettiPiece = document.createElement('span');
    const size = 6 + Math.random() * 7;
    const drift = Math.round((Math.random() - 0.5) * 220);

    confettiPiece.className = 'confetti-piece';
    confettiPiece.style.setProperty('--confetti-left', `${Math.random() * 100}%`);
    confettiPiece.style.setProperty('--confetti-size', `${size}px`);
    confettiPiece.style.setProperty('--confetti-color', confettiColors[index % confettiColors.length]);
    confettiPiece.style.setProperty('--confetti-duration', `${3 + Math.random() * 2}s`);
    confettiPiece.style.setProperty('--confetti-delay', `${Math.random() * 1.5}s`);
    confettiPiece.style.setProperty('--confetti-drift', `${drift}px`);
    confettiPiece.style.setProperty('--confetti-rotation', `${Math.round(Math.random() * 900)}deg`);
    confettiContainer.append(confettiPiece);
}
