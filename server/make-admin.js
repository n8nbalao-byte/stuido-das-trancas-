// Define e-mail e senha de login de uma profissional (padrão: Mariana, id 1).
// Uso: npm run make-admin -- mariana@exemplo.com "senha-forte" [staffId]
import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth.js';
import { closeDb, q } from './db.js';

async function main() {
  const [email, password, id = '1'] = process.argv.slice(2);
  if (!email || !password || password.length < 10) throw new Error('Uso: npm run make-admin -- email "senha com 10+ caracteres" [staffId]');
  const r = await q('UPDATE staff SET email = ?, password_hash = ? WHERE id = ?', [email.trim().toLowerCase(), await hashPassword(password), Number(id)]);
  if (!r.affectedRows) throw new Error(`Profissional ${id} não encontrada.`);
  await q('DELETE FROM sessions WHERE staff_id = ?', [Number(id)]);
  console.log(`Login definido para a profissional ${id}: ${email}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => closeDb(), (e) => { console.error(e.message); process.exitCode = 1; return closeDb(); });
}
