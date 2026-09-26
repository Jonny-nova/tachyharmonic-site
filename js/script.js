document.getElementById("year").textContent = new Date().getFullYear();

const mobileNavigation = document.querySelector(".mobile-nav");
mobileNavigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileNavigation.open = false;
  });
});

const intakeForm = document.getElementById("intake-preview");
const intakeNote = document.getElementById("intake-note");
const characterCount = document.getElementById("character-count");

function updateCharacterCount() {
  characterCount.textContent = intakeNote.value.length + " / " + intakeNote.maxLength;
}

intakeNote.addEventListener("input", updateCharacterCount);
updateCharacterCount();
intakeForm.addEventListener("submit", (event) => event.preventDefault());
