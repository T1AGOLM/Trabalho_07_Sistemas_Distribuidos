'use strict';
/*
 * Gera os gráficos do Trabalho 07 em SVG (sem dependências), lendo os CSVs
 * produzidos por simulacao/spn.js. Os mesmos CSVs alimentam os gráficos
 * pgfplots do artigo LaTeX (artigo/main.tex).
 *
 * Uso: node figuras/graficos.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const RES = path.join(RAIZ, 'resultados');
const FIG = path.join(RAIZ, 'figuras');

function lerCSV(nome) {
  const txt = fs.readFileSync(path.join(RES, nome), 'utf8').trim().split(/\r?\n/);
  const cab = txt[0].split(',');
  return txt.slice(1).map((l) => {
    const c = l.split(',');
    return Object.fromEntries(cab.map((h, i) => [h, h === 'cenario' ? c[i] : Number(c[i])]));
  });
}

function escala(min, max) {
  if (max - min < 1e-12) { max = min + 1; }
  const bruto = (max - min) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto) || bruto;
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = ini; v <= fim + passo * 1e-9; v += passo) ticks.push(Number(v.toFixed(10)));
  return { min: ini, max: fim, ticks };
}

const CORES = ['#1f4e79', '#c0392b', '#1e8449', '#8e44ad', '#d68910'];

function grafico({ titulo, xRotulo, yRotulo, series, formatoY = (v) => v.toFixed(1), largura = 660, altura = 420 }) {
  const M = { e: 78, d: 22, t: 42, b: 62 };
  const L = largura - M.e - M.d;
  const A = altura - M.t - M.b;

  const xs = series.flatMap((s) => s.pontos.map((p) => p.x));
  const ys = series.flatMap((s) => s.pontos.map((p) => p.y));
  const ex = escala(Math.min(...xs), Math.max(...xs));
  const ey = escala(Math.min(0, Math.min(...ys)), Math.max(...ys));

  const px = (x) => M.e + ((x - ex.min) / (ex.max - ex.min)) * L;
  const py = (y) => M.t + A - ((y - ey.min) / (ey.max - ey.min)) * A;

  const p = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" font-family="Helvetica, Arial, sans-serif">`);
  p.push(`<rect width="${largura}" height="${altura}" fill="#ffffff"/>`);
  p.push(`<text x="${largura / 2}" y="26" text-anchor="middle" font-size="15" font-weight="bold" fill="#222">${titulo}</text>`);

  // grade + eixos
  for (const v of ey.ticks) {
    const y = py(v);
    p.push(`<line x1="${M.e}" y1="${y.toFixed(1)}" x2="${M.e + L}" y2="${y.toFixed(1)}" stroke="#e6e6e6"/>`);
    p.push(`<text x="${M.e - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#444">${formatoY(v)}</text>`);
  }
  for (const v of ex.ticks) {
    const x = px(v);
    p.push(`<line x1="${x.toFixed(1)}" y1="${M.t}" x2="${x.toFixed(1)}" y2="${M.t + A}" stroke="#f0f0f0"/>`);
    p.push(`<text x="${x.toFixed(1)}" y="${M.t + A + 18}" text-anchor="middle" font-size="11" fill="#444">${v}</text>`);
  }
  p.push(`<line x1="${M.e}" y1="${M.t + A}" x2="${M.e + L}" y2="${M.t + A}" stroke="#333"/>`);
  p.push(`<line x1="${M.e}" y1="${M.t}" x2="${M.e}" y2="${M.t + A}" stroke="#333"/>`);
  p.push(`<text x="${M.e + L / 2}" y="${altura - 12}" text-anchor="middle" font-size="12" fill="#222">${xRotulo}</text>`);
  p.push(`<text transform="translate(18 ${M.t + A / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#222">${yRotulo}</text>`);

  // séries
  series.forEach((s, i) => {
    const cor = s.cor || CORES[i % CORES.length];
    const pts = s.pontos.map((pt) => `${px(pt.x).toFixed(1)},${py(pt.y).toFixed(1)}`).join(' ');
    p.push(`<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2.2"/>`);
    for (const pt of s.pontos) {
      p.push(`<circle cx="${px(pt.x).toFixed(1)}" cy="${py(pt.y).toFixed(1)}" r="3.6" fill="${cor}"/>`);
    }
    const ly = M.t + 14 + i * 18;
    p.push(`<line x1="${M.e + L - 150}" y1="${ly}" x2="${M.e + L - 122}" y2="${ly}" stroke="${cor}" stroke-width="2.4"/>`);
    p.push(`<circle cx="${M.e + L - 136}" cy="${ly}" r="3.2" fill="${cor}"/>`);
    p.push(`<text x="${M.e + L - 116}" y="${ly + 4}" font-size="11" fill="#222">${s.nome}</text>`);
  });

  p.push('</svg>');
  return p.join('\n');
}

function salva(nome, svg) {
  fs.writeFileSync(path.join(FIG, nome), svg, 'utf8');
  console.log('  ->', path.join('figuras', nome));
}

function main() {
  fs.mkdirSync(FIG, { recursive: true });
  const e1 = lerCSV('e1_taxa_chegada.csv');
  const e2 = lerCSV('e2_capacidade.csv');
  const e3 = lerCSV('e3_buffer.csv');
  const e4 = lerCSV('e4_combinado.csv');

  console.log('Gerando gráficos:');

  salva('fig1_e1_tempos.svg', grafico({
    titulo: 'E1 — Tempos médios em função da taxa de chegada (c=4, K=20)',
    xRotulo: 'Taxa de chegada λ (pkt/s)',
    yRotulo: 'Tempo (ms)',
    formatoY: (v) => v.toFixed(0),
    series: [
      { nome: 'MRT', pontos: e1.map((r) => ({ x: r.lambda, y: r.mrt_s * 1000 })) },
      { nome: 'MQT', pontos: e1.map((r) => ({ x: r.lambda, y: r.mqt_s * 1000 })) }
    ]
  }));

  salva('fig2_e1_perdas_util.svg', grafico({
    titulo: 'E1 — Utilização e probabilidade de descarte (c=4, K=20)',
    xRotulo: 'Taxa de chegada λ (pkt/s)',
    yRotulo: 'Percentual (%)',
    formatoY: (v) => v.toFixed(0),
    series: [
      { nome: 'U', pontos: e1.map((r) => ({ x: r.lambda, y: r.util * 100 })) },
      { nome: 'DP', pontos: e1.map((r) => ({ x: r.lambda, y: r.dp * 100 })) }
    ]
  }));

  salva('fig3_e2_capacidade.svg', grafico({
    titulo: 'E2 — Efeito do número de motores (λ=100, K=20)',
    xRotulo: 'Motores de encaminhamento c',
    yRotulo: 'MRT (ms) / TP (pkt/s) / U (%)',
    formatoY: (v) => v.toFixed(0),
    series: [
      { nome: 'MRT (ms)', pontos: e2.map((r) => ({ x: r.c, y: r.mrt_s * 1000 })) },
      { nome: 'MQT (ms)', pontos: e2.map((r) => ({ x: r.c, y: r.mqt_s * 1000 })) },
      { nome: 'TP (pkt/s)', pontos: e2.map((r) => ({ x: r.c, y: r.tp })) },
      { nome: 'U (%)', pontos: e2.map((r) => ({ x: r.c, y: r.util * 100 })) }
    ]
  }));

  salva('fig4_e3_buffer.svg', grafico({
    titulo: 'E3 — Efeito do tamanho do buffer (λ=100, c=4)',
    xRotulo: 'Posições de buffer K',
    yRotulo: 'DP (%) / MRT (ms)',
    formatoY: (v) => v.toFixed(0),
    series: [
      { nome: 'DP (%)', pontos: e3.map((r) => ({ x: r.K, y: r.dp * 100 })), cor: '#c0392b' },
      { nome: 'MRT (ms)', pontos: e3.map((r) => ({ x: r.K, y: r.mrt_s * 1000 })), cor: '#1f4e79' },
      { nome: 'MQT (ms)', pontos: e3.map((r) => ({ x: r.K, y: r.mqt_s * 1000 })), cor: '#1e8449' }
    ]
  }));

  salva('fig5_e4_combinado.svg', grafico({
    titulo: 'E4 — Cenários combinados de demanda e recursos',
    xRotulo: 'Cenário (1=C1, 2=C2, 3=C3)',
    yRotulo: 'MRT (ms) / DP (%)',
    formatoY: (v) => v.toFixed(0),
    series: [
      { nome: 'MRT (ms)', pontos: e4.map((r, i) => ({ x: i + 1, y: r.mrt_s * 1000 })) },
      { nome: 'DP (%)', pontos: e4.map((r, i) => ({ x: i + 1, y: r.dp * 100 })) },
      { nome: 'U (%)', pontos: e4.map((r, i) => ({ x: i + 1, y: r.util * 100 })) }
    ]
  }));
}

main();
