import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Loading } from '../../components/ui';
import { fmtDateTime, money, todaySP } from '../../lib/api';
import { useLoad } from './common';

type Move = { at: string; kind: 'sinal' | 'saldo' | 'venda' | 'estorno'; label: string; customer: string; code: string; ref: { type: 'appointment' | 'order'; id: number }; cents: number };
type Group = { name: string; count: number; cents: number };
type Report = {
  from: string; to: string; movements: Move[]; byService: Group[]; byStaff: Group[]; byProduct: Group[];
  summary: { total: number; deposits: number; depositsCount: number; balances: number; completedCount: number; sales: number; salesCount: number; refunds: number; refundsCount: number; retained: number; noShowCount: number; cancelledCount: number; toReceive: number; confirmedCount: number };
};

const KIND: Record<Move['kind'], [string, string]> = { sinal: ['Sinal Pix', 'info'], saldo: ['Saldo no salão', 'ok'], venda: ['Venda da loja', 'warn'], estorno: ['Estorno', 'danger'] };
const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => add(monthStart(add(monthStart(d), 32)), -1);
const fmtDay = (d: string) => d.split('-').reverse().join('/');

function presets() {
  const t = todaySP();
  const lastMonth = add(monthStart(t), -1);
  return [
    ['Hoje', t, t], ['Últimos 7 dias', add(t, -6), t], ['Este mês', monthStart(t), monthEnd(t)],
    ['Mês passado', monthStart(lastMonth), lastMonth], ['Este ano', `${t.slice(0, 4)}-01-01`, `${t.slice(0, 4)}-12-31`],
  ] as const;
}

