'use strict';
/*
 * Motor GSPN genérico (independente do modelo de fila).
 *
 * A rede do roteador é declarada explicitamente (lugares, capacidades, arcos
 * de entrada/saída, arco inibidor, transições temporizadas e imediatas com
 * pesos). O motor:
 *   1. enumera as marcações alcançáveis a partir de m0;
 *   2. classifica marcações em tangíveis e evanescentes;
 *   3. resolve os conflitos entre transições imediatas por peso;
 *   4. monta a cadeia de Markov de estados tangíveis (EMC) e resolve pi*Q = 0;
 *   5. calcula as métricas por equações de fluxo.
 *
 * Os lugares P_C e P_D são sorvedouros: acumulam tokens infinitos e por isso
 * não entram na marcação; as métricas de fluxo usam as taxas de disparo.
 *
 * Motores idênticos são simétricos, então as marcações são canonicalizadas
 * (ordenação dos lugares P_A_i). Sem essa redução o espaço de estados seria
 * 2^c (K+1); com ela, (c+1)+K. Ambos os números são reportados em `avalia`.
 *
 * Uso: node simulacao/gspn.js
 */

const { estacionaria } = require('./markov');

/* ------------------------------ rede ------------------------------ */
function criaRede({ lambda, mu, c, K }) {
  const places = [
    { nome: 'P_F', cap: 1 },
    { nome: 'P_V', cap: K },
    { nome: 'P_Q', cap: K }
  ];
  // um par (P_S_i, P_A_i) por motor: o despacho so pode ocorrer no motor livre
  for (let i = 0; i < c; i++) places.push({ nome: `P_S${i}`, cap: 1 });
  for (let i = 0; i < c; i++) places.push({ nome: `P_A${i}`, cap: 1 });
  places.push({ nome: 'P_C', cap: Infinity, sink: true });
  places.push({ nome: 'P_D', cap: Infinity, sink: true });

  const idx = {};
  places.forEach((p, i) => { idx[p.nome] = i; });

  const marca0 = places.map((p) => {
    if (p.nome === 'P_F') return 1;
    if (p.nome === 'P_V') return K;
    if (p.nome.startsWith('P_S')) return 1; // todos os motores comecam ociosos
    return 0;
  });

  const trans = [
    { nome: 'T_CHE', tipo: 'temp', taxa: lambda,
      in: [['P_F', 1], ['P_V', 1]], out: [['P_F', 1], ['P_Q', 1]], inib: [] },
    { nome: 'T_BLQ', tipo: 'temp', taxa: lambda,
      in: [['P_F', 1]], out: [['P_F', 1], ['P_D', 1]], inib: ['P_V'] }
  ];
  for (let i = 0; i < c; i++) {
    // o pacote sai do buffer ao entrar em transmissao: a vaga e devolvida aqui
    trans.push({ nome: `I_DES${i}`, tipo: 'imed', peso: 1,
      in: [['P_Q', 1], [`P_S${i}`, 1]], out: [[`P_A${i}`, 1], ['P_V', 1]], inib: [] });
    // o fim da transmissao devolve apenas o motor
    trans.push({ nome: `T_TR${i}`, tipo: 'temp', taxa: mu,
      in: [[`P_A${i}`, 1]], out: [[`P_S${i}`, 1], ['P_C', 1]], inib: [] });
  }

  return { places, idx, marca0, trans, lambda, mu, c, K };
}

/* ---------------------------- habilitacao ---------------------------- */
function habilitada(m, rede, t) {
  for (const [lugar, mult] of t.in) {
    if (m[rede.idx[lugar]] < mult) return false;
  }
  for (const lugar of t.inib) {
    if (m[rede.idx[lugar]] !== 0) return false;
  }
  return true;
}

function dispara(m, rede, t) {
  const novo = m.slice();
  for (const [lugar, mult] of t.in) novo[rede.idx[lugar]] -= mult;
  for (const [lugar, mult] of t.out) {
    const p = rede.places[rede.idx[lugar]];
    if (p.sink) continue;               // sorvedouro nao ocupa marcacao
    novo[rede.idx[lugar]] += mult;
    if (novo[rede.idx[lugar]] > p.cap) return null; // violacao de capacidade
  }
  return canoniza(novo, rede);
}

// motores identicos => os vetores de P_S e de P_A sao ordenados (simetria de renomeacao)
function canoniza(m, rede) {
  if (rede.c < 2) return m;
  // forma canonica: motores ocupados ocupam as primeiras posicoes e os ociosos
  // as ultimas, de modo que o par (P_S_i, P_A_i) nunca se misture entre motores.
  const iS = rede.idx['P_S0'], iA = rede.idx['P_A0'];
  const ociosos = m.slice(iS, iS + rede.c).sort((a, b) => a - b);     // 0...0,1...1
  const ocupados = m.slice(iA, iA + rede.c).sort((a, b) => b - a);    // 1...1,0...0
  for (let i = 0; i < rede.c; i++) { m[iS + i] = ociosos[i]; m[iA + i] = ocupados[i]; }
  return m;
}

const chave = (m) => m.join(',');

