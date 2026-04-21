// ===== Local storage layer (replaces server.js) =====
const STORAGE_KEY = "chipTodoDb";

const MULT_BONUS = { 200: 0.1, 500: 0.3, 1000: 0.5 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let db;
  if (!raw) {
    db = {
      tasks: [],
      habits: [],
      listOrder: [],
      chipBalance: 0,
      earnings: [],
      cashouts: [],
      multiplier: { value: 1, date: todayStr() },
    };
    writeDb(db);
    return db;
  }
  db = JSON.parse(raw);
  if (!db.habits) db.habits = [];
  if (!db.listOrder) db.listOrder = [];
  if (!db.multiplier || db.multiplier.date !== todayStr()) {
    db.multiplier = { value: 1, date: todayStr() };
  }
  // Reset streaks and apply penalties for missed habits
  const yest = yesterdayStr();
  const t = todayStr();
  let changed = false;
  for (const h of db.habits) {
    if (h.lastChecked && h.lastChecked !== t && h.lastChecked !== yest && h.streak > 0) {
      h.streak = 0;
      db.chipBalance -= h.chips;
      changed = true;
    }
  }
  if (changed) writeDb(db);
  return db;
}

function writeDb(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const api = {
  getAll() {
    const db = readDb();
    return {
      tasks: db.tasks,
      habits: db.habits,
      listOrder: db.listOrder,
      chipBalance: db.chipBalance,
      multiplier: db.multiplier.value,
    };
  },
  createTask(title, chips) {
    const db = readDb();
    const task = { id: uuid(), title: title.trim().slice(0, 200), chips };
    db.tasks.push(task);
    db.listOrder.push(task.id);
    writeDb(db);
    return task;
  },
  completeTask(id) {
    const db = readDb();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const task = db.tasks.splice(idx, 1)[0];
    db.listOrder = db.listOrder.filter((x) => x !== task.id);
    const earned = Math.round(task.chips * db.multiplier.value);
    db.chipBalance += earned;
    db.multiplier.value =
      Math.round((db.multiplier.value + MULT_BONUS[task.chips]) * 10) / 10;
    db.earnings.push({ chips: earned, date: todayStr() });
    writeDb(db);
    return { task, earned, chipBalance: db.chipBalance, multiplier: db.multiplier.value };
  },
  deleteTask(id) {
    const db = readDb();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const removed = db.tasks.splice(idx, 1)[0];
    db.listOrder = db.listOrder.filter((x) => x !== removed.id);
    writeDb(db);
    return true;
  },
  updateTaskChips(id, chips) {
    const db = readDb();
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.chips = chips;
    writeDb(db);
    return task;
  },
  updateTaskTitle(id, title) {
    const db = readDb();
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.title = title.trim().slice(0, 200);
    writeDb(db);
    return task;
  },
  reorder(listOrder) {
    const db = readDb();
    db.listOrder = listOrder;
    writeDb(db);
  },
  createHabit(title, chips) {
    const db = readDb();
    const habit = {
      id: uuid(),
      title: title.trim().slice(0, 200),
      chips,
      streak: 0,
      lastChecked: null,
      createdDate: todayStr(),
    };
    db.habits.push(habit);
    db.listOrder.push(habit.id);
    writeDb(db);
    return habit;
  },
  checkHabit(id) {
    const db = readDb();
    const habit = db.habits.find((h) => h.id === id);
    if (!habit) return null;
    const t = todayStr();
    if (habit.lastChecked === t) return null;
    const yest = yesterdayStr();
    habit.streak = habit.lastChecked === yest ? habit.streak + 1 : 1;
    habit.lastChecked = t;
    const baseReward = habitReward(habit.chips, habit.streak);
    const earned = Math.round(baseReward * db.multiplier.value);
    const milestone = habit.streak === 61;
    if (earned > 0) {
      db.chipBalance += earned;
      db.multiplier.value =
        Math.round((db.multiplier.value + MULT_BONUS[habit.chips]) * 10) / 10;
      db.earnings.push({ chips: earned, date: t });
    }
    writeDb(db);
    return { habit, earned, milestone, chipBalance: db.chipBalance, multiplier: db.multiplier.value };
  },
  deleteHabit(id) {
    const db = readDb();
    const idx = db.habits.findIndex((h) => h.id === id);
    if (idx === -1) return false;
    const removed = db.habits.splice(idx, 1)[0];
    db.listOrder = db.listOrder.filter((x) => x !== removed.id);
    writeDb(db);
    return true;
  },
  updateHabitChips(id, chips) {
    const db = readDb();
    const habit = db.habits.find((h) => h.id === id);
    if (!habit) return null;
    habit.chips = chips;
    writeDb(db);
    return habit;
  },
  updateHabitTitle(id, title) {
    const db = readDb();
    const habit = db.habits.find((h) => h.id === id);
    if (!habit) return null;
    habit.title = title.trim().slice(0, 200);
    writeDb(db);
    return habit;
  },
  cashout() {
    const db = readDb();
    if (db.chipBalance === 0) return null;
    const cashout = { id: uuid(), amount: db.chipBalance, date: new Date().toISOString() };
    db.cashouts.push(cashout);
    db.chipBalance = 0;
    writeDb(db);
    return cashout;
  },
  debugAddChips() {
    const db = readDb();
    db.chipBalance += 2000;
    writeDb(db);
    return { chipBalance: db.chipBalance };
  },
};

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
const modeToggle = document.getElementById("mode-toggle");
const modeIcon = document.getElementById("mode-icon");
const undoToast = document.getElementById("undo-toast");
const undoToastMessage = document.getElementById("undo-toast-message");
const undoToastBtn = document.getElementById("undo-toast-btn");

// ===== State =====
let currentChipBalance = 0;
let currentMultiplier = 1;
let selectedChips = 200;
let isAnimating = false;
let isHabitMode = false;

// ===== Chip images map =====
const chipImages = {
  200: "assets/blue-chip.png",
  500: "assets/red-chip.png",
  1000: "assets/gold-chip.png",
};

// ===== Habit reward curve =====
const HABIT_REWARDS = {
  200:  { increment: 50,  ceiling: 200,  milestone: 1500 },
  500:  { increment: 100, ceiling: 500,  milestone: 2500 },
  1000: { increment: 150, ceiling: 1000, milestone: 5000 },
};

function habitReward(chips, streak) {
  if (streak <= 1) return 0;
  const r = HABIT_REWARDS[chips];
  if (streak === 61) return r.milestone;
  if (streak > 61) return 100;
  return Math.min(100 + (streak - 2) * r.increment, r.ceiling);
}

// ===== Chip difficulty button (cycles on click) =====
chipDifficultyBtn.addEventListener("click", () => {
  const cycle = { 200: 500, 500: 1000, 1000: 200 };
  selectedChips = cycle[selectedChips];
  chipDifficultyBtn.dataset.chips = selectedChips;
  chipDifficultyBtn.querySelector(".chip-icon").src = chipImages[selectedChips];
  playSound(sounds.buttonPressed);
});

// ===== Mode toggle (task / habit) =====
modeToggle.addEventListener("click", () => {
  isHabitMode = !isHabitMode;
  modeIcon.src = isHabitMode ? "assets/habit.png" : "assets/task.png";
  modeIcon.alt = isHabitMode ? "Habit" : "Task";
  taskInput.placeholder = isHabitMode ? "New habit..." : "New task...";
  playSound(sounds.buttonPressed);
});

// ===== Load and render =====
function loadTasks() {
  const data = api.getAll();
  currentChipBalance = data.chipBalance;
  currentMultiplier = data.multiplier;
  chipBalanceEl.textContent = currentChipBalance.toLocaleString();
  multiplierBadge.textContent = `x ${currentMultiplier.toFixed(1)}`;
  cashoutBtn.disabled = currentChipBalance === 0;
  renderList(data.tasks, data.habits, data.listOrder);
}

function renderList(tasks, habits, listOrder) {
  const taskMap = new Map(tasks.map((t) => [t.id, { ...t, _type: "task" }]));
  const habitMap = new Map(habits.map((h) => [h.id, { ...h, _type: "habit" }]));

  // Build ordered list: listOrder first, then any unordered items
  const ordered = [];
  const seen = new Set();
  for (const id of listOrder) {
    const item = taskMap.get(id) || habitMap.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }
  for (const t of tasks) {
    if (!seen.has(t.id)) ordered.push({ ...t, _type: "task" });
  }
  for (const h of habits) {
    if (!seen.has(h.id)) ordered.push({ ...h, _type: "habit" });
  }

  if (ordered.length === 0) {
    taskListEl.innerHTML =
      '<div class="empty-state">No tasks. Add one above.</div>';
    return;
  }

  taskListEl.innerHTML = "";
  const todayStrVal = todayStr();

  ordered.forEach((item) => {
    const card = document.createElement("div");
    card.dataset.id = item.id;
    card.draggable = true;

    if (item._type === "habit") {
      const checkedToday = item.lastChecked === todayStrVal;
      card.className =
        "task-card habit-card" + (checkedToday ? " checked-today" : "");

      const streakClass = item.streak > 0 ? "" : " no-streak";
      const reward = habitReward(item.chips, item.streak);
      const r = HABIT_REWARDS[item.chips];
      const ceiling = item.streak > 61 ? 100 : r.ceiling;
      const rewardLabel = item.streak <= 1 ? "0/" + r.ceiling : reward + "/" + ceiling;
      card.innerHTML = `
        <span class="drag-handle">⠿</span>
        <button class="task-chip-badge" data-chips="${item.chips}" title="Click to cycle chip value">
          <img src="${chipImages[item.chips]}" alt="${item.chips}" class="chip-icon">
        </button>
        <span class="task-title">${escapeHtml(item.title)}</span>
        <span class="habit-reward-label">${rewardLabel}</span>
        <span class="streak-badge${streakClass}">${item.streak}d</span>
        <button class="task-btn complete-btn" title="${checkedToday ? "Done today" : "Check off"}"><img src="assets/complete.png" alt="Complete" class="btn-icon"></button>
        <button class="task-btn delete-btn" title="Delete"><img src="assets/delete.png" alt="Delete" class="btn-icon"></button>
      `;

      card.querySelector(".task-chip-badge").addEventListener("click", () => {
        cycleHabitChipValue(item.id, item.chips, card);
      });

      card.querySelector(".task-title").addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startEditTitle(item, card);
      });

      if (!checkedToday) {
        card.querySelector(".complete-btn").addEventListener("click", () => {
          checkHabit(item.id, item.chips, card);
        });
      }

      card.querySelector(".delete-btn").addEventListener("click", () => {
        deleteHabit(item.id, card);
      });
    } else {
      card.className = "task-card";

      card.innerHTML = `
        <span class="drag-handle">⠿</span>
        <button class="task-chip-badge" data-chips="${item.chips}" title="Click to cycle chip value">
          <img src="${chipImages[item.chips]}" alt="${item.chips}" class="chip-icon">
        </button>
        <span class="task-title">${escapeHtml(item.title)}</span>
        <button class="task-btn complete-btn" title="Complete"><img src="assets/complete.png" alt="Complete" class="btn-icon"></button>
        <button class="task-btn delete-btn" title="Delete"><img src="assets/delete.png" alt="Delete" class="btn-icon"></button>
      `;

      card.querySelector(".task-chip-badge").addEventListener("click", () => {
        cycleChipValue(item.id, item.chips, card);
      });

      card.querySelector(".task-title").addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startEditTitle(item, card);
      });

      card.querySelector(".complete-btn").addEventListener("click", () => {
        completeTask(item.id, item.chips, card);
      });

      card.querySelector(".delete-btn").addEventListener("click", () => {
        deleteTask(item.id, card);
      });
    }

    // Drag events (shared)
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

