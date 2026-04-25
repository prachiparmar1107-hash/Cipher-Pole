/* ============================================================
   PROJECT CIPHER — landing.js
   Handles:
     1. Welcome screen → Game screen transition
     2. Animated canvas background on the welcome page
     3. Fireworks celebration on win (hooks into existing launchConfetti)
   ============================================================ */


/* ─────────────────────────────────────────────────────────
   1.  WELCOME PAGE PARTICLE CANVAS
   ───────────────────────────────────────────────────────── */

(function initWelcomeCanvas() {
  const canvas = document.getElementById('welcomeCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');

  const COLORS = ['#FF4D6D','#FF9500','#FFE600','#00C97C','#3BBAFF','#6B6BFF','#CC5CE8','#FF70B8'];

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function Particle() {
    this.reset();
  }
  Particle.prototype.reset = function() {
    this.x    = Math.random() * W;
    this.y    = Math.random() * H;
    this.r    = 4 + Math.random() * 8;
    this.vx   = (Math.random() - 0.5) * 0.6;
    this.vy   = -0.3 - Math.random() * 0.5;
    this.col  = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.a    = 0.08 + Math.random() * 0.18;
    this.life = 0;
    this.maxLife = 180 + Math.random() * 240;
  };
  Particle.prototype.update = function() {
    this.x   += this.vx;
    this.y   += this.vy;
    this.life++;
    if (this.life > this.maxLife || this.y < -20) this.reset();
  };
  Particle.prototype.draw = function() {
    const progress = this.life / this.maxLife;
    const alpha    = this.a * (progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.col + Math.round(alpha * 255).toString(16).padStart(2,'0');
    ctx.fill();
  };

  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 55; i++) {
    const p = new Particle();
    p.life  = Math.random() * p.maxLife; // stagger starting positions
    particles.push(p);
  }

  let rafId = null;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    rafId = requestAnimationFrame(loop);
  }
  loop();

  // Stop the canvas loop once the welcome screen is gone (saves CPU)
  window._stopWelcomeCanvas = function() {
    cancelAnimationFrame(rafId);
  };
})();


/* ─────────────────────────────────────────────────────────
   2.  WELCOME → GAME TRANSITION
   ───────────────────────────────────────────────────────── */

(function initTransition() {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const gameScreen    = document.getElementById('gameScreen');
  const playBtn       = document.getElementById('playBtn');

  if (!playBtn) return;

  playBtn.addEventListener('click', function() {
    // Disable button immediately to prevent double-click
    playBtn.disabled = true;

    // Phase 1: fade out the welcome screen
    welcomeScreen.classList.add('fade-out');

    setTimeout(function() {
      // Hide welcome, show game
      welcomeScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      gameScreen.classList.add('fade-in');

      // Stop the particle canvas to free up resources
      if (window._stopWelcomeCanvas) window._stopWelcomeCanvas();

      // Trigger reflow so the fade-in animation plays
      void gameScreen.offsetWidth;
      gameScreen.classList.add('visible');

    }, 550); // matches welcome fade-out duration
  });
})();


/* ─────────────────────────────────────────────────────────
   3.  FIREWORKS CELEBRATION
   Upgrades the existing launchConfetti() to also show
   canvas fireworks. Called automatically because we patch
   the global after app.js defines it.
   ───────────────────────────────────────────────────────── */

(function initFireworks() {
  const canvas = document.getElementById('fireworksCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');

  const COLORS = ['#FF4D6D','#FF9500','#FFE600','#00C97C','#3BBAFF','#6B6BFF','#CC5CE8','#FF70B8'];

  let W, H;
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let particles = [];
  let rafId     = null;
  let running   = false;

  /* One spark flying outward from a burst origin */
  function Spark(x, y, angle, speed, color) {
    this.x    = x;   this.y    = y;
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.col  = color;
    this.life = 1.0;   // starts fully opaque
    this.decay= 0.014 + Math.random() * 0.01;
    this.r    = 2.5 + Math.random() * 2;
  }
  Spark.prototype.update = function() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += 0.07;  // gravity
    this.vx   *= 0.98;  // air resistance
    this.life -= this.decay;
  };
  Spark.prototype.draw = function() {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * this.life, 0, Math.PI * 2);
    ctx.fillStyle = this.col;
    ctx.fill();
  };

  /* Burst: 60–80 sparks from a random position */
  function burst() {
    const x     = 0.15 * W + Math.random() * 0.70 * W;
    const y     = 0.10 * H + Math.random() * 0.55 * H;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const count = 60 + Math.floor(Math.random() * 30);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 2 + Math.random() * 5;
      particles.push(new Spark(x, y, angle, speed, color));
    }
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });
    ctx.globalAlpha = 1;

    if (running) rafId = requestAnimationFrame(loop);
    else if (particles.length === 0) {
      canvas.style.pointerEvents = 'none';
      canvas.style.opacity = '0';
    }
  }

  /* Public API: start the celebration */
  window.launchFireworks = function() {
    running = true;
    canvas.style.opacity = '1';

    // Fire 7 bursts over ~2.5 seconds, then stop generating
    let count = 0;
    const maxBursts = 7;
    function fireBurst() {
      if (count < maxBursts) {
        burst();
        count++;
        setTimeout(fireBurst, 300 + Math.random() * 200);
      } else {
        running = false; // stop the RAF loop once sparks fade out
      }
    }
    fireBurst();
    loop();
  };


  /* ── Patch the existing launchConfetti to ALSO fire fireworks ──
     app.js defines launchConfetti() before landing.js loads,
     so we wrap it here without touching app.js at all.           */
  const _origConfetti = window.launchConfetti;
  window.launchConfetti = function() {
    if (_origConfetti) _origConfetti();  // keep existing confetti
    window.launchFireworks();             // add fireworks on top
  };
})();
