const express = require('express');
const bcrypt = require('bcryptjs');
const { db, seedDefaultCategories } = require('./db');
const { issueToken, requireAuth } = require('./auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

router.post('/auth/signup', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, . _ -).' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  const userId = info.lastInsertRowid;
  seedDefaultCategories(userId);

  const token = issueToken({ id: userId, username });
  res.status(201).json({ token, username });
});

router.post('/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = issueToken(user);
  res.json({ token, username: user.username });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

// ---------- categories ----------

router.get('/categories', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY sort_order ASC').all(req.user.id);
  res.json(rows.map(r => r.name));
});

router.post('/categories', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  const dup = db.prepare('SELECT id FROM categories WHERE user_id = ? AND lower(name) = lower(?)').get(req.user.id, name);
  if (dup) return res.status(409).json({ error: 'That category already exists.' });

  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM categories WHERE user_id = ?').get(req.user.id);
  const nextOrder = (maxRow.m ?? -1) + 1;
  db.prepare('INSERT INTO categories (user_id, name, sort_order) VALUES (?, ?, ?)').run(req.user.id, name, nextOrder);

  const rows = db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY sort_order ASC').all(req.user.id);
  res.status(201).json(rows.map(r => r.name));
});

router.delete('/categories/:name', requireAuth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE user_id = ?').get(req.user.id).c;
  if (count <= 1) return res.status(400).json({ error: 'At least one category must remain.' });

  db.prepare('DELETE FROM categories WHERE user_id = ? AND name = ?').run(req.user.id, req.params.name);

  const rows = db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY sort_order ASC').all(req.user.id);
  res.json(rows.map(r => r.name));
});

// ---------- entries ----------

function serializeEntry(row) {
  return {
    id: String(row.id),
    skill: row.skill,
    category: row.category,
    note: row.note,
    tags: JSON.parse(row.tags),
    date: row.entry_date
  };
}

router.get('/entries', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY entry_date DESC').all(req.user.id);
  res.json(rows.map(serializeEntry));
});

router.post('/entries', requireAuth, (req, res) => {
  const skill = String(req.body.skill || '').trim();
  const category = String(req.body.category || '').trim();
  const note = String(req.body.note || '').trim();
  const date = String(req.body.date || '').trim();
  const tags = Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t).trim()).filter(Boolean) : [];

  if (!skill) return res.status(400).json({ error: 'Skill is required.' });
  if (!category) return res.status(400).json({ error: 'Category is required.' });
  if (!date || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'A valid date is required.' });

  const info = db.prepare(
    'INSERT INTO entries (user_id, skill, category, note, tags, entry_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, skill, category, note, JSON.stringify(tags), date);

  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeEntry(row));
});

router.delete('/entries/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Entry not found.' });
  res.status(204).end();
});

module.exports = router;