function startEditTitle(item, card) {
  const titleEl = card.querySelector(".task-title");
  if (!titleEl || card.querySelector(".task-title-input")) return;

  const originalTitle = item.title;
  const input = document.createElement("input");
  input.type = "text";
  input.value = originalTitle;
  input.maxLength = 200;
  input.className = "task-title-input";

  titleEl.replaceWith(input);
  const wasDraggable = card.draggable;
  card.draggable = false;

  input.focus();
  input.setSelectionRange(originalTitle.length, originalTitle.length);

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;

    const trimmed = input.value.trim();
    let finalTitle = originalTitle;
    if (save && trimmed && trimmed !== originalTitle) {
      const capped = trimmed.slice(0, 200);
      if (item._type === "habit") api.updateHabitTitle(item.id, capped);
      else api.updateTaskTitle(item.id, capped);
      item.title = capped;
      finalTitle = capped;
    }

    const span = document.createElement("span");
    span.className = "task-title";
    span.textContent = finalTitle;
    span.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startEditTitle(item, card);
    });
    input.replaceWith(span);
    card.draggable = wasDraggable;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("dragstart", (e) => e.preventDefault());
}

// ===== Add task =====
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

function addTask() {
  const title = taskInput.value.trim();
  if (!title) return;

  playSound(sounds.buttonPressed);
  if (isHabitMode) api.createHabit(title, selectedChips);
  else api.createTask(title, selectedChips);

  taskInput.value = "";
  loadTasks();
  maybeSideJimbo("create");
}

