# Trabalho 07 — Modelagem e Avaliação de Desempenho com SPN

**Contexto escolhido:** 7 — Rede de Computadores na Universidade (roteador com buffer limitado).

## Estrutura

```
artigo.tex              artigo IEEE (conference, 2 colunas) — arquivo único, sem dependências externas
modelo/modelo_spn.md    especificação do modelo SPN (lugares, transições, arcos, marcação)
simulacao/markov.js     solver de cadeias de Markov (Gauss + pi*Q = 0)
simulacao/spn.js        avaliador analítico da cadeia agregada; gera resultados/*.csv
simulacao/gspn.js       motor GSPN genérico (alcançabilidade, evanescentes, EMC)
simulacao/montecarlo.js simulador de eventos discretos com IC 95%
simulacao/validacao.js  cruza os três avaliadores e escreve resultados/validacao.csv
modelo/desenho_para_jupiter.md  o desenho a reproduzir no Jupiter (lugares, arcos, marcação)
resultados/*.csv        resultados de E1–E4 + tabela consolidada + validação
figuras/spn_diagrama.svg        desenho do modelo (poster/slides/redesenho)
figuras/diagrama_spn.js         gerador desse desenho
figuras/fig1..fig5_*.svg        gráficos dos experimentos
figuras/graficos.js     gerador dos gráficos a partir dos CSVs
```

## Como os resultados foram verificados

O mesmo modelo é avaliado por **três caminhos independentes**:

1. **analítico** (`spn.js`) — resolve a cadeia agregada `(q,b)`;
2. **GSPN** (`gspn.js`) — enumera as marcações alcançáveis da rede declarada, trata os
   estados evanescentes das transições imediatas por peso e resolve a cadeia resultante;
3. **simulação** (`montecarlo.js`) — simula o sistema físico com 200 mil chegadas e IC 95%.

`node simulacao/validacao.js` compara os três em 15 configurações, confere a recursão fechada
de M/M/c com sala de espera K e o balanço `TP = λ(1 − DP)`, e sai com código 1 se algo
divergir. Estado atual: **todas as verificações passam** (analítico e GSPN coincidem
exatamente; a simulação confirma dentro do intervalo de confiança).

## Como compilar o artigo

1. Overleaf → *New Project* → *Upload Project* → envie `artigo.tex` (basta esse arquivo).
2. Compilador: **pdfLaTeX**. `IEEEtran`, `pgfplots`, `tikz` e `booktabs` já vêm no TeX Live do Overleaf.
3. O artigo não lê arquivos externos: os pontos dos gráficos estão embutidos como `coordinates`.

## Como reproduzir os resultados

```bash
node simulacao/spn.js          # avalia o modelo e grava resultados/*.csv (E1–E4)
node simulacao/gspn.js         # mesmo modelo pelo motor GSPN (rede explícita)
node simulacao/montecarlo.js   # verificação por simulação de eventos discretos
node simulacao/validacao.js    # cruza os três -> resultados/validacao.csv
node figuras/graficos.js       # gera figuras/fig1..fig5_*.svg
node figuras/diagrama_spn.js   # gera figuras/spn_diagrama.svg (desenho do modelo)
```

Não há dependências: só Node. Nenhum script lê o artigo; o artigo tem os pontos embutidos.

## Antes de entregar (pendências do aluno)

- [ ] Substituir `Nome do Autor`, instituição e e-mail no `artigo.tex`.
- [ ] Substituir `https://github.com/USUARIO/trabalho07-spn` pelo link real do repositório.
- [ ] Substituir `https://youtu.be/SEU_VIDEO` pelo link do vídeo de 5 minutos.
- [ ] Conferir a paginação final no Overleaf (o alvo é exatamente 6 páginas; ajustar figuras/tabelas se necessário).
- [ ] Publicar este projeto no GitHub e anexar o PDF no SIGAA.

## Sobre o Jupiter

O Jupiter é o editor de desenho usado na disciplina: ele serve para montar o grafo da rede, não
para calcular as métricas. O fluxo do trabalho, portanto, é:

1. **modelo e avaliação** — feitos aqui, com três avaliadores e verificação cruzada;
2. **desenho no Jupiter** — reproduzir a rede seguindo `modelo/desenho_para_jupiter.md`, usando
   `figuras/spn_diagrama.svg` como referência visual;
3. **vídeo** — apresentar o desenho e os resultados de `resultados/`.

Ao redesenhar, mantenha nomes, arcos, marcação inicial e sentidos idênticos — em especial o
par (`P_S_i`, `P_A_i`) por motor (um lugar por motor, não um lugar com `c` tokens) e a vaga
devolvida no despacho (`I_DES_i → P_V`), não no fim da transmissão. Esses dois pontos são o que
fazem o desenho corresponder ao modelo efetivamente avaliado.
