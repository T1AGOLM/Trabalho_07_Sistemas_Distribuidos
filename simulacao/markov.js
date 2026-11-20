'use strict';
/*
 * Utilitários de cadeias de Markov usados por todos os avaliadores do projeto.
 *   resolve(A, b)      -> eliminação de Gauss com pivoteamento parcial
 *   estacionaria(Q)    -> distribuição estacionária de um gerador infinitesimal
 */

function resolve(A, b) {
  const n = b.length;
  const M = A.map((linha, i) => Array.from(linha).concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let lin = col + 1; lin < n; lin++) {
      if (Math.abs(M[lin][col]) > Math.abs(M[piv][col])) piv = lin;
    }
    if (Math.abs(M[piv][col]) < 1e-14) throw new Error('matriz singular');
    [M[col], M[piv]] = [M[piv], M[col]];
    const pivo = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivo;
    for (let lin = 0; lin < n; lin++) {
      if (lin === col) continue;
      const f = M[lin][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[lin][j] -= f * M[col][j];
    }
  }
  return M.map((linha) => linha[n]);
}

function estacionaria(Q) {
  const N = Q.length;
  const A = [];
  for (let j = 0; j < N; j++) {
    const linha = new Float64Array(N);
    for (let i = 0; i < N; i++) linha[i] = Q[i][j];
    A.push(linha);
  }
  const b = new Array(N).fill(0);
  A[N - 1] = new Array(N).fill(1);
  b[N - 1] = 1;
  const pi = resolve(A, b);
  const total = pi.reduce((s, v) => s + v, 0);
  return pi.map((v) => v / total);
}

module.exports = { resolve, estacionaria };