// ===== Cycle chip value =====
function cycleChipValue(taskId, currentChips, card) {
  const cycle = { 200: 500, 500: 1000, 1000: 200 };
  const newChips = cycle[currentChips];

  playSound(sounds.buttonPressed);

  const updated = api.updateTaskChips(taskId, newChips);
  if (updated) {
    const badge = card.querySelector(".task-chip-badge");
    badge.dataset.chips = newChips;
    badge.innerHTML = `<img src="${chipImages[newChips]}" alt="${newChips}" class="chip-icon">`;
    badge.onclick = () => cycleChipValue(taskId, newChips, card);
  }
}

// ===== Complete task (choreographed, with undo window) =====
async function completeTask(taskId, chips, card) {
  if (isAnimating) return;
  isAnimating = true;

  // Step 1: play sound, flash card
  playSound(sounds.taskCompleted);
  card.classList.add("completing");

  await sleep(200);
  card.classList.remove("completing");
  card.classList.add("pending-action");

  showUndoToast(
    "Task completed",
    async () => {
      // Commit: run the full animation + DB write
      const chipBadge = card.querySelector(".task-chip-badge");
      const badgeRect = chipBadge.getBoundingClientRect();
      const counterRect = chipCounterBox.getBoundingClientRect();

      card.classList.remove("pending-action");
      card.classList.add("fade-out");
      await sleep(300);

      const data = api.completeTask(taskId);
      if (!data) {
        isAnimating = false;
        loadTasks();
        return;
      }

      card.remove();
      if (taskListEl.children.length === 0) {
        taskListEl.innerHTML =
          '<div class="empty-state">No tasks. Add one above.</div>';
      }

      // Fly chip from task to counter
      const flyingChip = document.createElement("img");
      flyingChip.src = chipImages[chips];
      flyingChip.className = "flying-chip";
      flyingChip.style.left = badgeRect.left + badgeRect.width / 2 - 20 + "px";
      flyingChip.style.top = badgeRect.top + badgeRect.height / 2 - 20 + "px";
      document.body.appendChild(flyingChip);

      if (chips === 200) playSound(sounds.chipsAdded200);
      else if (chips === 500) playSound(sounds.chipsAdded500);
      else if (chips === 1000) playSound(sounds.chipsAdded1000);

      await sleep(20);
      flyingChip.style.left = counterRect.left + counterRect.width / 2 - 20 + "px";
      flyingChip.style.top = counterRect.top + counterRect.height / 2 - 20 + "px";

      await sleep(600);
      flyingChip.classList.add("landed");
      flyingChip.addEventListener("transitionend", () => flyingChip.remove());

      await animateCounterUp(currentChipBalance, data.chipBalance);
      currentChipBalance = data.chipBalance;
      currentMultiplier = data.multiplier;
      cashoutBtn.disabled = currentChipBalance === 0;

      multiplierBadge.textContent = `x ${currentMultiplier.toFixed(1)}`;
      multiplierBadge.classList.remove("bump");
      void multiplierBadge.offsetWidth;
      multiplierBadge.classList.add("bump");

      isAnimating = false;
      maybeSideJimbo("complete");
    },
    () => {
      // Undo: leave the task in place, no DB change
      card.classList.remove("pending-action");
      isAnimating = false;
    },
  );
}

