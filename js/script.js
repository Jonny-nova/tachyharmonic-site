'use strict';

(function() {
  const egg = document.querySelector('.egg');
  const response = document.querySelector('.response-text');

  if (!egg || !response) return;

  const updateMessage = () => {
    response.textContent = 'The egg is hatching\u2026';
    response.classList.remove('text-transition');
    // force reflow to restart animation if triggered multiple times
    void response.offsetWidth;
    response.classList.add('text-transition');
  };

  egg.addEventListener('click', updateMessage);
  egg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      updateMessage();
    }
  });
})();
