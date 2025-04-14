// State machine for tracking egg interactions
const mirrorState = {
    pressCount: 0,
    pressTimestamps: [],
    sessionStart: Date.now(),
    responseHistory: [],
    responses: [
        "Still waiting...",
        "Listening again.",
        "What are you pressing for?",
        "You're listening with your fingertips.",
        "Some things don't hatch by force.",
        "You're early. That's perfect." // Return to default
    ]
};

// DOM elements
const egg = document.querySelector('.egg');
const responseText = document.querySelector('.response-text');
const defaultText = "You're early. That's perfect.";

// Function to generate response based on state
function generateResponse(state) {
    // Get the appropriate response based on press count
    const responseIndex = state.pressCount % state.responses.length;
    const response = state.responses[responseIndex];
    
    // Add to response history
    state.responseHistory.push({
        response,
        timestamp: Date.now()
    });
    
    return response;
}

// Function to update the interface with new response
function updateInterface(response) {
    // Add transition class for animation
    responseText.classList.add('text-transition');
    
    // Update text content
    setTimeout(() => {
        responseText.textContent = response;
    }, 250);
    
    // Remove transition class after animation completes
    setTimeout(() => {
        responseText.classList.remove('text-transition');
        
        // If not the default message, return to default after a delay
        if (response !== defaultText && mirrorState.pressCount % mirrorState.responses.length === 5) {
            setTimeout(() => {
                responseText.classList.add('text-transition');
                setTimeout(() => {
                    responseText.textContent = defaultText;
                    setTimeout(() => {
                        responseText.classList.remove('text-transition');
                    }, 2000);
                }, 250);
            }, 3000);
        }
    }, 2000);
}

// Event listeners
egg.addEventListener('click', () => {
    mirrorState.pressCount++;
    mirrorState.pressTimestamps.push(Date.now());
    const response = generateResponse(mirrorState);
    updateInterface(response);
});

// Keyboard accessibility
egg.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        egg.click();
    }
});

// Fallback for no JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // If JavaScript is enabled, this will run and remove the no-js class if it exists
    document.documentElement.classList.remove('no-js');
});