// ===== Delete task (with undo window) =====
async function deleteTask(taskId, card) {
  if (isAnimating) return;
  isAnimating = true;

  playSound(sounds.taskDeleted);
  card.classList.add("pending-action");

  showUndoToast(
    "Task deleted",
    async () => {
      card.classList.remove("pending-action");
      card.classList.add("fade-out");
      await sleep(300);

      if (api.deleteTask(taskId)) {
        card.remove();
        if (taskListEl.children.length === 0) {
          taskListEl.innerHTML =
            '<div class="empty-state">No tasks. Add one above.</div>';
        }
        maybeSideJimbo("delete");
      } else {
        loadTasks();
      }
      isAnimating = false;
    },
    () => {
      card.classList.remove("pending-action");
      isAnimating = false;
    },
  );
}

// ===== Habit: cycle chip value =====
function cycleHabitChipValue(habitId, currentChips, card) {
  const cycle = { 200: 500, 500: 1000, 1000: 200 };
  const newChips = cycle[currentChips];

  playSound(sounds.buttonPressed);

  const updated = api.updateHabitChips(habitId, newChips);
  if (updated) {
    const badge = card.querySelector(".task-chip-badge");
    badge.dataset.chips = newChips;
    badge.innerHTML = `<img src="${chipImages[newChips]}" alt="${newChips}" class="chip-icon">`;
    badge.onclick = () => cycleHabitChipValue(habitId, newChips, card);
  }
}

