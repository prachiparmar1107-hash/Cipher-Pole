/* ============================================================
   PROJECT CIPHER — app.js
   Complete Mastermind puzzle engine.

   BUGS FIXED vs original student code:
   1. Syntax error: "const const idx" → fixed to "const idx"
   2. Dark mode: now uses data-theme on <html>, not body.dark class
   3. Timer: reads timeLimit selector at START not on change event
   4. Slot count: syncDifficultyToGame() called on load + on change
   5. Leaderboard: per-difficulty keys in localStorage
   6. Timer arc: correct circumference 283 (2 × π × 45 ≈ 282.74)
   ============================================================ */


/* ─────────────────────────────────────────────────────────
   1.  CONFIGURATION
   ───────────────────────────────────────────────────────── */

/**
 * DIFFICULTIES defines the three game modes.
 * slots      = number of colour slots to fill
 * colors     = how many colours from COLOR_POOL are available
 * attempts   = maximum number of guesses allowed
 */
const DIFFICULTIES = {
  easy:   { slots: 4, colors: 4, attempts: 8,  label: 'Easy'   },
  medium: { slots: 5, colors: 6, attempts: 10, label: 'Medium' },
  hard:   { slots: 6, colors: 8, attempts: 12, label: 'Hard'   },
};

/**
 * Full palette of 8 colours (hex strings).
 * Only the first N colours are shown, where N = difficulty.colors.
 */
const COLOR_POOL = [
  '#FF4D6D', // 1 — red-pink
  '#FF9500', // 2 — orange
  '#FFE600', // 3 — yellow
  '#00C97C', // 4 — green
  '#3BBAFF', // 5 — sky-blue
  '#6B6BFF', // 6 — indigo
  '#CC5CE8', // 7 — purple
  '#FF70B8', // 8 — hot-pink
];

/**
 * Geometric symbols used in the Accessibility (A11y) overlay mode.
 * One symbol per colour position so colour-blind players can still read the board.
 */
const SYMBOLS = ['●', '■', '▲', '◆', '★', '♥', '✦', '✿'];


/* ─────────────────────────────────────────────────────────
   2.  GAME STATE
   ───────────────────────────────────────────────────────── */

/**
 * Single source of truth for the current game session.
 * Every rendering function reads from this object.
 */
let game = {
  difficulty:   'medium', // current difficulty key
  slots:        5,        // number of colour slots
  colorsCount:  6,        // colours available
  maxAttempts:  10,       // total guesses allowed
  attemptsLeft: 10,       // guesses remaining
  secret:       [],       // the hidden colour sequence
  boardRows:    [],       // array of { guess[], feedback{black,white} }
  currentGuess: [],       // the in-progress guess (null = empty slot)
  started:      false,    // whether a game session is active
  timer:        null,     // setInterval reference
  timeLeft:     90,       // seconds remaining
  initialTime:  90,       // total seconds (set at game start)
  hintsUsed:    0,        // hints used this round
  hintPenalty:  0,        // score deduction from hints
};

/** Which leaderboard tab is currently visible */
let lbActiveTab = 'easy';


/* ─────────────────────────────────────────────────────────
   3.  DOM REFERENCES
   ───────────────────────────────────────────────────────── */
const $ = s => document.querySelector(s);

const difficultyEl   = $('#difficulty');
const timeLimitEl    = $('#timeLimit');
const inputModeEl    = $('#inputMode');
const startBtn       = $('#startBtn');
const submitBtn      = $('#submitGuess');
const clearBtn       = $('#clearGuess');
const hintBtn        = $('#hintBtn');
const paletteEl      = $('#palette');
const currentGuessEl = $('#currentGuess');
const boardEl        = $('#board');
const boardTitle     = $('#boardTitle');
const secretSlots    = $('#secretSlots');
const overlay        = $('#overlay');
const modalBody      = $('#modalBody');
const modalActions   = $('#modalActions');
const lbList         = $('#lbList');
const timerText      = $('#timerText');
const timerArc       = $('#timerArc');
const a11yMode       = $('#a11yMode');
const themeToggle    = $('#themeToggle');


