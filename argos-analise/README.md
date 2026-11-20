# ARGOS GeoVigilância · Grupo 4 · tabelas de análise

Tabelas de análise construídas sobre as mesmas fontes do projeto da AV1 (ovitrampas × estações disseminadoras de larvicida, Recife, ciclos 1 a 12 de 2026), organizadas para as disciplinas de **Python** (Engenharia de Dados), **R** e **Análise e Visualização de Dados**.

Os números partem do banco limpo do próprio grupo (`dados/argos.db`, o mesmo `saida/argos.db` do pacote da AV1), então batem com o relatório de racionalização. Se o grupo rodar o pipeline de novo, troque esse arquivo e rode `python gerar_tabelas.py`.

## O que tem aqui

| Pasta / arquivo | Para quê |
| --- | --- |
| `ARGOS_tabelas_de_analise.xlsx` | as 17 tabelas de análise (T00–T15) + dimensões, com LEIA-ME na primeira aba |
| `tabelas/` | as mesmas tabelas em CSV + o **modelo dimensional**: `fato_leitura` (31.455 linhas), `dim_ovt` (2.871), `dim_edl` (378), `dim_ciclo` (12) |
| `gerar_tabelas.py` | gera tudo (CSV, Excel, gráficos) a partir de `dados/argos.db` |
| `modelo_barras_interativas.html` | modelo da página com filtros; o `gerar_tabelas.py` preenche com os dados |
| `r/analise_argos.R` | as principais tabelas e 11 gráficos em R (tidyverse) |
| `graficos/` | 7 PNGs (matplotlib) + `todos_os_graficos.pdf` + **`barras_com_filtros.html`** (abra no navegador) |

## Como rodar

```bash
pip install -r requirements.txt
python gerar_tabelas.py          # regenera tabelas, Excel e graficos/ (inclui barras_com_filtros.html)
```

**R**: `Rscript r/analise_argos.R` na pasta do projeto (precisa do pacote `tidyverse`). Gera `graficos_r/`.

## Modelagem

**Relacional / R / Excel**: esquema em estrela. `fato_leitura` tem 1 linha por OVT e ciclo, com A, P, O já calculados, e liga a `dim_ovt`, `dim_edl` e `dim_ciclo`. Cada indicador sai de somar A, P, O no grupo e dividir depois.


## As tabelas

| Aba | Conteúdo |
| --- | --- |
| T00 | conferências internas (somas por grupo = total etc.) e avisos |
| T01 | visão geral da base e do Recife |
| T02 | por ciclo (com nº de OVTs por ciclo) |
| T03 | por distrito sanitário, com EDL e % de OVTs a até 300/400 m |
| T04 / T04b | DS × ciclo (longo) e matriz DS × ciclo do IDV |
| T05 | 86 bairros, amostras adequadas primeiro, EDL ligadas pelo nome |
| T06 | por faixa de distância até a EDL mais próxima |
| T07 | dentro × fora de 300 e 400 m, Recife e cada DS |
| T08 | estatística descritiva dos ovos por leitura |
| T09 | códigos de coleta (F, E, R, D, REC) por ciclo |
| T10 | correlação de Spearman entre distância à EDL e IDV de cada OVT |
| T11 | qualidade da posição e da data das EDL |
| T12 | antes × depois da instalação da EDL mais próxima |
| T13 | DS × faixa de distância (mesmos números do gráfico V1) |
| T14 | ciclo × faixa de distância (V2) |
| T15 | bairro × ciclo (V4) |

## Os gráficos

**Barras com filtros** (`graficos/barras_com_filtros.html`, abre no navegador, sem internet): no mesmo estilo do V2 do painel do grupo. Escolha o filtro no menu, o indicador (IDV, IPO ou IDO) e veja as barras; "Ver tabela equivalente" mostra os números. Cada barra soma A, P e O das leituras do recorte e só depois divide. Barra clara com "amostra pequena" = menos armadilhas que o mínimo do gráfico.

| Gráfico | Filtro (menu) | Barras | Mínimo de armadilhas |
| --- | --- | --- | --- |
| V1 | distrito sanitário (Todos, I a VIII) | faixa de distância até a EDL; azul = dentro de 400 m, laranja = fora | 300 |
| V2 | ciclo (Todos, 1 a 12) | faixa de distância, mesma leitura de V1 | 100 |
| V3 | distrito sanitário | ciclos 1 a 12 | 100 |
| V4 | **bairro, um a um** (86; os de amostra adequada primeiro) | ciclos 1 a 12 | 30 |
| V5 | distrito sanitário (Todos, I a VIII) | **ranking de bairros** (barras horizontais, do maior para o menor; azul acima do recorte, laranja abaixo); caixa para incluir bairros de amostra pequena | 300 |
| V6 | distrito sanitário (Todos, I a VIII) | **linha do tempo**: ciclos 1 a 12, linha azul dentro e laranja fora de 400 m; a faixa clara marca a metade central das datas de instalação das EDL (antes à esquerda, depois à direita) | sem mínimo |

**PNGs** (`graficos/`, também no PDF):

| Arquivo | Tipo | O que mostra |
| --- | --- | --- |
| g1 | linha | IDV por ciclo, Recife |
| g2 | barras | IDV por faixa de distância até a EDL mais próxima |
| g4 | barras | IDV dentro × fora de 400 m, por DS |
| g5 | barras | IDV por distrito sanitário |
| g6 | barras horizontais | 10 bairros de maior e 10 de menor IDV (só os 28 com ≥ 300 armadilhas); a versão com filtro por distrito é o V5 do HTML |
| g7 | barras | diferença de IDV dentro − fora de 400 m, por DS |
| g9 | barras | % de leituras sem resultado por ciclo |

