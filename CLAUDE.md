# Chip Todo — Project Spec

A local-only todo app with a casino/Balatro-inspired aesthetic. Tasks have chip values. Completing tasks accumulates chips. Chips can be cashed out by pressing a cashout button.

## Tech Stack

- **Backend**: Single Node.js file (`server.js`) using Express. Serves static files from `public/`. Reads/writes `db.json` as the sole data store.
- **Frontend**: Vanilla HTML/CSS/JS. No frameworks, no build step. All files in `public/`.
- **No external dependencies** beyond Express. No databases, no ORMs, no bundlers.

## Data Model (`db.json`)

```json
{
  "tasks": [
    {
      "id": "uuid-string",
      "title": "Task description",
      "chips": 200
    }
  ],
  "chipBalance": 0,
  "earnings": [
    {
      "chips": 500,
      "date": "2025-04-12"
    }
  ],
  "cashouts": [
    {
      "id": "uuid-string",
      "amount": 4200,
      "date": "ISO-8601"
    }
  ]
}
```

- `tasks` — active (incomplete) tasks only. Completed tasks are removed from this array and their chip value is added to `chipBalance`. Deleted tasks are just removed, no chip change.
- `chipBalance` — running total of earned chips since last cashout.
- `earnings` — log of every task completion. Each entry records `chips` earned and `date` (YYYY-MM-DD, date only). Used later for daily productivity trends.
- `cashouts` — historical log of all cashouts.

## API Endpoints

All endpoints return JSON. All mutations read `db.json`, modify in memory, write back.