/* ─────────────────────────────────────────────────────────
   4.  THEME (DARK / LIGHT)
   ───────────────────────────────────────────────────────── */

/**
 * FIX: The original code added/removed class "dark" on <body>.
 * But CSS variables were defined on :root, so they never changed.
 * Solution: toggle data-theme attribute on <html> — CSS responds
 * with [data-theme="dark"] { --bg: ...; } selectors in styles.css.
 */
themeToggle.addEventListener('click', () => {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
});


/* ─────────────────────────────────────────────────────────
   5.  INITIALISATION
   ───────────────────────────────────────────────────────── */

/**
 * init() is called once when the page loads.
 * Sets up event listeners and renders the initial empty state.
 */
function init() {
  buildPalette();

  // FIX: When difficulty changes, immediately sync game.slots so the
  // "Your Guess" area shows the correct number of slots right away.
  difficultyEl.addEventListener('change', () => {
    syncDifficultyToGame();
    buildPalette();
    resetGuessDisplay();
    renderBoardEmpty();
    renderSecretSlots(false);
  });

  startBtn.addEventListener('click',   startGame);
  submitBtn.addEventListener('click',  onSubmitGuess);
  clearBtn.addEventListener('click',   onClearGuess);
  hintBtn.addEventListener('click',    onHint);

  // Re-render when accessibility symbols toggle
  a11yMode.addEventListener('change', () => {
    renderCurrentGuess();
    renderBoard();
    buildPalette();
  });

  // Sync game config from the selects on first load
  syncDifficultyToGame();
  resetGuessDisplay();
  renderBoardEmpty();
  renderSecretSlots(false);
  showLbTab('easy');
}

/**
 * Reads the difficulty <select> and copies its values into the game object.
 * Called on page load AND every time the player changes difficulty.
 */
function syncDifficultyToGame() {
  const diff          = DIFFICULTIES[difficultyEl.value];
  game.difficulty     = difficultyEl.value;
  game.slots          = diff.slots;
  game.colorsCount    = diff.colors;
  game.maxAttempts    = diff.attempts;
  game.attemptsLeft   = diff.attempts;
  game.currentGuess   = Array(game.slots).fill(null);
}


/* ─────────────────────────────────────────────────────────
   6.  COLOUR PALETTE
   ───────────────────────────────────────────────────────── */

/**
 * Builds (or rebuilds) the palette of clickable colour swatches.
 * Only shows the first game.colorsCount swatches; hides the rest.
 */
function buildPalette() {
  paletteEl.innerHTML = '';

  COLOR_POOL.forEach((color, i) => {
    const sw = document.createElement('div');
    sw.className   = 'color-swatch' + (i >= game.colorsCount ? ' hidden' : '');
    sw.style.background = color;
    sw.dataset.color    = color;
    sw.title            = `Color ${i + 1}`;

    // A11y: show symbol inside the swatch
    if (a11yMode.checked) {
      sw.textContent = SYMBOLS[i];
      sw.style.cssText += ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;';
    }

    // In "palette" input mode, clicking a swatch fills the next empty slot
    sw.addEventListener('click', () => {
      if (!game.started) return;
      if (inputModeEl.value === 'palette') {
        const idx = game.currentGuess.findIndex(c => c === null);
        if (idx !== -1) {
          game.currentGuess[idx] = color;
          renderCurrentGuess();
          updateSubmitState();
        }
      }
    });

    paletteEl.appendChild(sw);
  });
}


/* ─────────────────────────────────────────────────────────
   7.  GAME START
   ───────────────────────────────────────────────────────── */

/**
 * Resets all game state and begins a new round.
 */
