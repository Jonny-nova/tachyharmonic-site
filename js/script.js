document.getElementById("year").textContent = new Date().getFullYear();

const mobileNavigation = document.querySelector(".mobile-nav");
mobileNavigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileNavigation.open = false;
  });
});
