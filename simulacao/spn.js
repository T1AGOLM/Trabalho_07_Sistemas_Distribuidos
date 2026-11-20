'use strict';
/*
 * Avaliação do modelo SPN do roteador com buffer limitado (Trabalho 07).
 *
 * O modelo GSPN (modelo/modelo_spn.md) colapsa, por simetria dos motores, na
 * cadeia de Markov (q, b): q pacotes no buffer, b motores transmitindo.
 * Este script monta o gerador infinitesimal Q, resolve pi*Q = 0 (regime
 * estacionário) e calcula TP, MRT, MQT, U, DP e MPT.
 *
 * Uso: node simulacao/spn.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DIR_RES = path.join(RAIZ, 'resultados');
const DIR_FIG = path.join(RAIZ, 'figuras');

const { resolve, estacionaria } = require('./markov');

/* ------------------------------------------------------------------ */
/* Cadeia de Markov do modelo                                          */
/* ------------------------------------------------------------------ */
function indice(q, b, c) {
  return q === 0 ? b : c + q; // q >= 1 implica b === c
}

function gerador(lambda, mu, c, K) {
  const N = c + 1 + K;
  const Q = Array.from({ length: N }, () => new Float64Array(N));
  const soma = (i, taxa) => { Q[i][i] -= taxa; };

  // estados de fila vazia: (0, b), 0 <= b <= c
  for (let b = 0; b <= c; b++) {
    const i = indice(0, b, c);
    // chegadas
    if (b < c) {
      Q[i][indice(0, b + 1, c)] += lambda;
      soma(i, lambda);
    } else if (K >= 1) {
      Q[i][indice(1, c, c)] += lambda;
      soma(i, lambda);
    }
    // partidas
    if (b > 0) {
      Q[i][indice(0, b - 1, c)] += b * mu;
      soma(i, b * mu);
    }
  }

  // estados com fila: (q, c), 1 <= q <= K
  for (let q = 1; q <= K; q++) {
    const i = indice(q, c, c);
    if (q < K) {
      Q[i][indice(q + 1, c, c)] += lambda;
      soma(i, lambda);
    } else {
      soma(i, lambda); // chegada descartada: auto-laço
    }
    Q[i][indice(q - 1, c, c)] += c * mu;
    soma(i, c * mu);
  }
  return Q;
}

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */
function metricas(cfg) {
  const { lambda, mu, c, K } = cfg;
  const Q = gerador(lambda, mu, c, K);
  const pi = estacionaria(Q);

  let eFila = 0, eAtend = 0, pDrop = 0;
  for (let b = 0; b <= c; b++) {
    const p = pi[indice(0, b, c)];
    eAtend += b * p;
  }
  for (let q = 1; q <= K; q++) {
    const p = pi[indice(q, c, c)];
    eFila += q * p;
    eAtend += c * p;
  }
  pDrop = pi[indice(K, c, c)];

  const tp = mu * eAtend;                    // pacotes/s
  const mrt = (eFila + eAtend) / tp;         // s
  const mqt = eFila / tp;                    // s
  const mpt = eAtend / tp;                   // s (= 1/mu)
  const util = eAtend / c;                   // fração (0..1)
  const dp = pDrop;                          // fração (0..1)
  const rho = lambda / (c * mu);

  return {
    ...cfg, rho, tp, mrt, mqt, mpt, util, dp,
    eFila, eAtend, pi
  };
}

/* Verificação independente: recursão das probabilidades de uma fila      */
/* M/M/c com sala de espera K (n = pacotes no sistema).                   */
function verificaMMcK(lambda, mu, c, K) {
  const a = lambda / mu;
  const p = [1];
  for (let n = 1; n <= c + K; n++) {
    p[n] = p[n - 1] * (n <= c ? a / n : a / c);
  }
  const soma = p.reduce((s, v) => s + v, 0);
  const pn = p.map((v) => v / soma);
  return {
    pDrop: pn[c + K],
    eSistema: pn.reduce((s, v, n) => s + n * v, 0),
    eFila: pn.reduce((s, v, n) => s + Math.max(0, n - c) * v, 0)
  };
}

/* ------------------------------------------------------------------ */
/* Cenários e experimentos (Etapa 4)                                   */
/* ------------------------------------------------------------------ */
const REF = { lambda: 100, mu: 30, c: 4, K: 20 };