function startGame() {
  stopTimer();

  // FIX: Read time limit RIGHT NOW when Start is pressed.
  // Original code relied on a 'change' event that might not have fired.
  const chosenTime = parseInt(timeLimitEl.value, 10) || 90;

  syncDifficultyToGame();

  game.secret       = generateSecret(game.slots, game.colorsCount);
  game.boardRows    = [];
  game.currentGuess = Array(game.slots).fill(null);
  game.started      = true;
  game.timeLeft     = chosenTime;
  game.initialTime  = chosenTime;
  game.hintsUsed    = 0;
  game.hintPenalty  = 0;

  buildPalette();
  renderCurrentGuess();
  renderBoard();
  renderSecretSlots(false);
  updateTimerDisplay();
  startTimer();

  submitBtn.disabled = true;   // enabled when all slots are filled
  clearBtn.disabled  = false;
  hintBtn.disabled   = false;

  showToast(`Game started! ${DIFFICULTIES[game.difficulty].label} — ${game.slots} slots, ${game.colorsCount} colors`);
}

/**
 * Creates a random secret code array of `slots` colours,
 * drawn with replacement from the first `colorsCount` colours.
 * Duplicates are allowed (standard Mastermind rules).
 */
function generateSecret(slots, colorsCount) {
  const pool = COLOR_POOL.slice(0, colorsCount);
  return Array.from({ length: slots }, () =>
    pool[Math.floor(Math.random() * pool.length)]
  );
}


/* ─────────────────────────────────────────────────────────
   8.  TIMER
   ───────────────────────────────────────────────────────── */

/** Starts the 1-second countdown interval. */
function startTimer() {
  stopTimer();
  updateTimerDisplay();
  game.timer = setInterval(() => {
    game.timeLeft--;
    updateTimerDisplay();
    if (game.timeLeft <= 0) {
      stopTimer();
      endGame(false, 'time');
    }
  }, 1000);
}

/** Clears any running interval. Safe to call even if no timer is running. */
function stopTimer() {
  if (game.timer) {
    clearInterval(game.timer);
    game.timer = null;
  }
}

/**
 * Updates the mm:ss text and the SVG arc stroke.
 *
 * HOW THE ARC WORKS:
 *   The SVG circle has r=45, so its circumference = 2 × π × 45 ≈ 282.74 ≈ 283.
 *   stroke-dasharray: 283   → the dash pattern is the full circle.
 *   stroke-dashoffset: X    → offsets the dash, hiding X units of the stroke.
 *
 *   When timeLeft = initialTime  → ratio = 1 → offset = 0   → full circle visible.
 *   When timeLeft = 0            → ratio = 0 → offset = 283  → circle fully hidden.
 *
 * COLOUR URGENCY:
 *   > 50% time left  → blue/purple (calm)
 *   25-50% left      → amber/orange (warning)
 *   < 25% left       → red/orange (danger)
 */
function updateTimerDisplay() {
  const sec = Math.max(0, game.timeLeft);
  const mm  = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss  = String(sec % 60).padStart(2, '0');
  timerText.textContent = `${mm}:${ss}`;

  const CIRCUM = 283; // 2 × π × 45
  const ratio  = game.initialTime > 0 ? sec / game.initialTime : 0;
  timerArc.style.strokeDashoffset = `${CIRCUM * (1 - ratio)}`;

  // Urgency colour shift
  const pct = ratio * 100;
  let color1, color2;
  if      (pct > 50) { color1 = '#5b5ef4'; color2 = '#8b5cf6'; }
  else if (pct > 25) { color1 = '#f59e0b'; color2 = '#fb923c'; }
  else               { color1 = '#ef4444'; color2 = '#f97316'; }

  $('#gradStop1').setAttribute('stop-color', color1);
  $('#gradStop2').setAttribute('stop-color', color2);
}


/* ─────────────────────────────────────────────────────────
   9.  BOARD RENDERING
   ───────────────────────────────────────────────────────── */

