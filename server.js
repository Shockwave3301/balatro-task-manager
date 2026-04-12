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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { tasks: [], chipBalance: 0, earnings: [], cashouts: [], multiplier: { value: 1, date: today() } };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  // Ensure multiplier exists and reset if stale
  if (!db.multiplier || db.multiplier.date !== today()) {
    db.multiplier = { value: 1, date: today() };
  }
  return db;
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// GET /api/tasks — returns { tasks, chipBalance, multiplier }
app.get('/api/tasks', (req, res) => {
  const db = readDb();
  res.json({ tasks: db.tasks, chipBalance: db.chipBalance, multiplier: db.multiplier.value });
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

  db.tasks.splice(idx, 1);
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

// PUT /api/tasks/reorder — reorder tasks
app.put('/api/tasks/reorder', (req, res) => {
  const { taskIds } = req.body;
  if (!Array.isArray(taskIds)) {
    return res.status(400).json({ error: 'taskIds must be an array' });
  }

  const db = readDb();
  const taskMap = new Map(db.tasks.map(t => [t.id, t]));
  const reordered = [];
  for (const id of taskIds) {
    const task = taskMap.get(id);
    if (task) reordered.push(task);
  }
  db.tasks = reordered;
  writeDb(db);
  res.json({ tasks: db.tasks });
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