const E1 = [40, 60, 100, 120, 140].map((lambda) => ({ label: `λ=${lambda}`, ...REF, lambda }));
const E2 = [2, 4, 6].map((c) => ({ label: `c=${c}`, ...REF, c }));
const E3 = [5, 20, 50].map((K) => ({ label: `K=${K}`, ...REF, K }));
const E4 = [
  { label: 'C1 (λ=120, c=4, K=20)', lambda: 120, mu: 30, c: 4, K: 20 },
  { label: 'C2 (λ=120, c=6, K=20)', lambda: 120, mu: 30, c: 6, K: 20 },
  { label: 'C3 (λ=150, c=8, K=40)', lambda: 150, mu: 30, c: 8, K: 40 }
];

/* ------------------------------------------------------------------ */
/* Saída                                                               */
/* ------------------------------------------------------------------ */
const fmt = (v, d = 6) => Number(v).toFixed(d);

function escreve(nome, cabecalho, linhas) {
  const arq = path.join(DIR_RES, nome);
  fs.writeFileSync(arq, [cabecalho.join(','), ...linhas.map((l) => l.join(','))].join('\n') + '\n', 'utf8');
  console.log('  ->', path.relative(RAIZ, arq), `(${linhas.length} linhas)`);
}

function linhaCSV(r) {
  return [fmt(r.lambda, 2), fmt(r.mu, 2), r.c, r.K, fmt(r.rho, 4), fmt(r.tp, 4),
    fmt(r.util, 4), fmt(r.mrt, 6), fmt(r.mqt, 6), fmt(r.mpt, 6), fmt(r.dp, 6)];
}

const CABECALHO = ['lambda', 'mu', 'c', 'K', 'rho', 'tp', 'util', 'mrt_s', 'mqt_s', 'mpt_s', 'dp'];

function main() {
  fs.mkdirSync(DIR_RES, { recursive: true });
  fs.mkdirSync(DIR_FIG, { recursive: true });

  console.log('Configuração de referência:');
  const ref = metricas(REF);
  const chk = verificaMMcK(REF.lambda, REF.mu, REF.c, REF.K);
  console.log(`  TP=${ref.tp.toFixed(2)} pkt/s  U=${(ref.util * 100).toFixed(1)}%  ` +
    `MRT=${(ref.mrt * 1000).toFixed(2)} ms  MQT=${(ref.mqt * 1000).toFixed(2)} ms  ` +
    `MPT=${(ref.mpt * 1000).toFixed(2)} ms  DP=${(ref.dp * 100).toFixed(1)}%`);
  console.log(`  verificação M/M/c/K: DP=${(chk.pDrop * 100).toFixed(1)}%  ` +
    `E[sistema]=${chk.eSistema.toFixed(4)} (modelo: ${(ref.eFila + ref.eAtend).toFixed(4)})`);

  const todas = [];
  const grupos = [
    ['e1_taxa_chegada.csv', 'E1 — taxa de chegada', E1],
    ['e2_capacidade.csv', 'E2 — capacidade de processamento', E2],
    ['e3_buffer.csv', 'E3 — capacidade do buffer', E3],
    ['e4_combinado.csv', 'E4 — demanda e recursos combinados', E4]
  ];

  for (const [arquivo, titulo, cenario] of grupos) {
    console.log(`\n${titulo}`);
    const linhas = [];
    for (const cfg of cenario) {
      const r = metricas(cfg);
      linhas.push(linhaCSV(r));
      todas.push([cfg.label.replace(/,/g, ';'), ...linhaCSV(r)]);
      console.log(`  ${cfg.label.padEnd(22)} TP=${r.tp.toFixed(2).padStart(7)} pkt/s  ` +
        `U=${(r.util * 100).toFixed(1).padStart(5)}%  MRT=${(r.mrt * 1000).toFixed(2).padStart(8)} ms  ` +
        `MQT=${(r.mqt * 1000).toFixed(2).padStart(7)} ms  DP=${(r.dp * 100).toFixed(1).padStart(5)}%`);
    }
    escreve(arquivo, CABECALHO, linhas);
  }

  console.log('\nTabela consolidada');
  escreve('tabela_consolidada.csv',
    ['cenario', 'lambda', 'mu', 'c', 'K', 'rho', 'tp', 'util', 'mrt_s', 'mqt_s', 'mpt_s', 'dp'],
    todas);

  // Verificação global: TP = lambda * (1 - DP) em todas as rodadas
  let erroMax = 0;
  for (const linha of todas) {
    const [lambda, tp, dp] = [Number(linha[1]), Number(linha[6]), Number(linha[11])];
    erroMax = Math.max(erroMax, Math.abs(tp - lambda * (1 - dp)));
  }
  console.log(`\nVerificação do balanço de fluxo |TP - λ(1-DP)| máx = ${erroMax.toExponential(2)}`);
}

module.exports = { metricas, verificaMMcK, gerador, REF };

if (require.main === module) main();