/** Shows the placeholder text before a game starts. */
function renderBoardEmpty() {
  boardEl.innerHTML = '<div class="board-placeholder">Press <strong>▶ Start Game</strong> to begin!</div>';
  boardTitle.textContent = 'Game Board';
}

/**
 * Renders ALL rows on the board (maxAttempts rows total).
 * - Completed rows show the submitted colours + animated peg feedback.
 * - The current active row is highlighted with a blue outline.
 * - Future rows are shown as empty grey dots.
 */
function renderBoard() {
  boardEl.innerHTML = '';
  const guessIndex = game.boardRows.length; // index of the next guess

  for (let i = 0; i < game.maxAttempts; i++) {
    const rowData  = game.boardRows[i];
    const isActive = game.started && i === guessIndex && !isGameOver();

    /* --- Row container --- */
    const row = document.createElement('div');
    row.className = 'board-row' + (isActive ? ' active-row' : '');

    /* --- Row number label --- */
    const num = document.createElement('div');
    num.className   = 'row-num';
    num.textContent = i + 1;
    row.appendChild(num);

    /* --- Colour dots (the submitted or empty guess) --- */
    const guessSlots = document.createElement('div');
    guessSlots.className = 'guess-slots';

    for (let j = 0; j < game.slots; j++) {
      const dot = document.createElement('div');
      dot.className = 'guess-dot';

      if (rowData) {
        dot.style.background  = rowData.guess[j];
        dot.style.borderColor = 'rgba(255,255,255,0.2)';

        // A11y: overlay symbol on each dot
        if (a11yMode.checked) {
          const ci  = COLOR_POOL.indexOf(rowData.guess[j]);
          const sym = document.createElement('span');
          sym.className   = 'dot-symbol';
          sym.textContent = SYMBOLS[ci] || '';
          sym.style.color = '#fff';
          dot.style.display        = 'flex';
          dot.style.alignItems     = 'center';
          dot.style.justifyContent = 'center';
          dot.appendChild(sym);
        }
      }
      guessSlots.appendChild(dot);
    }
    row.appendChild(guessSlots);

    /* --- Peg feedback --- */
    const fb = document.createElement('div');
    fb.className = 'feedback';

    if (rowData) {
      const { black, white } = rowData.feedback;
      // Black pegs first (exact match), then white pegs (colour-only match)
      for (let p = 0; p < black; p++) fb.appendChild(makePeg('black', p));
      for (let p = 0; p < white; p++) fb.appendChild(makePeg('white', black + p));
    }
    row.appendChild(fb);

    boardEl.appendChild(row);
  }

  boardTitle.textContent =
    `Board — ${game.attemptsLeft} guess${game.attemptsLeft !== 1 ? 'es' : ''} left`;
}

/**
 * Creates a single peg element.
 * The staggered entrance animation uses a setTimeout delay based on `index`
 * (index 0 = 0ms, index 1 = 90ms, index 2 = 180ms …).
 * This gives the "pegs reveal one-by-one" effect described in the PS.
 */
function makePeg(type, index) {
  const p = document.createElement('div');
  p.className = `peg ${type}`;
  setTimeout(() => p.classList.add('enter'), index * 90);
  return p;
}

/** Returns true if the game has already been won or lost. */
function isGameOver() {
  if (game.boardRows.length === 0) return false;
  const last = game.boardRows[game.boardRows.length - 1];
  return last.feedback.black === game.slots || game.attemptsLeft <= 0;
}


/* ─────────────────────────────────────────────────────────
   10. CURRENT GUESS (INTERACTIVE SLOTS)
   ───────────────────────────────────────────────────────── */

/**
 * Renders the interactive row of slots the player is currently filling.
 * Supports three input modes:
 *   "click"    – clicking a slot cycles through colours
 *   "palette"  – clicking a palette swatch fills the next empty slot
 *   "dropdown" – clicking a slot opens a mini colour-picker dropdown
 */
