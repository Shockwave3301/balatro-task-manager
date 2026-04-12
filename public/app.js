// ===== Sound preloading =====
const sounds = {
  taskCompleted: new Audio("sounds/task-completed.ogg"),
  taskDeleted: new Audio("sounds/task-deleted.ogg"),
  chipsAdded200: new Audio("sounds/200-chips-added.ogg"),
  chipsAdded500: new Audio("sounds/500-chips-added.ogg"),
  chipsAdded1000: new Audio("sounds/1000-chips-added.ogg"),
  buttonPressed: new Audio("sounds/button-pressed.ogg"),
  taskDragged: new Audio("sounds/task-dragged.ogg"),
  taskDropped: new Audio("sounds/task-dropped.ogg"),
  cashoutCompleted: new Audio("sounds/cashout-completed.ogg"),
};

function playSound(sound) {
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// ===== DOM refs =====
const chipBalanceEl = document.getElementById("chip-balance");
const chipCounterBox = document.getElementById("chip-counter-box");
const cashoutBtn = document.getElementById("cashout-btn");
const taskInput = document.getElementById("task-input");
const taskListEl = document.getElementById("task-list");
const chipDifficultyBtn = document.getElementById("chip-difficulty-btn");
const multiplierBadge = document.getElementById("multiplier-badge");

// ===== State =====
let currentChipBalance = 0;
let currentMultiplier = 1;
let selectedChips = 200;
let isAnimating = false;

// ===== Chip images map =====
const chipImages = {
  200: "assets/blue-chip.png",
  500: "assets/red-chip.png",
  1000: "assets/gold-chip.png",
};

// ===== Chip difficulty button (cycles on click) =====
chipDifficultyBtn.addEventListener("click", () => {
  const cycle = { 200: 500, 500: 1000, 1000: 200 };
  selectedChips = cycle[selectedChips];
  chipDifficultyBtn.dataset.chips = selectedChips;
  chipDifficultyBtn.querySelector(".chip-icon").src = chipImages[selectedChips];
  playSound(sounds.buttonPressed);
});

// ===== Fetch and render =====
async function loadTasks() {
  const res = await fetch("/api/tasks");
  const data = await res.json();
  currentChipBalance = data.chipBalance;
  currentMultiplier = data.multiplier;
  chipBalanceEl.textContent = currentChipBalance.toLocaleString();
  multiplierBadge.textContent = `x ${currentMultiplier.toFixed(1)}`;
  cashoutBtn.disabled = currentChipBalance === 0;
  renderTasks(data.tasks);
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    taskListEl.innerHTML =
      '<div class="empty-state">No tasks. Add one above.</div>';
    return;
  }

  taskListEl.innerHTML = "";
  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.id = task.id;
    card.draggable = true;

    card.innerHTML = `
      <span class="drag-handle">⠿</span>
      <button class="task-chip-badge" data-chips="${task.chips}" title="Click to cycle chip value">
        <img src="${chipImages[task.chips]}" alt="${task.chips}" class="chip-icon">
      </button>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <button class="task-btn complete-btn" title="Complete"><img src="assets/complete.png" alt="Complete" class="btn-icon"></button>
      <button class="task-btn delete-btn" title="Delete"><img src="assets/delete.png" alt="Delete" class="btn-icon"></button>
    `;

    // Chip badge cycling
    card.querySelector(".task-chip-badge").addEventListener("click", () => {
      cycleChipValue(task.id, task.chips, card);
    });

    // Complete
    card.querySelector(".complete-btn").addEventListener("click", () => {
      completeTask(task.id, task.chips, card);
    });

    // Delete
    card.querySelector(".delete-btn").addEventListener("click", () => {
      deleteTask(task.id, card);
    });

    // Drag events
    card.addEventListener("dragstart", onDragStart);
    card.addEventListener("dragend", onDragEnd);
    card.addEventListener("dragover", onDragOver);
    card.addEventListener("dragenter", onDragEnter);
    card.addEventListener("dragleave", onDragLeave);
    card.addEventListener("drop", onDrop);

    taskListEl.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== Add task =====
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

async function addTask() {
  const title = taskInput.value.trim();
  if (!title) return;

  playSound(sounds.buttonPressed);
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, chips: selectedChips }),
  });

  if (res.ok) {
    taskInput.value = "";
    loadTasks();
    maybeSideJimbo("create");
  }
}

