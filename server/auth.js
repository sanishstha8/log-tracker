const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET_PATH = path.join(DATA_DIR, 'jwt-secret.txt');

let secret;
if (fs.existsSync(SECRET_PATH)) {
  secret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
}

const TOKEN_EXPIRY = '30d';

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, secret, { expiresIn: TOKEN_EXPIRY });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, secret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { issueToken, requireAuth };