function renderCurrentGuess() {
  currentGuessEl.innerHTML = '';

  for (let i = 0; i < game.slots; i++) {
    const color = game.currentGuess[i];
    const slot  = document.createElement('div');
    slot.className = 'slot' + (color ? ' filled' : '');

    if (color) {
      slot.style.background  = color;
      slot.style.borderColor = 'rgba(255,255,255,0.3)';

      // A11y symbol inside the filled slot
      if (a11yMode.checked) {
        const ci  = COLOR_POOL.indexOf(color);
        const sym = document.createElement('span');
        sym.className   = 'slot-symbol';
        sym.textContent = SYMBOLS[ci] || '';
        sym.style.color = '#fff';
        sym.style.pointerEvents = 'none';
        slot.appendChild(sym);
      }

      // ✕ badge to remove a colour from this slot
      const x = document.createElement('div');
      x.className   = 'slot-x';
      x.textContent = '✕';
      x.addEventListener('click', e => {
        e.stopPropagation();
        game.currentGuess[i] = null;
        renderCurrentGuess();
        updateSubmitState();
      });
      slot.appendChild(x);
    }

    // Main click handler — behaviour depends on input mode
    slot.addEventListener('click', () => onSlotClick(i, slot));

    // In dropdown mode, build an in-slot colour picker
    if (inputModeEl.value === 'dropdown') {
      const dd = document.createElement('div');
      dd.className = 'dropdown';

      COLOR_POOL.slice(0, game.colorsCount).forEach((c, ci) => {
        const sw = document.createElement('div');
        sw.className       = 'color-swatch';
        sw.style.background = c;
        sw.style.width     = '28px';
        sw.style.height    = '28px';

        if (a11yMode.checked) {
          sw.textContent = SYMBOLS[ci];
          sw.style.cssText += ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;';
        }

        sw.addEventListener('click', e => {
          e.stopPropagation();
          game.currentGuess[i] = c;
          slot.classList.remove('dropdown-open');
          renderCurrentGuess();
          updateSubmitState();
        });
        dd.appendChild(sw);
      });

      slot.appendChild(dd);
    }

    currentGuessEl.appendChild(slot);
  }

  updateSubmitState();
}

/** Resets the current guess to all-null and re-renders. */
function resetGuessDisplay() {
  game.currentGuess = Array(game.slots).fill(null);
  renderCurrentGuess();
}

/**
 * Handles a click on one of the active guess slots.
 *
 * "click" mode:
 *   FIX — original had "const const idx" (syntax error, crashed JS).
 *   Correct logic: cycle through available colours; wrap back to null.
 *
 * "dropdown" mode:
 *   Toggle the dropdown; close any other open dropdowns first.
 *
 * "palette" mode:
 *   Slot clicks do nothing — colour assignment is handled in buildPalette().
 */
function onSlotClick(i, slotEl) {
  if (!game.started) return;

  const mode = inputModeEl.value;

  if (mode === 'click') {
    const available = COLOR_POOL.slice(0, game.colorsCount);
    const current   = game.currentGuess[i];

    if (!current) {
      // Empty slot → assign first colour
      game.currentGuess[i] = available[0];
    } else {
      // FIX: was "const const idx" — corrected to "const idx"
      const idx = available.indexOf(current);
      // Last colour (or not found) → cycle back to null (empty)
      game.currentGuess[i] =
        (idx === -1 || idx === available.length - 1) ? null : available[idx + 1];
    }

    renderCurrentGuess();
    updateSubmitState();

  } else if (mode === 'dropdown') {
    // Close all other open dropdowns
    document.querySelectorAll('.slot.dropdown-open').forEach(s => {
      if (s !== slotEl) s.classList.remove('dropdown-open');
    });
    slotEl.classList.toggle('dropdown-open');
  }
  // palette mode: handled by palette swatch click listeners in buildPalette()
}