// ===== Habit: daily check-off (with undo window) =====
async function checkHabit(habitId, chips, card) {
  if (isAnimating) return;
  isAnimating = true;

  playSound(sounds.taskCompleted);
  card.classList.add("completing");

  await sleep(200);
  card.classList.remove("completing");
  card.classList.add("pending-action");

  showUndoToast(
    "Habit checked",
    async () => {
      const chipBadge = card.querySelector(".task-chip-badge");
      const badgeRect = chipBadge.getBoundingClientRect();
      const counterRect = chipCounterBox.getBoundingClientRect();

      card.classList.remove("pending-action");

      const data = api.checkHabit(habitId);
      if (!data) {
        isAnimating = false;
        loadTasks();
        return;
      }

      card.classList.add("checked-today");
      const completeBtn = card.querySelector(".complete-btn");
      completeBtn.style.opacity = "0.3";
      completeBtn.style.pointerEvents = "none";

      const streakBadge = card.querySelector(".streak-badge");
      streakBadge.textContent = `${data.habit.streak}d`;
      streakBadge.classList.remove("no-streak");

      if (data.earned === 0 && data.habit.streak <= 1) {
        showSideJimbo(
          "No chips on day one, pal. Gotta prove you can stick with it first.",
        );
      } else if (data.milestone) {
        showSideJimbo(
          "60 days! That's a real habit now. Here's a fat bonus — you earned it. From here on, it's just maintenance chips.",
        );
      } else if (data.habit.streak > 61) {
        showSideJimbo(
          "Habit's locked in. Base chips only now — go chase something new.",
        );
      }

      if (data.earned > 0) {
        const flyingChip = document.createElement("img");
        flyingChip.src = chipImages[chips];
        flyingChip.className = "flying-chip";
        flyingChip.style.left = badgeRect.left + badgeRect.width / 2 - 20 + "px";
        flyingChip.style.top = badgeRect.top + badgeRect.height / 2 - 20 + "px";
        document.body.appendChild(flyingChip);

        if (chips === 200) playSound(sounds.chipsAdded200);
        else if (chips === 500) playSound(sounds.chipsAdded500);
        else if (chips === 1000) playSound(sounds.chipsAdded1000);

        await sleep(20);
        flyingChip.style.left =
          counterRect.left + counterRect.width / 2 - 20 + "px";
        flyingChip.style.top = counterRect.top + counterRect.height / 2 - 20 + "px";

        await sleep(600);
        flyingChip.classList.add("landed");
        flyingChip.addEventListener("transitionend", () => flyingChip.remove());

        await animateCounterUp(currentChipBalance, data.chipBalance);
        currentChipBalance = data.chipBalance;
        currentMultiplier = data.multiplier;
        cashoutBtn.disabled = currentChipBalance === 0;

        multiplierBadge.textContent = `x ${currentMultiplier.toFixed(1)}`;
        multiplierBadge.classList.remove("bump");
        void multiplierBadge.offsetWidth;
        multiplierBadge.classList.add("bump");
      }

      isAnimating = false;
      maybeSideJimbo("complete");
    },
    () => {
      card.classList.remove("pending-action");
      isAnimating = false;
    },
  );
}