(Não há mais mapas de calor. A numeração pula g3, g8 e g10 a g12 porque viraram o HTML: o antes × depois, antes em barras (g8), agora é o V6. A tabela T12 continua com os números do antes × depois.) Em V4, cada barra de um bairro tem poucas armadilhas (mediana ≈ 50 por ciclo): serve para ver o padrão ao longo do ano, não para comparar dois bairros em um ciclo só. No R, `graficos_r/` ainda tem o g8 em barras e g1, g2, g4 a g9 e g10 a g12 em barras por painel (um painel por DS, por ciclo e, para bairros, os 12 de maior IDV).

## Leitura rápida (descritiva, não causal)

- **IPO não discrimina**: 98,4% no Recife e ~98% em quase todo recorte. Para comparar, use IDV (200,5 no Recife) e IDO.
- **Dentro × fora**: o IDV é 205,2 a até 400 m e 188,2 além (+9%); a 300 m, 209,2 contra 190,8 (+10%). **Mas a direção não se repete em todos os DS**: é maior dentro nos DS II, IV, VI, VII e VIII (o DS IV e o VIII chegam a +50), e menor dentro nos DS III e V (−4 a −5) e no DS I (−53, mas com só 283 armadilhas do lado de fora).
- **Distância**: o IDV fica entre 195 e 214 até 600 m e só cai além disso (174 em 600–1.000 m; 153 acima de 1.000 m). A correlação de Spearman é −0,08 (desprezível); só o DS IV chega a −0,31 (moderada).
- **Antes × depois**: dentro de 400 m, +0,6% (202,8 → 203,9); fora, −0,1%. A 300 m, +2,8% contra −2,0%. Só entram os locais com data de instalação.
- **O tempo pesa mais que o espaço**: o IDV varia de 151 a 247 entre ciclos (razão de 1,6), muito mais que qualquer diferença perto × longe.

## Cuidados com os dados

- **Associação, não eficácia**: nada aqui controla chuva, sazonalidade nem outras ações de controle (mesma ressalva do relatório).
- **333 OVTs, todas do DS V, só entram no ciclo 10** (3 leituras cada). A amostra muda de 2.538 para 2.871 OVTs; compare ciclos com cuidado, de preferência dentro de cada DS.
- **EDL**: 180 de 378 locais não tinham coordenada. 174 foram posicionados pelo endereço (estimativa) e 6 ficaram sem posição. 176 locais não têm data de instalação.
- **DS de 2 OVTs** (SJS1005 e MGR5013) difere entre cadastro e observações. Os indicadores usam o DS das observações; a contagem de OVTs e a cobertura em T03 usam o do cadastro, como no relatório.
- **Bairro das EDL** é texto livre; em T05 foram ligados ao bairro das OVTs pelo nome normalizado (324 de 378 locais, 77 bairros). Não usei os polígonos de bairro do painel porque o próprio painel os marca como aproximados.
- **Amostra pequena** (menos de 300 armadilhas examinadas) está marcada em T05, T06 e T07; 58 dos 86 bairros caem aí. Em T13 e T14 o limite é 100 por célula (2 células de T13 e 12 de T14, todas em "acima de 1.000 m" ou DS II 600–1.000 m); em T15, 58 das 336 células têm menos de 30 armadilhas (os limites de V1 a V4 estão na tabela dos gráficos).

## O que foi verificado

- Todas as tabelas batem com os CSVs do grupo (`saida/`) e com `evidencias/conferencia.md` (raios de 300 e 400 m, faixas, antes × depois, por DS, por ciclo, OVT CDB2010), e com as **planilhas originais** (31.455 leituras; 5.907.811 ovos lidos, mais 201.564 preenchidos pela média, total 6.109.375).
- O `barras_com_filtros.html` foi aberto em Chromium: todas as opções de cada menu (9, 13, 9, 86 e 9 no V5, com e sem bairros de amostra pequena, e 9 no V6) e os três indicadores rodaram sem erro. Os valores do DS I (181,2 · 188,4 · 136,2 · 147,8 · 216,0, com 38 · 84 · 76 · 52 · 24 OVTs) batem com o painel do grupo e com um recálculo em pandas. As somas de A, P e O dos dados do HTML são checadas contra a base no `gerar_tabelas.py`.
- Os CSVs foram lidos em R (base) e reproduzem os valores esperados do script, incluindo os rótulos das faixas com travessão. T13, T14 e T15 também foram recalculadas em R base e batem com as de Python (50, 84 e 336 células; mesmas células pequenas).
- Os PNGs de Python foram abertos e conferidos (rótulos, eixos, legendas).

## O que **não** foi testado

- **`r/analise_argos.R` não foi executado** (inclusive os gráficos g5 a g12 em ggplot2, que nunca foram vistos renderizados): o ambiente em que foi escrito não tinha tidyverse/ggplot2. A lógica e os dados foram validados em R base, mas se algum comando do tidyverse acusar erro, é a primeira coisa a olhar. O script tem `stopifnot` no início e valores `# esperado` nos comentários para você conferir.
- V6: no DS II, ciclo 3, o IDV é 284,9 dentro e 310,7 fora, igual ao recálculo em pandas. A faixa usa só as 180 EDL com data de dia exato (22 têm só o mês e 176 não têm data).
- No celular o gráfico HTML rola para os lados (largura mínima de 640 px); só foi testado em Chromium, não em Safari ou Firefox.
- O Excel foi aberto e conferido no LibreOffice, não no Microsoft Excel.