/**
 * Enables/disables the Submit button.
 * Submit is only enabled when ALL slots in currentGuess are filled.
 */
function updateSubmitState() {
  const allFilled    = game.started && game.currentGuess.every(c => c !== null);
  submitBtn.disabled = !allFilled;
  clearBtn.disabled  = !game.started;
}


/* ─────────────────────────────────────────────────────────
   11. SUBMITTING A GUESS
   ───────────────────────────────────────────────────────── */

function onSubmitGuess() {
  if (!game.started) return;

  const guess    = [...game.currentGuess];
  const feedback = calculateFeedback(guess, game.secret);

  game.boardRows.push({ guess, feedback });
  game.attemptsLeft--;

  renderBoard();

  // WIN condition: all pegs are black
  if (feedback.black === game.slots) {
    stopTimer();
    endGame(true);
    return;
  }

  // LOSE condition: no guesses left
  if (game.attemptsLeft <= 0) {
    stopTimer();
    endGame(false, 'attempts');
    return;
  }

  // Reset for next guess
  game.currentGuess = Array(game.slots).fill(null);
  renderCurrentGuess();
  updateSubmitState();
}

function onClearGuess() {
  game.currentGuess = Array(game.slots).fill(null);
  renderCurrentGuess();
  updateSubmitState();
}


/* ─────────────────────────────────────────────────────────
   12. HINT SYSTEM
   ───────────────────────────────────────────────────────── */

/**
 * Reveals the correct colour for one randomly chosen unfilled/wrong slot.
 * Costs 50 points per use, deducted from final score.
 */
