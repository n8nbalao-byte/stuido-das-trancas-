import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { q } from './db.js';
import { fail } from './http.js';

const scryptAsync = promisify(scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const hash = (t) => createHash('sha256').update(t).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  return `scrypt$${salt}$${(await scryptAsync(password, salt, 64)).toString('base64url')}`;
}

export async function checkPassword(password, stored) {
  const [kind, salt, expected] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !expected) return false;
  const got = await scryptAsync(password, salt, 64);
  const want = Buffer.from(expected, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Login com limite de tentativas por e-mail (contador atômico no banco: vale com mais de um processo do app). */
export async function login(res, rawEmail, password) {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!email || !password) fail(400, 'Informe e-mail e senha.');
  const [lock] = await q('SELECT locked_until FROM login_attempts WHERE email = ? AND locked_until > ?', [email, new Date()]);
  if (lock) fail(429, `Muitas tentativas. Tente de novo em ${LOCK_MIN} minutos.`);
  const [staff] = await q('SELECT * FROM staff WHERE email = ? AND active = 1', [email]);
  if (!staff || !(await checkPassword(String(password), staff.password_hash))) {
    await q(`INSERT INTO login_attempts (email, fails) VALUES (?, 1)
             ON DUPLICATE KEY UPDATE fails = IF(locked_until IS NOT NULL AND locked_until <= ?, 1, fails + 1),
               locked_until = IF(fails >= ?, ?, NULL)`, [email, new Date(), MAX_FAILS, new Date(Date.now() + LOCK_MIN * 60e3)]);
    fail(401, 'E-mail ou senha incorretos.');
  }
  await q('DELETE FROM login_attempts WHERE email = ?', [email]);
  const token = randomBytes(32).toString('base64url');
  await q('INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?,?,?)', [hash(token), staff.id, new Date(Date.now() + SESSION_MS)]);
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`);
  return publicStaff(staff);
}

const sid = (req) => /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];

export async function logout(req, res) {
  const token = sid(req);
  if (token) await q('DELETE FROM sessions WHERE token_hash = ?', [hash(token)]);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

export async function loadStaff(req, res, next) {
  const token = sid(req);
  if (token) {
    const [staff] = await q('SELECT st.* FROM sessions s JOIN staff st ON st.id = s.staff_id WHERE s.token_hash = ? AND s.expires_at > ? AND st.active = 1', [hash(token), new Date()]);
    if (staff) req.staff = staff;
  }
  next();
}

/** Painel: só admin por enquanto. Trancistas com login ficam para quando a Mariana liberar (papel já existe). */
export const requireAdmin = (req, res, next) => {
  if (!req.staff) fail(401, 'Faça login para continuar.');
  if (req.staff.role !== 'admin') fail(403, 'Sem permissão.');
  next();
};

export const publicStaff = (s) => ({ id: s.id, name: s.name, email: s.email, role: s.role });
