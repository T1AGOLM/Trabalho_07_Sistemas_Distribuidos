'use strict';
/*
 * Validação cruzada: três avaliadores independentes, 14 configurações.
 *
 *   (A) analítico  — cadeia agregada (q,b) resolvida diretamente (spn.js)
 *   (B) GSPN       — motor explícito da rede (gspn.js): alcançabilidade,
 *                    estados evanescentes, pesos das imediatas, arco inibidor
 *   (C) eventos discretos — simulação do sistema físico (montecarlo.js), IC 95%
 *
 * Além de comparar (A) com (B), compara (A) com a recursão fechada da fila
 * M/M/c com sala de espera K (verificação matemática independente).
 * Sai com código 1 se qualquer verificação falhar.
 *
 * Uso: node simulacao/validacao.js
 */

const fs = require('fs');
const path = require('path');
const { metricas, verificaMMcK } = require('./spn');
const { avalia } = require('./gspn');
const { simula } = require('./montecarlo');

const RAIZ = path.resolve(__dirname, '..');
const REF = { lambda: 100, mu: 30, c: 4, K: 20 };

const CASOS = [
  { nome: 'Referência', ...REF },
  { nome: 'E1-40', lambda: 40, mu: 30, c: 4, K: 20 },
  { nome: 'E1-60', lambda: 60, mu: 30, c: 4, K: 20 },
  { nome: 'E1-100', lambda: 100, mu: 30, c: 4, K: 20 },
  { nome: 'E1-120', lambda: 120, mu: 30, c: 4, K: 20 },
  { nome: 'E1-140', lambda: 140, mu: 30, c: 4, K: 20 },
  { nome: 'E2-c2', lambda: 100, mu: 30, c: 2, K: 20 },
  { nome: 'E2-c4', lambda: 100, mu: 30, c: 4, K: 20 },
  { nome: 'E2-c6', lambda: 100, mu: 30, c: 6, K: 20 },
  { nome: 'E3-K5', lambda: 100, mu: 30, c: 4, K: 5 },
  { nome: 'E3-K20', lambda: 100, mu: 30, c: 4, K: 20 },
  { nome: 'E3-K50', lambda: 100, mu: 30, c: 4, K: 50 },
  { nome: 'E4-C1', lambda: 120, mu: 30, c: 4, K: 20 },
  { nome: 'E4-C2', lambda: 120, mu: 30, c: 6, K: 20 },
  { nome: 'E4-C3', lambda: 150, mu: 30, c: 8, K: 40 }
];

const TOL = { tp: 1e-3, dp: 1e-6, tempo: 1e-4 }; // abs, somado a 3 sigma
const SIGMA = 3;                                  // ~99,7% de confiança

let falhas = 0;
const linhas = [];
const fmt = (v, d = 6) => Number(v).toFixed(d);

function checa(cond, mensagem) {
  if (!cond) { falhas++; console.log(`  FALHOU: ${mensagem}`); }
}

console.log('Validação cruzada dos avaliadores\n');
console.log('caso       |  (A) TP   (B) TP   |Δ|      |  (C) TP ± IC          | DP(A)  DP(B)  DP(C) ± IC');