function onHint() {
  if (!game.started) return;

  // Find slots that are not yet correct
  const candidates = [];
  game.secret.forEach((c, i) => {
    if (game.currentGuess[i] !== c) candidates.push(i);
  });

  if (candidates.length === 0) {
    showToast('All slots are already correct!');
    return;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  game.currentGuess[pick] = game.secret[pick];
  game.hintsUsed++;
  game.hintPenalty += 50;

  renderCurrentGuess();
  updateSubmitState();
  showToast(`💡 Hint: slot ${pick + 1} revealed! (-50 pts)`);
}


/* ─────────────────────────────────────────────────────────
   13. FEEDBACK ALGORITHM  ← CORE LOGIC
   ───────────────────────────────────────────────────────── */

/**
 * Two-pass algorithm — correctly handles duplicate colours.
 *
 * WHY TWO PASSES?
 *   A naive single-pass approach that checks exact AND colour-present
 *   at the same time will over-count white pegs when duplicate colours exist.
 *
 *   Example: secret = [🔴, 🔵, 🔵, 🟡], guess = [🔵, 🔵, 🔵, 🔵]
 *   Correct answer: 1 black (slot 2 exact), 1 white (one extra 🔵 in secret)
 *   Naive single-pass would give: 1 black + 2 whites (wrong!)
 *
 * PASS 1 — Exact matches → Black pegs:
 *   Walk every position. If guess[i] === secret[i]:
 *     • black++
 *     • Null out both copies so they cannot be matched again in pass 2.
 *
 * PASS 2 — Colour-present matches → White pegs:
 *   Walk remaining non-null guess colours.
 *   If that colour still exists anywhere in the remaining secret:
 *     • white++
 *     • Null out that secret entry to prevent it being counted twice.
 */
function calculateFeedback(guess, secret) {
  let black = 0;
  let white = 0;

  // Work on copies so we can safely null-out consumed entries
  const secretCopy = [...secret];
  const guessCopy  = [...guess];

  /* PASS 1 — Exact position matches (black pegs) */
  for (let i = 0; i < guessCopy.length; i++) {
    if (guessCopy[i] === secretCopy[i]) {
      black++;
      secretCopy[i] = null; // consumed — cannot contribute a white peg
      guessCopy[i]  = null; // consumed
    }
  }

  /* PASS 2 — Colour-present matches on the remaining unmatched entries */
  for (let i = 0; i < guessCopy.length; i++) {
    if (guessCopy[i] !== null) {
      const j = secretCopy.indexOf(guessCopy[i]);
      if (j !== -1) {
        white++;
        secretCopy[j] = null; // consume to prevent double-counting
      }
    }
  }

  return { black, white };
}


/* ─────────────────────────────────────────────────────────
   14. SECRET CODE REVEAL
   ───────────────────────────────────────────────────────── */

/**
 * Renders the secret code row.
 * @param {boolean} reveal  false = grey placeholders; true = actual colours
 */
function renderSecretSlots(reveal) {
  secretSlots.innerHTML = '';
  const len = reveal ? game.secret.length : game.slots;

  for (let i = 0; i < len; i++) {
    const s = document.createElement('div');
    s.className = 'secret-slot';

    if (reveal && game.secret[i]) {
      s.style.background  = game.secret[i];
      s.style.borderColor = 'rgba(255,255,255,0.2)';
      s.style.transform   = 'scale(0)';
      // Staggered reveal animation reusing the pegPop keyframe
      s.style.animation   = `pegPop 0.4s ${i * 80}ms cubic-bezier(0.2,0.9,0.3,1.2) forwards`;
    }

    secretSlots.appendChild(s);
  }
}


/* ─────────────────────────────────────────────────────────
   15. END GAME
   ───────────────────────────────────────────────────────── */

/**
 * Called when the player wins or loses.
 * @param {boolean} win     true if the player cracked the code
 * @param {string}  reason  'time' | 'attempts' (only relevant when win=false)
 */
function endGame(win, reason) {
  game.started       = false;
  hintBtn.disabled   = true;
  submitBtn.disabled = true;
  clearBtn.disabled  = true;

  renderBoard();
  renderSecretSlots(true); // always reveal the secret at the end

  if (win) {
    const attemptsUsed = game.maxAttempts - game.attemptsLeft;
    const score        = computeScore(game.timeLeft, attemptsUsed, game.hintPenalty);

    launchConfetti();

    modalBody.innerHTML = `
      <h2>🎉 You Win!</h2>
      <div class="modal-score">${score}</div>
      <p>Guesses: <strong>${attemptsUsed}</strong> &nbsp;|&nbsp; Time left: <strong>${game.timeLeft}s</strong></p>
      ${game.hintsUsed > 0
        ? `<p style="color:var(--muted);font-size:0.8rem;">Hint penalty: -${game.hintPenalty} pts</p>`
        : ''}
      <p>Enter your name to save your score:</p>
      <input id="playerName" placeholder="Your name…" maxlength="20"/>
    `;

    showModal([
      {
        label: 'Save Score', primary: true,
        action: () => {
          const name = (document.getElementById('playerName').value.trim()) || 'Player';
          saveScore(name, score, game.difficulty);
          closeModal();
        },
      },
      { label: 'Play Again', action: () => { closeModal(); startGame(); } },
    ]);

  } else {
    const reasonText = reason === 'time' ? '⏱ Time is up!' : '❌ No guesses left!';
    modalBody.innerHTML = `
      <h2>${reasonText}</h2>
      <p>Better luck next time. The secret code has been revealed above.</p>
    `;
    showModal([
      { label: 'Try Again', primary: true, action: () => { closeModal(); startGame(); } },
    ]);
  }
}

/**
 * Score formula:
 *   Base = time remaining × 10  (reward for speed)
 *   Bonus = 100 − (attempts used × 5)  (reward for fewer guesses)
 *   Penalty = hint deductions
 */
function computeScore(timeLeft, attemptsUsed, penalty = 0) {
  return Math.max(0, Math.floor(timeLeft * 10 + (100 - attemptsUsed * 5) - penalty));
}


/* ─────────────────────────────────────────────────────────
   16. MODAL
   ───────────────────────────────────────────────────────── */

/**
 * Shows the win/lose modal.
 * @param {Array<{label, primary, action}>} buttons
 */
function showModal(buttons) {
  modalActions.innerHTML = '';
  buttons.forEach(b => {
    const btn       = document.createElement('button');
    btn.className   = `btn ${b.primary ? 'btn-primary' : 'btn-secondary'}`;
    btn.textContent = b.label;
    btn.onclick     = b.action;
    modalActions.appendChild(btn);
  });
  overlay.classList.remove('hidden');
}

function closeModal() { overlay.classList.add('hidden'); }

// Click the dark backdrop to dismiss the modal
overlay.addEventListener('click', e => {
  if (e.target === overlay) closeModal();
});


/* ─────────────────────────────────────────────────────────
   17. LEADERBOARD  (localStorage, per-difficulty)
   ───────────────────────────────────────────────────────── */

/**
 * Saves a score to localStorage under a difficulty-specific key.
 * FIX: original used a single 'cipher_lb' key for all difficulties.
 * Now uses 'cipher_lb_easy', 'cipher_lb_medium', 'cipher_lb_hard'.
 */
function saveScore(name, score, difficulty) {
  const key  = `cipher_lb_${difficulty}`;
  const data = JSON.parse(localStorage.getItem(key) || '[]');
  data.push({ name, score, diff: difficulty, date: new Date().toLocaleDateString() });
  data.sort((a, b) => b.score - a.score);      // highest score first
  localStorage.setItem(key, JSON.stringify(data.slice(0, 10)));  // keep top 10
  showLbTab(difficulty);                        // refresh the display
}

/**
 * Renders the leaderboard for a given difficulty tab.
 * Exposed on window so the HTML onclick attributes in the tab buttons work.
 */
window.showLbTab = function (diff) {
  lbActiveTab = diff;

  // Update tab button visual state
  ['easy', 'medium', 'hard'].forEach(d => {
    const tabId = `lbTab${d.charAt(0).toUpperCase() + d.slice(1)}`;
    const el    = document.getElementById(tabId);
    if (el) el.className = `btn ${d === diff ? 'btn-primary' : 'btn-secondary'}`;
  });

  const key  = `cipher_lb_${diff}`;
  const data = JSON.parse(localStorage.getItem(key) || '[]');
  lbList.innerHTML = '';

  if (data.length === 0) {
    lbList.innerHTML = `<li style="color:var(--muted);font-size:0.85rem;padding:8px 0;">
      No scores yet for ${diff}. Be the first!
    </li>`;
    return;
  }

  data.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'lb-item';
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    li.innerHTML = `
      <span class="lb-rank ${rankClass}">#${i + 1}</span>
      <span>${item.name}</span>
      <span class="lb-diff">${item.diff}</span>
      <span class="lb-score">${item.score}</span>
    `;
    lbList.appendChild(li);
  });
};


/* ─────────────────────────────────────────────────────────
   18. WIN CONFETTI
   ───────────────────────────────────────────────────────── */

/**
 * Spawns 50 coloured confetti pieces that fall from the top of the screen.
 * Each piece is a small <div> with a random colour, delay, and duration.
 * They self-destruct after their animation completes.
 */
function launchConfetti() {
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.left              = Math.random() * 100 + 'vw';
    c.style.top               = '0px';
    c.style.background        = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
    c.style.animationDelay    = (Math.random() * 0.8) + 's';
    c.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
    c.style.transform         = `rotate(${Math.random() * 360}deg)`;
    c.style.borderRadius      = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }
}


/* ─────────────────────────────────────────────────────────
   19. TOAST NOTIFICATION
   ───────────────────────────────────────────────────────── */

/**
 * Shows a brief bottom-centre notification that auto-dismisses.
 * Used for game start confirmation, hints, etc.
 */
function showToast(msg) {
  const t       = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}


/* ─────────────────────────────────────────────────────────
   20. KICK OFF
   ───────────────────────────────────────────────────────── */
init();
  