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