| Method | Path                      | Description                                                                                                    |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/tasks`              | Returns `{ tasks, chipBalance }`                                                                               |
| POST   | `/api/tasks`              | Body: `{ title, chips }`. Adds task with generated `id`.                                                       |
| POST   | `/api/tasks/:id/complete` | Removes task from array, adds `chips` to `chipBalance`, appends `{ chips, date }` to `earnings`.               |
| DELETE | `/api/tasks/:id`          | Removes task, no chip change.                                                                                  |
| PATCH  | `/api/tasks/:id`          | Body: `{ chips }`. Updates the chip value of an existing task. Only accepts 200, 500, or 1000.                 |
| PUT    | `/api/tasks/reorder`      | Body: `{ taskIds: string[] }`. Replaces `tasks` array order to match the given ID sequence.                    |
| POST   | `/api/cashout`            | Logs `{ id, amount: chipBalance, date }` to `cashouts`, resets `chipBalance` to 0. Returns the cashout record. |

## UI Layout

Single page. No routing. Top-to-bottom layout:

### 1. Chip Counter (top, prominent)

- Large display showing current `chipBalance`.
- Styled like a Balatro chip/score counter — bold, slightly retro typography.
- **Cashout button** next to it. Disabled if balance is 0. On click: see Cashout Sequence in Animation Choreography.

### 2. Add Task Bar

- Text input + chip value selector (three buttons: 200 / 500 / 1000).
- The three chip values should look like casino chips or tokens, each a distinct color.
- Submit adds the task via POST, task appears in list below.

### 3. Task List

- Each task is a card/row showing: drag handle (left edge), title, chip value badge (clickable), complete button (checkmark), delete button (X).
- **Chip value editing**: clicking the chip badge on a task cycles through 200 → 500 → 1000 → 200. Plays `button-pressed.ogg`. Persists via PATCH `/api/tasks/:id`. The badge updates immediately with the corresponding chip image.
- **Drag and drop reordering**: tasks can be reordered by dragging. Use native HTML drag-and-drop API (no libraries). On drop, persist new order via PUT `/api/tasks/reorder`. Play `task-dragged.ogg` on drag start, `task-dropped.ogg` on drop.
- Completing a task: see Animation Choreography below.
- Deleting: simpler removal, no chip animation. Play `task-deleted.ogg`.
- Empty state: show a message like "No tasks. Add one above."

## Visual Design — Balatro-Inspired Casino

The goal is the **cozy, stylized casino** feel of Balatro — not a sleazy online casino. Key characteristics:

### Color Palette

- **Background**: Animated Balatro background via `<video>` element (`backgrounds.mp4` from `public/assets/`). Set as `position: fixed; z-index: -1; object-fit: cover; width: 100%; height: 100%` with `autoplay loop muted playsinline`. Add a semi-transparent dark overlay on top of the video (e.g. `rgba(0,0,0,0.4)`) so UI elements remain readable.
- **Cards/surfaces**: Slightly lighter dark (#16213e or #0f3460) with soft rounded corners (12-16px).
- **Accent gold**: #f0c040 or similar warm gold for chip counter, highlights.
- **Chip images**: Use `red_chip.png` for 200, `blue_chip.png` for 500, `gold_chip.png` for 1000 (all in `public/assets/`). Display as small images (~24-32px) next to chip value labels in selectors and task cards.
- **Text**: Off-white (#e8e8e8) primary, muted gray for secondary.
- **Borders/glows**: Subtle box-shadows with color tinting, no harsh outlines.

### Typography

- **Headings / chip counter**: `"Pixelify Sans", cursive` — load from Google Fonts. Use for the chip balance display, section headings, and chip value labels.
- **Body text**: `"Segoe UI", system-ui, sans-serif` — no extra font load needed.
- Chip counter: extra large, bold, maybe with a subtle text-shadow glow.

### Sound Effects

Sound files are in `public/sounds/`. All are `.ogg` format. These are pre-existing assets — do NOT generate or create them. Preload them on page load via `new Audio()`.

| File                    | Trigger                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `task-completed.ogg`    | Task checkmark clicked (immediately)                                 |
| `task-deleted.ogg`      | Task delete clicked                                                  |
| `200-chips-added.ogg`   | Chip counter finishes incrementing after completing a 200-chip task  |
| `500-chips-added.ogg`   | Chip counter finishes incrementing after completing a 500-chip task  |
| `1000-chips-added.ogg`  | Chip counter finishes incrementing after completing a 1000-chip task |
| `button-pressed.ogg`    | Any button click (add task, chip value selector)                     |
| `task-dragged.ogg`      | Drag starts on a task                                                |
| `task-dropped.ogg`      | Task dropped into new position                                       |
| `cashout-completed.ogg` | Cashout animation finishes (counter reaches 0)                       |

### Animation Choreography

#### Task Completion Sequence

This is a multi-step choreographed sequence — not instant:

1. **Click checkmark** → play `task-completed.ogg`. Task card does a brief scale-up (1.03×) + green tint flash, then fades/slides out over ~300ms.
2. **Delay ~400ms** after card disappears.
3. **Chip counter increments** — animate the number rolling up to the new value over ~500ms. Chip counter box **shakes lightly** (subtle CSS shake animation, 2-3px horizontal, ~300ms). Play the corresponding chip sound (`200-chips-added.ogg`, `500-chips-added.ogg`, or `1000-chips-added.ogg`) when the counter finishes incrementing.

#### Cashout Sequence

The counter doesn't just snap to 0. It drains visually:

1. **Confirm dialog** → user confirms.
2. **Counter drains in increments**: if balance < 10,000, subtract 500 per tick; if balance ≥ 10,000, subtract 1,000 per tick.
3. **Each tick**: counter animates down by the increment amount (~150ms per tick), counter box **shakes moderately** (stronger than task completion — 4-5px, ~200ms), and play either `200-chips-added.ogg` or `500-chips-added.ogg` alternating per tick.
4. **When counter reaches 0**: play `cashout-completed.ogg`. Brief gold flash/glow on the counter box.
5. During the drain animation, disable all other interactions (add task, complete, delete, cashout button).

#### Other Micro-interactions

- Chip value selector buttons: selected state with a glow/ring effect. Play `button-pressed.ogg` on click.
- Add task button: play `button-pressed.ogg` on click.
- Keep non-choreographed animations short (200-400ms).

### General Vibe

- Clean, uncluttered. Generous padding and spacing.
- Feels like a card game UI, not a web app. Think rounded cards on felt.
- No gradients on cards — flat or very subtle. Depth via shadow, not gradient.
- Visual assets (video background, chip PNGs) are in `public/assets/`. Sound effects are `.ogg` files in `public/sounds/`. All are pre-existing — do NOT generate them.

## Behavior Rules

- Chip values are always exactly 200, 500, or 1000. No custom values.
- Task titles: required, non-empty, trimmed. Max ~200 chars.
- Cashout with 0 balance: button should be disabled, no API call.
- If `db.json` doesn't exist on server start, create it with `{ "tasks": [], "chipBalance": 0, "earnings": [], "cashouts": [] }`.
- Server runs on port 3000 by default. Print URL to console on start.

## File Structure

```
project-root/
  CLAUDE.md          # this file
  server.js          # Express server + API
  db.json            # auto-created data store (gitignored)
  package.json
  public/
    index.html       # single page
    style.css
    app.js           # all frontend logic
    assets/
      background.mp4
      red-chip.png
      blue-chip.png
      gold-chip.png
    sounds/
      cashout-completed.ogg
      task-completed.ogg
      task-deleted.ogg
      200-chips-added.ogg
      500-chips-added.ogg
      1000-chips-added.ogg
      button-pressed.ogg
      task-dragged.ogg
      task-dropped.ogg
```

## Out of Scope (do NOT implement)

- User auth
- Task title editing (title is set at creation and cannot be changed)
- Recurring tasks
- Categories, tags, priorities
- Streaks, bonuses, multipliers
- Cashout history view (will be added later)
- Any build step, bundler, or framework
- Tests
