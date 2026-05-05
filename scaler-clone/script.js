document.addEventListener('DOMContentLoaded', function() {
  let navbarOpen = false;
  let heroCTAsClicked = [];

  function renderNavbar() {
    const navbar = document.querySelector('.navbar');
    const hamburger = document.querySelector('.hamburger');
    navbar.innerHTML = `
      <div class="navbar-brand">Scaler Academy</div>
      <div class="hamburger" onclick="toggleNavbar()"></div>
      <div class="navbar-links">
        <a href="#">Home</a>
        <a href="#">Programs</a>
        <a href="#">About</a>
      </div>
    `;
  }

  function renderHero() {
    const hero = document.querySelector('.hero');
    hero.innerHTML = `
      <h1>Welcome to Scaler Academy</h1>
      <button class="cta" onclick="handleCTAClick('Apply Now')">Apply Now</button>
      <button class="cta" onclick="handleCTAClick('Learn More')">Learn More</button>
    `;
  }

  function renderPrograms() {
    const programs = document.querySelector('.programs');
    programs.innerHTML = `
      <div class="program-card" onmouseover="handleCardHover(this)" onmouseout="handleCardHoverOut(this)">
        <h2>Program 1</h2>
        <p>Program 1 description</p>
      </div>
      <div class="program-card" onmouseover="handleCardHover(this)" onmouseout="handleCardHoverOut(this)">
        <h2>Program 2</h2>
        <p>Program 2 description</p>
      </div>
    `;
  }

  function renderFooter() {
    const footer = document.querySelector('.footer');
    footer.innerHTML = `
      <a href="#" onclick="handleLinkClick('Terms')">Terms</a>
      <a href="#" onclick="handleLinkClick('Privacy')">Privacy</a>
    `;
  }

  function toggleNavbar() {
    navbarOpen = !navbarOpen;
    document.querySelector('.navbar-links').classList.toggle('open');
  }

  function handleCTAClick(cta) {
    heroCTAsClicked.push(cta);
    console.log(`CTA clicked: ${cta}`);
  }

  function handleCardHover(card) {
    card.classList.add('hover');
  }

  function handleCardHoverOut(card) {
    card.classList.remove('hover');
  }

  function handleLinkClick(link) {
    console.log(`Link clicked: ${link}`);
  }

  renderNavbar();
  renderHero();
  renderPrograms();
  renderFooter();

  window.addEventListener('resize', function() {
    if (window.innerWidth < 768) {
      document.querySelector('.navbar-links').classList.remove('open');
    }
  });
});