/** Planilha CSV (separador ";" e BOM para abrir certo no Excel em português). */
function exportCsv(r: Report) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Data', 'Tipo', 'Descrição', 'Cliente', 'Código', 'Valor (R$)'].join(';'),
    ...r.movements.map((m) => [fmtDateTime(m.at), KIND[m.kind][0], m.label, m.customer, m.code, (m.cents / 100).toFixed(2).replace('.', ',')].map(cell).join(';'))];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `relatorio-${r.from}-a-${r.to}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

function GroupTable({ rows, unit, empty }: { rows: Group[]; unit: string; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <table className="table">
      <thead><tr><th>Nome</th><th style={{ textAlign: 'right' }}>{unit}</th><th style={{ textAlign: 'right' }}>Valor</th><th className="no-print" style={{ width: '30%' }}></th></tr></thead>
      <tbody>{rows.map((g) => (
        <tr key={g.name}><td>{g.name}</td><td style={{ textAlign: 'right' }}>{g.count}</td><td style={{ textAlign: 'right' }}><b>{money(g.cents)}</b></td>
          <td className="no-print"><div className="bar"><span style={{ width: `${(g.cents / max) * 100}%` }} /></div></td></tr>
      ))}</tbody>
    </table>
  );
}

export default function Relatorios() {
  const opts = presets();
  const [range, setRange] = useState<[string, string]>([opts[2][1], opts[2][2]]);
  const [tab, setTab] = useState<'mov' | 'serv' | 'staff' | 'prod'>('mov');
  const [kind, setKind] = useState<'' | Move['kind']>('');
  const [r, error] = useLoad<Report>(`/admin/reports?from=${range[0]}&to=${range[1]}`);
  const s = r?.summary;
  const moves = r ? r.movements.filter((m) => !kind || m.kind === kind) : [];

  return (
    <div className="stack report" style={{ gap: 18 }}>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Relatório financeiro</h1>
        <div className="row no-print">
          <button className="btn outline sm" disabled={!r} onClick={() => r && exportCsv(r)}>Exportar planilha</button>
          <button className="btn outline sm" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="panel stack no-print" style={{ gap: 12 }}>
        <div className="chips" role="group" aria-label="Período">
          {opts.map(([label, a, b]) => <button key={label} className={`chip ${range[0] === a && range[1] === b ? 'on' : ''}`} onClick={() => setRange([a, b])}>{label}</button>)}
        </div>
        <div className="row">
          <label className="row small">De <input className="input" type="date" value={range[0]} max={range[1]} onChange={(e) => e.target.value && setRange([e.target.value, range[1]])} style={{ width: 170 }} /></label>
          <label className="row small">até <input className="input" type="date" value={range[1]} min={range[0]} onChange={(e) => e.target.value && setRange([range[0], e.target.value])} style={{ width: 170 }} /></label>
        </div>
      </div>
      <p className="muted">Período: <b>{fmtDay(range[0])}</b> a <b>{fmtDay(range[1])}</b></p>

      {error && <Alert kind="danger">{error}</Alert>}
      {!r || !s ? <Loading /> : <>
        <div className="report-total">
          <span>Total recebido no período</span>
          <b>{money(s.total)}</b>
          <span className="small">Sinais {money(s.deposits)} + Saldos {money(s.balances)} + Loja {money(s.sales)}{s.refunds ? ` − Estornos ${money(-s.refunds)}` : ''}</span>
        </div>
        <div className="stats">
          <div className="stat"><span className="muted">Sinais Pix conferidos</span><b>{money(s.deposits)}</b><span className="small muted">{s.depositsCount} pagamento(s)</span></div>
          <div className="stat"><span className="muted">Saldos pagos no salão</span><b>{money(s.balances)}</b><span className="small muted">{s.completedCount} atendimento(s) concluído(s)</span></div>
          <div className="stat"><span className="muted">Vendas da loja</span><b>{money(s.sales)}</b><span className="small muted">{s.salesCount} pedido(s) pago(s)</span></div>
          <div className="stat"><span className="muted">Estornos da loja</span><b>{money(s.refunds)}</b><span className="small muted">{s.refundsCount} cancelamento(s)</span></div>
          <div className="stat"><span className="muted">A receber no salão</span><b>{money(s.toReceive)}</b><span className="small muted">saldo de {s.confirmedCount} atendimento(s) confirmado(s)</span></div>
          <div className="stat"><span className="muted">Sinais de faltas e cancelamentos</span><b>{money(s.retained)}</b><span className="small muted">{s.noShowCount} falta(s) · {s.cancelledCount} cancelamento(s)</span></div>
        </div>

        <div className="tabs no-print" role="tablist">
          {([['mov', 'Movimentações'], ['serv', 'Por serviço'], ['staff', 'Por trancista'], ['prod', 'Produtos vendidos']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'mov' && (
          <section className="panel">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Movimentações ({moves.length})</h2>
              <select className="select no-print" value={kind} onChange={(e) => setKind(e.target.value as any)} style={{ width: 'auto' }} aria-label="Tipo">
                <option value="">Todos os tipos</option>
                {Object.entries(KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {!moves.length ? <p className="muted">Nenhuma movimentação no período.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Cliente</th><th>Código</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>{moves.map((m, i) => (
                    <tr key={i}>
                      <td>{fmtDateTime(m.at)}</td>
                      <td><span className={`badge ${KIND[m.kind][1]}`}>{KIND[m.kind][0]}</span></td>
                      <td>{m.label}</td>
                      <td>{m.customer}</td>
                      <td>{m.ref.type === 'appointment' ? <Link to={`/admin/atendimento/${m.ref.id}`}>{m.code}</Link> : <Link to="/admin/pedidos">{m.code}</Link>}</td>
                      <td style={{ textAlign: 'right', color: m.cents < 0 ? 'var(--danger)' : undefined }}><b>{money(m.cents)}</b></td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr><td colSpan={5}><b>Total</b></td><td style={{ textAlign: 'right' }}><b>{money(moves.reduce((n, m) => n + m.cents, 0))}</b></td></tr></tfoot>
                </table>
              </div>
            )}
          </section>
        )}
        {tab === 'serv' && <section className="panel"><h2>Atendimentos concluídos por serviço</h2><GroupTable rows={r.byService} unit="Atendimentos" empty="Nenhum atendimento concluído no período." /></section>}
        {tab === 'staff' && <section className="panel"><h2>Atendimentos concluídos por trancista</h2><GroupTable rows={r.byStaff} unit="Atendimentos" empty="Nenhum atendimento concluído no período." /></section>}
        {tab === 'prod' && <section className="panel"><h2>Produtos vendidos</h2><GroupTable rows={r.byProduct} unit="Unidades" empty="Nenhuma venda paga no período." /></section>}
        <p className="small muted">
          Como cada valor entra: <b>sinal</b> na data em que o Pix foi conferido; <b>saldo</b> na data do atendimento marcado como concluído (pago no salão);
          <b> venda</b> na data em que o pedido foi marcado como pago; <b>estorno</b> quando um pedido pago é cancelado. Valores por serviço e trancista consideram o preço total do atendimento.
        </p>
      </>}
    </div>
  );
}