// ===== Cycle chip value =====
async function cycleChipValue(taskId, currentChips, card) {
  const cycle = { 200: 500, 500: 1000, 1000: 200 };
  const newChips = cycle[currentChips];

  playSound(sounds.buttonPressed);

  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chips: newChips }),
  });

  if (res.ok) {
    const badge = card.querySelector(".task-chip-badge");
    badge.dataset.chips = newChips;
    badge.innerHTML = `<img src="${chipImages[newChips]}" alt="${newChips}" class="chip-icon">`;
    // Update the click handler with new chip value
    badge.onclick = () => cycleChipValue(taskId, newChips, card);
  }
}

// ===== Complete task (choreographed) =====
async function completeTask(taskId, chips, card) {
  if (isAnimating) return;
  isAnimating = true;

  // Capture positions before any DOM changes
  const chipBadge = card.querySelector(".task-chip-badge");
  const badgeRect = chipBadge.getBoundingClientRect();
  const counterRect = chipCounterBox.getBoundingClientRect();

  // Step 1: play sound, flash card
  playSound(sounds.taskCompleted);
  card.classList.add("completing");

  await sleep(200);
  card.classList.remove("completing");
  card.classList.add("fade-out");

  await sleep(300);

  // Step 2: Call API
  const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
  if (!res.ok) {
    isAnimating = false;
    loadTasks();
    return;
  }

  const data = await res.json();
  card.remove();

  // Show empty state if no tasks left
  if (taskListEl.children.length === 0) {
    taskListEl.innerHTML =
      '<div class="empty-state">No tasks. Add one above.</div>';
  }

  // Step 3: Fly chip from task to counter
  const flyingChip = document.createElement("img");
  flyingChip.src = chipImages[chips];
  flyingChip.className = "flying-chip";
  flyingChip.style.left = badgeRect.left + badgeRect.width / 2 - 20 + "px";
  flyingChip.style.top = badgeRect.top + badgeRect.height / 2 - 20 + "px";
  document.body.appendChild(flyingChip);

  // Play chip sound at launch
  if (chips === 200) playSound(sounds.chipsAdded200);
  else if (chips === 500) playSound(sounds.chipsAdded500);
  else if (chips === 1000) playSound(sounds.chipsAdded1000);

  // Trigger fly to counter center
  await sleep(20);
  flyingChip.style.left = counterRect.left + counterRect.width / 2 - 20 + "px";
  flyingChip.style.top = counterRect.top + counterRect.height / 2 - 20 + "px";

  await sleep(600);
  flyingChip.classList.add("landed");
  flyingChip.addEventListener("transitionend", () => flyingChip.remove());

  // Step 4: Animate counter up and update multiplier
  await animateCounterUp(currentChipBalance, data.chipBalance);
  currentChipBalance = data.chipBalance;
  currentMultiplier = data.multiplier;
  cashoutBtn.disabled = currentChipBalance === 0;

  // Bump multiplier display
  multiplierBadge.textContent = `x ${currentMultiplier.toFixed(1)}`;
  multiplierBadge.classList.remove("bump");
  void multiplierBadge.offsetWidth;
  multiplierBadge.classList.add("bump");

  isAnimating = false;
  maybeSideJimbo("complete");
}

// ===== Delete task =====
async function deleteTask(taskId, card) {
  if (isAnimating) return;

  playSound(sounds.taskDeleted);
  card.classList.add("fade-out");

  await sleep(300);

  const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (res.ok) {
    card.remove();
    if (taskListEl.children.length === 0) {
      taskListEl.innerHTML =
        '<div class="empty-state">No tasks. Add one above.</div>';
    }
    maybeSideJimbo("delete");
  } else {
    loadTasks();
  }
}