for (const caso of CASOS) {
  const A = metricas(caso);
  const B = avalia(caso);
  const C = simula({ ...caso, chegadas: 200000, semente: 20260719 + caso.K * 7 + caso.c });
  const R = verificaMMcK(caso.lambda, caso.mu, caso.c, caso.K);

  // (A) x recursão fechada M/M/c/K
  checa(Math.abs(A.dp - R.pDrop) < 1e-9, `${caso.nome}: DP(A)=${A.dp} vs DP(M/M/c/K)=${R.pDrop}`);
  checa(Math.abs((A.eFila + A.eAtend) - R.eSistema) < 1e-7,
    `${caso.nome}: E[sistema] divergente da recursão fechada`);

  // (A) x (B): o motor GSPN e a cadeia agregada devem coincidir numericamente
  checa(Math.abs(A.tp - B.tp) < 1e-6, `${caso.nome}: TP(A)=${A.tp} vs TP(B)=${B.tp}`);
  checa(Math.abs(A.dp - B.dp) < 1e-9, `${caso.nome}: DP(A)=${A.dp} vs DP(B)=${B.dp}`);
  checa(Math.abs(A.mrt - B.mrt) < 1e-9, `${caso.nome}: MRT(A) vs MRT(B)`);
  checa(Math.abs(A.mqt - B.mqt) < 1e-9, `${caso.nome}: MQT(A) vs MQT(B)`);
  checa(B.residuo < 1e-10, `${caso.nome}: resíduo ||pi*Q|| = ${B.residuo}`);

  // (A) x (C): a simulação deve cair dentro do IC 95% (tolerância de 3 sigma)
  const dentro = (exato, est, chave) =>
    Math.abs(exato - est.media) <= SIGMA * est.erroPadrao + TOL[chave];
  checa(dentro(A.tp, C.tp, 'tp'), `${caso.nome}: TP(A)=${A.tp.toFixed(4)} fora do IC da simulação (${C.tp.media.toFixed(3)} ± ${C.tp.meia.toFixed(3)})`);
  // Para eventos raros o erro-padrão por lotes degenera (fica 0 quando não ocorre
  // nenhum descarte nos lotes). Usa-se o maior entre ele e o erro binomial de
  // contagem, que é a medida correta quando p é da ordem de 1/n.
  const seBinomial = Math.sqrt(Math.max(A.dp * (1 - A.dp) / C.n, 1e-18));
  const toleranciaDp = SIGMA * Math.max(C.dp.erroPadrao, seBinomial) + TOL.dp;
  checa(Math.abs(A.dp - C.dp.media) <= toleranciaDp,
    `${caso.nome}: DP(A)=${A.dp.toFixed(6)} fora do IC da simulação ` +
    `(${C.dp.media.toFixed(6)} ± ${toleranciaDp.toExponential(2)}, n=${C.n})`);
  checa(dentro(A.mrt, C.mrt, 'tempo'), `${caso.nome}: MRT(A)=${A.mrt.toFixed(4)} fora do IC da simulação (${C.mrt.media.toFixed(4)} ± ${C.mrt.meia.toFixed(4)})`);
  checa(dentro(A.mqt, C.mqt, 'tempo'), `${caso.nome}: MQT(A)=${A.mqt.toFixed(4)} fora do IC da simulação (${C.mqt.media.toFixed(4)} ± ${C.mqt.meia.toFixed(4)})`);
  checa(dentro(A.util, C.util, 'dp'), `${caso.nome}: U(A)=${A.util.toFixed(4)} fora do IC da simulação`);

  // balanço de fluxo
  checa(Math.abs(A.tp - caso.lambda * (1 - A.dp)) < 1e-8, `${caso.nome}: balanço TP = lambda(1-DP)`);
  checa(Math.abs(A.mpt - 1 / caso.mu) < 1e-12, `${caso.nome}: MPT != 1/mu`);

  console.log(
    `${caso.nome.padEnd(10)} | ${A.tp.toFixed(3).padStart(7)}  ${B.tp.toFixed(3).padStart(7)}  ` +
    `${Math.abs(A.tp - B.tp).toExponential(1).padStart(7)} | ` +
    `${C.tp.media.toFixed(2).padStart(7)} ± ${C.tp.meia.toFixed(2).padEnd(5)} | ` +
    `${(A.dp * 100).toFixed(3).padStart(6)} ${(B.dp * 100).toFixed(3).padStart(6)} ${(C.dp.media * 100).toFixed(3).padStart(6)} ± ${(C.dp.meia * 100).toFixed(3)}`
  );

  linhas.push([
    caso.nome, caso.lambda, caso.c, caso.K,
    fmt(A.tp, 4), fmt(B.tp, 4),
    fmt(C.tp.media, 3), fmt(C.tp.meia, 3),
    fmt(A.dp, 6), fmt(B.dp, 6), fmt(C.dp.media, 6), fmt(C.dp.meia, 6),
    fmt(A.mrt, 6), fmt(B.mrt, 6), fmt(C.mrt.media, 6), fmt(C.mrt.meia, 6),
    B.estados, B.estadosSemSimetria, fmt(B.residuo, 12)
  ]);
}

const arquivo = path.join(RAIZ, 'resultados', 'validacao.csv');
fs.mkdirSync(path.dirname(arquivo), { recursive: true });
fs.writeFileSync(arquivo,
  ['caso,lambda,c,K,tp_analitico,tp_gspn,tp_mc,ic_tp,dp_analitico,dp_gspn,dp_mc,ic_dp,' +
   'mrt_analitico,mrt_gspn,mrt_mc,ic_mrt,estados_tangiveis,estados_sem_simetria,residuo'].join(',') +
  '\n' + linhas.map((l) => l.join(',')).join('\n') + '\n', 'utf8');

console.log(`\n-> resultados/validacao.csv (${linhas.length} configurações)`);
if (falhas === 0) {
  console.log('TODAS AS VERIFICAÇÕES PASSARAM (3 avaliadores concordam nas 15 configurações).');
} else {
  console.log(`${falhas} verificação(ões) falharam.`);
  process.exitCode = 1;
}
