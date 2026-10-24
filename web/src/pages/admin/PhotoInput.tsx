import { useState } from 'react';
import { api } from '../../lib/api';

const readFile = (f: File) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });

/** Foto por upload. Grava o endereço num campo escondido `name` do formulário. `large`: foto grande quadrada (tela de produto). */
export function PhotoInput({ name, value, large = false }: { name: string; value: string | null; large?: boolean }) {
  const [url, setUrl] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true); setError('');
    try {
      if (f.size > 4 * 1024 * 1024) throw new Error('Imagem maior que 4 MB.');
      setUrl((await api<{ url: string }>('/admin/uploads', { body: { data: await readFile(f) } })).url);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const buttons = (
    <div className="row">
      <label className="btn sm outline" style={{ cursor: 'pointer' }}>
        {busy ? 'Enviando…' : url ? 'Trocar foto' : 'Enviar foto'}
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {url && <button type="button" className="btn ghost sm" onClick={() => setUrl('')}>Remover</button>}
    </div>
  );
  return (
    <div className="field" style={large ? undefined : { gridColumn: '1 / -1' }}>
      {!large && <span>Foto</span>}
      <input type="hidden" name={name} value={url} />
      {large ? (
        <>
          <div className="photo-large">{url ? <img src={url} alt="Foto do produto" /> : <span className="muted">Sem foto</span>}</div>
          {buttons}
        </>
      ) : (
        <div className="row">
          {url && <img src={url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />}
          {buttons}
        </div>
      )}
      {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
