import { app } from './app.js';
import { backupIfDue } from './backup.js';
import { expireHolds } from './booking.js';
import { tx } from './db.js';
import { migrate } from './migrate.js';
import { dispatch } from './notify.js';

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Studio das Tranças ouvindo em http://localhost:${port}`));

if (process.env.NODE_ENV !== 'test') {
  // Migrations no boot (aditivas); depois, a cada minuto: reservas vencidas expiram e a fila do WhatsApp anda.
  migrate().catch((e) => console.error('migrate', e.message));
  setInterval(() => {
    tx(expireHolds).catch((e) => console.error('expire', e.message));
    dispatch().catch((e) => console.error('dispatch', e.message));
  }, 60_000);
}

if (process.env.NODE_ENV === 'production') {
  // ponytail: backup diário dentro do app (a hospedagem não oferece crontab por SSH); se o app ficar dias sem tráfego, agendar no cron do hPanel.
  const backup = () => backupIfDue().catch((e) => console.error('backup', e.message));
  setTimeout(backup, 2 * 60_000);
  setInterval(backup, 60 * 60_000);
}
