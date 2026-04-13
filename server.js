const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
express.static.mime.define({ 'video/webm': ['webm'] });
app.use(express.static(path.join(__dirname, 'public')));

const MULT_BONUS = { 200: 0.1, 500: 0.3, 1000: 0.5 };

const HABIT_REWARDS = {
  200:  { increment: 50,  ceiling: 200,  milestone: 1500 },
  500:  { increment: 100, ceiling: 500,  milestone: 2500 },
  1000: { increment: 150, ceiling: 1000, milestone: 5000 },
};

function habitReward(chips, streak) {
  if (streak <= 1) return 0; // creation day
  const r = HABIT_REWARDS[chips];
  if (streak === 61) return r.milestone; // day-60 milestone bonus
  if (streak > 61) return 100; // integrated — base only
  return Math.min(100 + (streak - 2) * r.increment, r.ceiling);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { tasks: [], habits: [], listOrder: [], chipBalance: 0, earnings: [], cashouts: [], multiplier: { value: 1, date: today() } };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!db.habits) db.habits = [];
  if (!db.listOrder) db.listOrder = [];
  // Ensure multiplier exists and reset if stale
  if (!db.multiplier || db.multiplier.date !== today()) {
    db.multiplier = { value: 1, date: today() };
  }
  // Reset streaks and apply penalties for missed habits
  const yest = yesterday();
  let changed = false;
  for (const h of db.habits) {
    if (h.lastChecked && h.lastChecked !== today() && h.lastChecked !== yest && h.streak > 0) {
      h.streak = 0;
      db.chipBalance -= h.chips;
      changed = true;
    }
  }
  if (changed) writeDb(db);
  return db;
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// GET /api/tasks — returns { tasks, habits, listOrder, chipBalance, multiplier }
app.get('/api/tasks', (req, res) => {
  const db = readDb();
  res.json({ tasks: db.tasks, habits: db.habits, listOrder: db.listOrder, chipBalance: db.chipBalance, multiplier: db.multiplier.value });
});

// POST /api/tasks — create a new task
app.post('/api/tasks', (req, res) => {
  const { title, chips } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (![200, 500, 1000].includes(chips)) {
    return res.status(400).json({ error: 'Chips must be 200, 500, or 1000' });
  }

  const trimmed = title.trim().slice(0, 200);
  const db = readDb();
  const task = { id: crypto.randomUUID(), title: trimmed, chips };
  db.tasks.push(task);
  db.listOrder.push(task.id);
  writeDb(db);
  res.status(201).json(task);
});

// POST /api/tasks/:id/complete — complete a task
app.post('/api/tasks/:id/complete', (req, res) => {
  const db = readDb();
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = db.tasks.splice(idx, 1)[0];
  db.listOrder = db.listOrder.filter(id => id !== task.id);
  const earned = Math.round(task.chips * db.multiplier.value);
  db.chipBalance += earned;
  db.multiplier.value = Math.round((db.multiplier.value + MULT_BONUS[task.chips]) * 10) / 10;
  db.earnings.push({ chips: earned, date: today() });
  writeDb(db);
  res.json({ task, earned, chipBalance: db.chipBalance, multiplier: db.multiplier.value });
});

// DELETE /api/tasks/:id — delete a task (no chip change)
app.delete('/api/tasks/:id', (req, res) => {
  const db = readDb();
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const removed = db.tasks.splice(idx, 1)[0];
  db.listOrder = db.listOrder.filter(id => id !== removed.id);
  writeDb(db);
  res.json({ success: true });
});

// PATCH /api/tasks/:id — update chip value
app.patch('/api/tasks/:id', (req, res) => {
  const { chips } = req.body;
  if (![200, 500, 1000].includes(chips)) {
    return res.status(400).json({ error: 'Chips must be 200, 500, or 1000' });
  }

  const db = readDb();
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  task.chips = chips;
  writeDb(db);
  res.json(task);
});

// PUT /api/tasks/reorder — reorder list (tasks + habits)
app.put('/api/tasks/reorder', (req, res) => {
  const { listOrder } = req.body;
  if (!Array.isArray(listOrder)) {
    return res.status(400).json({ error: 'listOrder must be an array' });
  }

  const db = readDb();
  db.listOrder = listOrder;
  writeDb(db);
  res.json({ listOrder: db.listOrder });
});

// POST /api/habits — create a new habit
app.post('/api/habits', (req, res) => {
  const { title, chips } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (![200, 500, 1000].includes(chips)) {
    return res.status(400).json({ error: 'Chips must be 200, 500, or 1000' });
  }

  const trimmed = title.trim().slice(0, 200);
  const db = readDb();
  const habit = { id: crypto.randomUUID(), title: trimmed, chips, streak: 0, lastChecked: null, createdDate: today() };
  db.habits.push(habit);
  db.listOrder.push(habit.id);
  writeDb(db);
  res.status(201).json(habit);
});

// POST /api/habits/:id/check — daily check-off
app.post('/api/habits/:id/check', (req, res) => {
  const db = readDb();
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) {
    return res.status(404).json({ error: 'Habit not found' });
  }

  const t = today();
  if (habit.lastChecked === t) {
    return res.status(400).json({ error: 'Already checked today' });
  }

  const yest = yesterday();
  if (habit.lastChecked === yest) {
    habit.streak += 1;
  } else {
    habit.streak = 1;
  }
  habit.lastChecked = t;

  const baseReward = habitReward(habit.chips, habit.streak);
  const earned = Math.round(baseReward * db.multiplier.value);
  const milestone = habit.streak === 61;
  if (earned > 0) {
    db.chipBalance += earned;
    db.multiplier.value = Math.round((db.multiplier.value + MULT_BONUS[habit.chips]) * 10) / 10;
    db.earnings.push({ chips: earned, date: t });
  }
  writeDb(db);
  res.json({ habit, earned, milestone, chipBalance: db.chipBalance, multiplier: db.multiplier.value });
});

// DELETE /api/habits/:id — delete a habit
app.delete('/api/habits/:id', (req, res) => {
  const db = readDb();
  const idx = db.habits.findIndex(h => h.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Habit not found' });
  }

  const removed = db.habits.splice(idx, 1)[0];
  db.listOrder = db.listOrder.filter(id => id !== removed.id);
  writeDb(db);
  res.json({ success: true });
});

// PATCH /api/habits/:id — update chip value
app.patch('/api/habits/:id', (req, res) => {
  const { chips } = req.body;
  if (![200, 500, 1000].includes(chips)) {
    return res.status(400).json({ error: 'Chips must be 200, 500, or 1000' });
  }

  const db = readDb();
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) {
    return res.status(404).json({ error: 'Habit not found' });
  }

  habit.chips = chips;
  writeDb(db);
  res.json(habit);
});

// POST /api/debug/add-chips — add chips directly (debug)
app.post('/api/debug/add-chips', (req, res) => {
  const db = readDb();
  db.chipBalance += 2000;
  writeDb(db);
  res.json({ chipBalance: db.chipBalance });
});

// POST /api/cashout — cashout all chips
app.post('/api/cashout', (req, res) => {
  const db = readDb();
  if (db.chipBalance === 0) {
    return res.status(400).json({ error: 'Nothing to cash out' });
  }

  const cashout = {
    id: crypto.randomUUID(),
    amount: db.chipBalance,
    date: new Date().toISOString()
  };
  db.cashouts.push(cashout);
  db.chipBalance = 0;
  writeDb(db);
  res.json(cashout);
});

app.listen(PORT, () => {
  console.log(`Chip Todo running at http://localhost:${PORT}`);
});
