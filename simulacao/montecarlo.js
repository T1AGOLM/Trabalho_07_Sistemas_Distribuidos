'use strict';
/*
 * Simulador de eventos discretos do roteador (verificação independente).
 *
 * Simula diretamente o sistema físico — chegadas exponenciais, c motores com
 * tempo de serviço exponencial e buffer FIFO de K posições com descarte na
 * chegada — sem reutilizar nenhuma equação do modelo analítico. As métricas
 * são estimadas por médias em 20 lotes independentes, com intervalo de
 * confiança de 95% (aproximação normal), e 10% de aquecimento é descartado.
 *
 * Uso: node simulacao/montecarlo.js
 */

function rng(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expo(rate, u) {
  return -Math.log(1 - u) / rate;
}

function simula({ lambda, mu, c, K, chegadas = 200000, semente = 12345, lotes = 20 }) {
  const u = rng(semente);
  const fila = [];                 // instantes de chegada dos pacotes em espera
  const fim = new Array(c).fill(Infinity); // instante de término de cada motor
  let t = 0, tUlt = 0, numOcup = 0, tempoOcupado = 0;

  const aquecimento = Math.floor(chegadas * 0.1);
  const porLote = Math.floor((chegadas - aquecimento) / lotes);
  const amostras = [];
  let lote = { dur: null, tIni: 0, aceitos: 0, descartes: 0, somaResposta: 0, somaEspera: 0, ocupado: 0, pedidos: 0 };
  let recebidos = 0;
  let pacotesEstimados = 0; // pacotes usados na estimacao (apos aquecimento)

  const proximaChegada = () => t + expo(lambda, u());
  let tChegada = proximaChegada();

  const proximoFim = () => {
    let idx = 0;
    for (let i = 1; i < c; i++) if (fim[i] < fim[idx]) idx = i;
    return idx;
  };

  const avanca = (tNovo) => {
    tempoOcupado += numOcup * (tNovo - t);
    t = tNovo;
  };

  const fechaLote = () => {
    const dur = t - lote.tIni;
    if (lote.pedidos > 0 && lote.aceitos > 0) {
      amostras.push({
        tp: lote.aceitos / dur,
        util: lote.ocupado / (c * dur),
        mrt: lote.somaResposta / lote.aceitos,
        mqt: lote.somaEspera / lote.aceitos,
        dp: lote.descartes / lote.pedidos
      });
    }
    lote = { dur: null, tIni: t, aceitos: 0, descartes: 0, somaResposta: 0, somaEspera: 0, ocupado: 0, pedidos: 0 };
  };

  let emAquecimento = true;
  let contaLote = 0;

  while (recebidos < chegadas) {
    const iFim = proximoFim();
    const tProx = Math.min(tChegada, fim[iFim]);
    const chegouAntes = tChegada <= fim[iFim];

    if (!emAquecimento) lote.ocupado += numOcup * (tProx - t);
    avanca(tProx);

    if (recebidos === aquecimento) {
      emAquecimento = false;
      lote.tIni = t;
    }

    if (chegouAntes) {
      // chegada
      recebidos++;
      if (!emAquecimento) { lote.pedidos++; pacotesEstimados++; }
      const livre = numOcup < c;
      if (livre) {
        // motor livre: entra direto em serviço (nao ocupa buffer)
        let idx = 0;
        while (fim[idx] !== Infinity && idx < c) idx++;
        if (idx === c) idx = proximoFim();
        const servico = expo(mu, u());
        fim[idx] = t + servico;
        numOcup++;
        if (!emAquecimento) { lote.aceitos++; lote.somaResposta += servico; }
      } else if (fila.length < K) {
        fila.push(t);
        if (!emAquecimento) lote.aceitos++;
      } else if (!emAquecimento) {
        lote.descartes++;
      }
      tChegada = proximaChegada();
    } else {
      // término de transmissão
      fim[iFim] = Infinity;
      numOcup--;
      if (fila.length > 0) {
        const chegada = fila.shift();
        const servico = expo(mu, u());
        fim[iFim] = t + servico;
        numOcup++;
        if (!emAquecimento) {
          lote.somaEspera += t - chegada;
          lote.somaResposta += (t - chegada) + servico;
        }
      }
    }

    if (!emAquecimento) {
      contaLote++;
      if (contaLote >= porLote) { fechaLote(); contaLote = 0; }
    }
  }
  if (lote.pedidos > 0) fechaLote();

  const media = (chave) => amostras.reduce((s, a) => s + a[chave], 0) / amostras.length;
  const ic = (chave) => {
    const m = media(chave);
    const v = amostras.reduce((s, a) => s + (a[chave] - m) ** 2, 0) / (amostras.length - 1);
    const meia = 1.96 * Math.sqrt(v / amostras.length);
    return { media: m, meia, erroPadrao: Math.sqrt(v / amostras.length) };
  };

  const r = {
    tp: ic('tp'), util: ic('util'), mrt: ic('mrt'), dp: ic('dp'),    mqt: ic('mqt'),
    amostras: amostras.length,
    n: pacotesEstimados
  };
  r.mpt = { media: 1 / mu, meia: 0, erroPadrao: 0 };
  return r;
}

module.exports = { simula };

if (require.main === module) {
  const r = simula({ lambda: 100, mu: 30, c: 4, K: 20 });
  const f = (x, e, d = 3) => `${x.toFixed(d)} ± ${e.toFixed(d)}`;
  console.log('Simulação de eventos discretos, 200 mil chegadas, 20 lotes, IC 95%:');
  console.log(`  TP  = ${f(r.tp.media, r.tp.meia, 2)} pkt/s`);
  console.log(`  U   = ${f(r.util.media * 100, r.util.meia * 100, 2)} %`);
  console.log(`  MRT = ${f(r.mrt.media * 1000, r.mrt.meia * 1000, 2)} ms`);
  console.log(`  MQT = ${f(r.mqt.media * 1000, r.mqt.meia * 1000, 2)} ms`);
  console.log(`  DP  = ${f(r.dp.media * 100, r.dp.meia * 100, 3)} %`);
}