// ===== Animate counter up =====
function animateCounterUp(from, to) {
  return new Promise((resolve) => {
    const duration = 500;
    const start = performance.now();

    chipCounterBox.classList.add("shake-light");
    setTimeout(() => chipCounterBox.classList.remove("shake-light"), 300);

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(from + (to - from) * eased);
      chipBalanceEl.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        chipBalanceEl.textContent = to.toLocaleString();
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

// ===== Cashout =====
cashoutBtn.addEventListener("click", async () => {
  if (isAnimating || currentChipBalance === 0) return;

  if (!confirm(`Cash out ${currentChipBalance.toLocaleString()} chips?`))
    return;

  isAnimating = true;
  document.body.classList.add("locked");

  const res = await fetch("/api/cashout", { method: "POST" });
  if (!res.ok) {
    isAnimating = false;
    document.body.classList.remove("locked");
    return;
  }

  // Drain animation
  const balance = currentChipBalance;
  const increment = balance >= 10000 ? 1000 : 500;
  let remaining = balance;
  let tickCount = 0;

  while (remaining > 0) {
    const subtract = Math.min(increment, remaining);
    remaining -= subtract;
    tickCount++;

    // Animate counter down
    await animateCounterTick(remaining, 100);

    // Shake
    chipCounterBox.classList.remove("shake-strong");
    void chipCounterBox.offsetWidth; // force reflow to restart animation
    chipCounterBox.classList.add("shake-strong");

    // Alternating sounds
    if (tickCount % 2 === 1) playSound(sounds.chipsAdded200);
    else playSound(sounds.chipsAdded500);

    await sleep(200);
  }

  // Final: gold flash + cashout sound
  chipCounterBox.classList.remove("shake-strong");
  chipCounterBox.classList.add("gold-flash");
  playSound(sounds.cashoutCompleted);

  setTimeout(() => chipCounterBox.classList.remove("gold-flash"), 600);

  currentChipBalance = 0;
  cashoutBtn.disabled = true;
  isAnimating = false;
  document.body.classList.remove("locked");

  await sleep(2500);
  await showJimbo(balance);
});

function animateCounterTick(target, duration) {
  return new Promise((resolve) => {
    const from = parseInt(chipBalanceEl.textContent.replace(/,/g, ""));
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(from + (target - from) * progress);
      chipBalanceEl.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        chipBalanceEl.textContent = target.toLocaleString();
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

// ===== Drag and Drop =====
let draggedCard = null;

function onDragStart(e) {
  if (isAnimating) {
    e.preventDefault();
    return;
  }
  draggedCard = this;
  this.classList.add("dragging");
  playSound(sounds.taskDragged);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.id);
}

function onDragEnd() {
  this.classList.remove("dragging");
  document
    .querySelectorAll(".task-card.drag-over")
    .forEach((c) => c.classList.remove("drag-over"));
  draggedCard = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onDragEnter(e) {
  e.preventDefault();
  if (this !== draggedCard) {
    this.classList.add("drag-over");
  }
}

function onDragLeave() {
  this.classList.remove("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");

  if (!draggedCard || this === draggedCard) return;

  playSound(sounds.taskDropped);

  // Reorder in DOM
  const allCards = [...taskListEl.querySelectorAll(".task-card")];
  const draggedIdx = allCards.indexOf(draggedCard);
  const droppedIdx = allCards.indexOf(this);

  if (draggedIdx < droppedIdx) {
    taskListEl.insertBefore(draggedCard, this.nextSibling);
  } else {
    taskListEl.insertBefore(draggedCard, this);
  }

  // Persist new order
  const taskIds = [...taskListEl.querySelectorAll(".task-card")].map(
    (c) => c.dataset.id,
  );
  fetch("/api/tasks/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskIds }),
  });
}

// ===== Utility =====
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== Jimbo =====
const voiceSounds = [];
for (const i of [1, 2, 3, 4, 5, 6, 8, 10, 11]) {
  voiceSounds.push(new Audio(`sounds/voice${i}.ogg`));
}

const jimboOverlay = document.getElementById("jimbo-overlay");
const jimboDialogue = document.getElementById("jimbo-dialogue");
const jimboImg = document.getElementById("jimbo-img");

const jimboLines = {
  low: [
    "Wow, pocket change. Don't spend it all in one place.",
    "A real high-roller, huh? Shameful.",
    "Really? That's it? What you've been doing all month, jerking off?",
  ],
  mid: [
    "Not bad, not bad.",
    "Decent haul. Try not to let it go to your head.",
    "Look at you, moving up in the world. Adorable.",
    "Alright, I'll admit it — that's almost impressive.",
  ],
  high: [
    "Well well well, big spender over here!",
    "Now THAT'S a cashout. I'm almost proud of you.",
    "Good thing I didn't bet against you!",
  ],
};

function getJimboLine(amount) {
  let pool;
  if (amount < 10000) pool = jimboLines.low;
  else if (amount < 20000) pool = jimboLines.mid;
  else pool = jimboLines.high;
  return pool[Math.floor(Math.random() * pool.length)];
}

let shuffledVoices = [];
let voiceIndex = 0;

function shuffleVoices() {
  shuffledVoices = [...voiceSounds];
  for (let i = shuffledVoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledVoices[i], shuffledVoices[j]] = [
      shuffledVoices[j],
      shuffledVoices[i],
    ];
  }
  voiceIndex = 0;
}

function playNextVoice() {
  if (voiceIndex >= shuffledVoices.length) shuffleVoices();
  const voice = shuffledVoices[voiceIndex++];
  voice.currentTime = 0;
  voice.play().catch(() => {});
}

async function showJimbo(amount) {
  const line = `${amount.toLocaleString()} chips cashed!\n${getJimboLine(amount)}`;
  jimboDialogue.textContent = "";
  shuffleVoices();
  jimboOverlay.classList.remove("hidden");

  // Type out the text character by character with voice
  for (let i = 0; i < line.length; i++) {
    jimboDialogue.textContent = line.slice(0, i + 1);

    if (line[i] !== " " && line[i] !== "\n" && i % 3 === 0) {
      playNextVoice();
      jimboImg.classList.remove("talking");
      void jimboImg.offsetWidth;
      jimboImg.classList.add("talking");
    }

    await sleep(30);
  }

  jimboImg.classList.remove("talking");
}

jimboOverlay.addEventListener("click", () => {
  jimboOverlay.classList.add("hidden");
});

// ===== Side Jimbo (random appearances) =====
const jimboSide = document.getElementById("jimbo-side");
const jimboSideBubble = document.getElementById("jimbo-side-bubble");
const jimboSideImg = document.getElementById("jimbo-side-img");
let sideJimboActive = false;
let sideJimboAlways = false;
let sideJimboDismissTimer = null;

const sideJimboLines = {
  create: [
    "Another one? You sure about that?",
    "Ooh, ambitious today, are we?",
    "That's the spirit. Probably.",
    "Write it down, pretend you'll do it.",
    "Sure, add more. That always helps.",
    "A new task! How... optimistic.",
  ],
  complete: [
    "Finally! I was starting to worry.",
    "Look at you, being all productive.",
    "One down, a million to go.",
    "Don't get cocky now.",
    "Impressive. For you.",
    "I mean, it's not nothing.",
  ],
  delete: [
    "Giving up already? Classic.",
    "Poof. Like it never existed.",
    "That's one way to get things done.",
    "Can't fail if you delete it first!",
    "Running from your problems, I see.",
    "Smart. Fewer tasks, fewer failures.",
  ],
};

function maybeSideJimbo(action) {
  if (sideJimboActive) return;
  if (!sideJimboAlways && Math.random() > 0.3) return; // ~30% chance

  const pool = sideJimboLines[action];
  const line = pool[Math.floor(Math.random() * pool.length)];
  showSideJimbo(line);
}

async function showSideJimbo(line) {
  sideJimboActive = true;
  jimboSideBubble.textContent = "";
  jimboSide.classList.remove("hidden");

  // Small delay to let the CSS transition trigger
  await sleep(20);
  jimboSide.classList.add("visible");
  await sleep(400);

  shuffleVoices();

  // Type out
  for (let i = 0; i < line.length; i++) {
    jimboSideBubble.textContent = line.slice(0, i + 1);

    if (line[i] !== " " && i % 3 === 0) {
      playNextVoice();
      jimboSideImg.classList.remove("talking");
      void jimboSideImg.offsetWidth;
      jimboSideImg.classList.add("talking");
    }

    await sleep(30);
  }

  jimboSideImg.classList.remove("talking");

  // Auto-dismiss after 3 seconds
  sideJimboDismissTimer = setTimeout(dismissSideJimbo, 3000);
}

function dismissSideJimbo() {
  clearTimeout(sideJimboDismissTimer);
  jimboSide.classList.remove("visible");
  setTimeout(() => {
    jimboSide.classList.add("hidden");
    sideJimboActive = false;
  }, 400);
}

jimboSide.addEventListener("click", dismissSideJimbo);

// ===== Background Music =====
const music = new Audio("assets/song.mp3");
music.loop = true;
const musicBtn = document.getElementById("music-btn");

musicBtn.addEventListener("click", () => {
  if (music.paused) {
    music.play();
    musicBtn.innerHTML = "&#9646;&#9646;";
    musicBtn.classList.add("playing");
  } else {
    music.pause();
    musicBtn.innerHTML = "&#9654;";
    musicBtn.classList.remove("playing");
  }
});

// ===== Debug: Add chips =====
document.getElementById("debug-btn").addEventListener("click", async () => {
  const res = await fetch("/api/debug/add-chips", { method: "POST" });
  if (res.ok) {
    const data = await res.json();
    currentChipBalance = data.chipBalance;
    chipBalanceEl.textContent = currentChipBalance.toLocaleString();
    cashoutBtn.disabled = false;
    playSound(sounds.buttonPressed);
  }
});

// ===== Debug: Toggle Jimbo 100% =====
const debugJimboBtn = document.getElementById("debug-jimbo-btn");
debugJimboBtn.addEventListener("click", () => {
  sideJimboAlways = !sideJimboAlways;
  debugJimboBtn.classList.toggle("active", sideJimboAlways);
  playSound(sounds.buttonPressed);
});

// ===== Init =====
loadTasks();
