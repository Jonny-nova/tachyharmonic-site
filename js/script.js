const messages = [
    "You're early. That's perfect.",
    "We're just getting started.",
    "Patience fosters clarity.",
    "Welcome to the threshold."
];

let index = 0;

function updateText() {
    const response = document.querySelector('.response-text');
    if (!response) return;

    response.textContent = messages[index];

    response.classList.remove('text-transition');
    void response.offsetWidth; // trigger reflow to restart animation
    response.classList.add('text-transition');

    index = (index + 1) % messages.length;
}

const egg = document.querySelector('.egg');
if (egg) {
    egg.addEventListener('click', updateText);
    egg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            updateText();
        }
    });
}