// ===== Habit: delete (with undo window) =====
async function deleteHabit(habitId, card) {
  if (isAnimating) return;
  isAnimating = true;

  playSound(sounds.taskDeleted);
  card.classList.add("pending-action");

  showUndoToast(
    "Habit deleted",
    async () => {
      card.classList.remove("pending-action");
      card.classList.add("fade-out");
      await sleep(300);

      if (api.deleteHabit(habitId)) {
        card.remove();
        if (taskListEl.children.length === 0) {
          taskListEl.innerHTML =
            '<div class="empty-state">No tasks. Add one above.</div>';
        }
        maybeSideJimbo("delete");
      } else {
        loadTasks();
      }
      isAnimating = false;
    },
    () => {
      card.classList.remove("pending-action");
      isAnimating = false;
    },
  );
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

  const cashoutRecord = api.cashout();
  if (!cashoutRecord) {
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
  const listOrder = [...taskListEl.querySelectorAll(".task-card")].map(
    (c) => c.dataset.id,
  );
  api.reorder(listOrder);
}

// ===== Utility =====
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== Undo toast =====
const UNDO_WINDOW_MS = 3000;
let pendingTimer = null;
let pendingCommit = null;
let pendingRestore = null;
let hideToastTimer = null;

function showUndoToast(message, commitFn, restoreFn) {
  undoToastMessage.textContent = message;
  clearTimeout(hideToastTimer);
  undoToast.classList.remove("hidden");
  void undoToast.offsetWidth;
  undoToast.classList.add("visible");

  pendingCommit = commitFn;
  pendingRestore = restoreFn;

  pendingTimer = setTimeout(() => {
    const fn = pendingCommit;
    pendingTimer = null;
    pendingCommit = null;
    pendingRestore = null;
    hideUndoToast();
    if (fn) fn();
  }, UNDO_WINDOW_MS);
}

function hideUndoToast() {
  undoToast.classList.remove("visible");
  hideToastTimer = setTimeout(() => {
    undoToast.classList.add("hidden");
  }, 350);
}

undoToastBtn.addEventListener("click", () => {
  if (!pendingTimer) return;
  clearTimeout(pendingTimer);
  const fn = pendingRestore;
  pendingTimer = null;
  pendingCommit = null;
  pendingRestore = null;
  hideUndoToast();
  if (fn) fn();
});

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

  // Return a promise that resolves when Jimbo is fully dismissed
  return new Promise((resolve) => {
    sideJimboDismissResolve = resolve;
  });
}

let sideJimboDismissResolve = null;

function dismissSideJimbo() {
  clearTimeout(sideJimboDismissTimer);
  jimboSide.classList.remove("visible");
  setTimeout(() => {
    jimboSide.classList.add("hidden");
    sideJimboActive = false;
    if (sideJimboDismissResolve) {
      sideJimboDismissResolve();
      sideJimboDismissResolve = null;
    }
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
document.getElementById("debug-btn").addEventListener("click", () => {
  const data = api.debugAddChips();
  currentChipBalance = data.chipBalance;
  chipBalanceEl.textContent = currentChipBalance.toLocaleString();
  cashoutBtn.disabled = false;
  playSound(sounds.buttonPressed);
});

// ===== Debug: Toggle Jimbo 100% =====
const debugJimboBtn = document.getElementById("debug-jimbo-btn");
debugJimboBtn.addEventListener("click", () => {
  sideJimboAlways = !sideJimboAlways;
  debugJimboBtn.classList.toggle("active", sideJimboAlways);
  playSound(sounds.buttonPressed);
});

// ===== Task help button =====
document
  .getElementById("task-help-btn")
  .addEventListener("click", async () => {
    playSound(sounds.buttonPressed);
    await showSideJimbo(
      "Create tasks, assign them a chip value — blue is easy, red is medium, gold is hard. " +
        "Complete a task and the chips are yours.",
    );
    await sleep(1000);
    await showSideJimbo(
      "Every task you finish today bumps your multiplier. " +
        "Easy gives +0.1, medium +0.3, hard +0.5. " +
        "Multiplier resets at midnight, so stack 'em up while you can.",
    );
    await sleep(1000);
    await showSideJimbo(
      "When you're ready, hit Cash Out to bank your chips. " +
        "That's when I show up with something to say. Don't keep me waiting.",
    );
  });

// ===== Habit help button =====
document
  .getElementById("habit-help-btn")
  .addEventListener("click", async () => {
    playSound(sounds.buttonPressed);
    await showSideJimbo(
      "Habits start at 100 chips and grow each day you keep the streak. " +
        "Easy habits grow slow, hard ones grow fast — but all cap at their chip tier. " +
        "Hit 60 days and you get a fat milestone bonus. " +
        "After that, the habit's integrated — just base chips from there. " +
        "Miss a day? Streak resets and you lose chips. Don't miss a day.",
    );
    await sleep(1000);
    await showSideJimbo(
      "Oh, and habits increase your multiplier, but are not affected by it! " +
        "So it's a solid strategy to get them out of your way first to get that mult for the rest of the day!",
    );
  });

// ===== Init =====
loadTasks();