/* --------------------- fechamento de estados evanescentes --------------------- */
function fechaEvanescentes(m, rede, memo) {
  const k = chave(m);
  if (memo.has(k)) return memo.get(k);

  const imediatas = rede.trans.filter((t) => t.tipo === 'imed' && habilitada(m, rede, t));
  let resultado;
  if (imediatas.length === 0) {
    resultado = new Map([[k, { marca: m, prob: 1 }]]);
  } else {
    const total = imediatas.reduce((s, t) => s + t.peso, 0);
    resultado = new Map();
    for (const t of imediatas) {
      const prob = t.peso / total;
      const sucessor = dispara(m, rede, t);
      const parcial = fechaEvanescentes(sucessor, rede, memo);
      for (const [kk, v] of parcial) {
        const atual = resultado.get(kk);
        if (atual) atual.prob += prob * v.prob;
        else resultado.set(kk, { marca: v.marca, prob: prob * v.prob });
      }
    }
  }
  memo.set(k, resultado);
  return resultado;
}

/* --------------------------- avaliacao exata --------------------------- */
function avalia(cfg, opcoes = {}) {
  const rede = criaRede(cfg);
  const memo = new Map();
  const indice = new Map();          // chave -> indice do estado tangivel
  const estados = [];                // { marca, taxaSaida, saidas: Map(key->taxa) }

  const registra = (m) => {
    const k = chave(m);
    if (indice.has(k)) return indice.get(k);
    indice.set(k, estados.length);
    estados.push({ marca: m, taxaSaida: 0, saidas: new Map() });
    return indice.get(k);
  };

  const fila = [registra(rede.marca0)];
  for (let i = 0; i < fila.length; i++) {
    const iEstado = fila[i];
    const est = estados[iEstado];
    for (const t of rede.trans) {
      if (t.tipo !== 'temp' || !habilitada(est.marca, rede, t)) continue;
      const sucessor = dispara(est.marca, rede, t);
      if (sucessor === null) continue;
      est.taxaSaida += t.taxa;
      const alcancaveis = fechaEvanescentes(sucessor, rede, memo);
      for (const [, v] of alcancaveis) {
        const j = registra(v.marca);
        if (j >= fila.length) fila.push(j);
        const kAlvo = chave(v.marca);
        est.saidas.set(kAlvo, (est.saidas.get(kAlvo) || 0) + t.taxa * v.prob);
      }
    }
  }

  const N = estados.length;
  const Q = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    Q[i][i] -= estados[i].taxaSaida;
    for (const [kAlvo, taxa] of estados[i].saidas) {
      Q[i][indice.get(kAlvo)] += taxa;
    }
  }
  const pi = estacionaria(Q);

  // metricas por equacoes de fluxo
  const iQ = rede.idx['P_Q'], iS0 = rede.idx['P_S0'], iV = rede.idx['P_V'];
  const iA0 = rede.idx['P_A0'];
  const soma = (m, ini) => m.slice(ini, ini + rede.c).reduce((s, v) => s + v, 0);
  let eFila = 0, eOcup = 0, pVagasVazias = 0, somaPi = 0;
  for (let i = 0; i < N; i++) {
    const m = estados[i].marca;
    const ociosos = soma(m, iS0);
    const ocupados = soma(m, iA0);
    if (ociosos + ocupados !== rede.c) {
      throw new Error('inconsistencia: um motor nao pode estar livre e ocupado');
    }
    // invariante de vagas: pv + pq = K (o buffer so conta pacotes em espera)
    if (m[iV] + m[iQ] !== rede.K) {
      throw new Error('inconsistencia: conservacao de vagas violada');
    }
    eFila += m[iQ] * pi[i];
    eOcup += ocupados * pi[i];
    if (m[iV] === 0) pVagasVazias += pi[i];
    somaPi += pi[i];
  }
  if (Math.abs(somaPi - 1) > 1e-9) throw new Error('distribuicao nao normalizada');

  const tp = rede.mu * eOcup;
  const dp = pVagasVazias;

  return {
    estados: N,
    estadosSemSimetria: Math.pow(2, rede.c) * (rede.K + 1),
    eFila, eOcup, tp, dp,
    util: eOcup / rede.c,
    mrt: (eFila + eOcup) / tp,
    mqt: eFila / tp,
    mpt: eOcup / tp,
    vazaoBloqueio: rede.lambda * dp,
    residuo: residuo(Q, pi)
  };
}

function residuo(Q, pi) {
  let max = 0;
  for (let j = 0; j < Q.length; j++) {
    let soma = 0;
    for (let i = 0; i < Q.length; i++) soma += pi[i] * Q[i][j];
    max = Math.max(max, Math.abs(soma));
  }
  return max;
}

module.exports = { criaRede, avalia, habilitada, dispara };

/* -------------------------------- CLI -------------------------------- */
if (require.main === module) {
  const c = 4, K = 20;
  const r = avalia({ lambda: 100, mu: 30, c, K });
  console.log('Rede GSPN: motor explicito, c=4, K=20, lambda=100, mu=30');
  console.log(`  estados tangiveis (com reducao por simetria): ${r.estados}`);
  console.log(`  estados se as 2^${c} combinacoes de motores fossem distintas: ${r.estadosSemSimetria}`);
  console.log(`  TP=${r.tp.toFixed(4)} pkt/s  U=${(r.util * 100).toFixed(2)}%  DP=${(r.dp * 100).toFixed(3)}%`);
  console.log(`  MRT=${(r.mrt * 1000).toFixed(2)} ms  MQT=${(r.mqt * 1000).toFixed(2)} ms  MPT=${(r.mpt * 1000).toFixed(2)} ms`);
  console.log(`  soma(pi)=1  residuo ||pi*Q||_inf = ${r.residuo.toExponential(2)}`);
}
