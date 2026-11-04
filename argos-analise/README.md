# ARGOS GeoVigilância · Grupo 4 · tabelas de análise

Tabelas de análise construídas sobre as mesmas fontes do projeto da AV1 (ovitrampas × estações disseminadoras de larvicida, Recife, ciclos 1 a 12 de 2026), organizadas para as quatro disciplinas: **Python** (Engenharia de Dados), **MongoDB/Atlas**, **R** e **Análise e Visualização de Dados**.

Os números partem do banco limpo do próprio grupo (`dados/argos.db`, o mesmo `saida/argos.db` do pacote da AV1), então batem com o relatório de racionalização. Se o grupo rodar o pipeline de novo, troque esse arquivo e rode `python gerar_tabelas.py`.

## O que tem aqui

| Pasta / arquivo | Para quê |
| --- | --- |
| `ARGOS_tabelas_de_analise.xlsx` | as 17 tabelas de análise (T00–T15) + dimensões, com LEIA-ME na primeira aba |
| `tabelas/` | as mesmas tabelas em CSV + o **modelo dimensional**: `fato_leitura` (31.455 linhas), `dim_ovt` (2.871), `dim_edl` (378), `dim_ciclo` (12) |
| `gerar_tabelas.py` | gera tudo (CSV, Excel, JSON do Mongo, gráficos) a partir de `dados/argos.db` |
| `mongo/` | coleções em JSON Lines, `carregar_atlas.py` e `consultas_agregacao.py` |
| `r/analise_argos.R` | as principais tabelas e 12 gráficos em R (tidyverse) |
| `graficos/` | 12 gráficos em PNG (matplotlib: barras e mapas de calor) + `todos_os_graficos.pdf` |

## Como rodar

```bash
pip install -r requirements.txt
python gerar_tabelas.py          # regenera tabelas, Excel, mongo/*.jsonl e graficos/
```

**MongoDB Atlas**

```bash
export MONGODB_URI="mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/"   # a senha fica só no ambiente, nunca no código
python mongo/carregar_atlas.py              # cria o banco "argos" com 3 coleções e os índices
python mongo/consultas_agregacao.py         # roda as 6 consultas
python mongo/consultas_agregacao.py --simulado   # sem servidor (mongomock), para treinar
```

No Atlas é preciso um cluster, um usuário de banco e liberar o seu IP em *Network Access*. Também dá para importar com o `mongoimport` ou o Compass (os `.jsonl` usam Extended JSON para as datas).

**R**: `Rscript r/analise_argos.R` na pasta do projeto (precisa do pacote `tidyverse`). Gera `graficos_r/`.

## Modelagem

**Relacional / R / Excel**: esquema em estrela. `fato_leitura` tem 1 linha por OVT e ciclo, com A, P, O já calculados, e liga a `dim_ovt`, `dim_edl` e `dim_ciclo`. Cada indicador sai de somar A, P, O no grupo e dividir depois.

**MongoDB**: a `ovitrampas` tem 1 documento por OVT com as **12 leituras embutidas** (sempre lidas junto com a OVT, no máximo 12 por documento), a **EDL mais próxima embutida** (a consulta "dentro de 400 m" não precisa de join) e a posição em **GeoJSON** com índice `2dsphere`. A `edl_locais` fica separada e é ligada por `$lookup` quando preciso (consulta 5). A `indicadores_ds_ciclo` guarda valores pré-calculados.

## As tabelas

| Aba | Conteúdo |
| --- | --- |
| T00 | conferências internas (somas por grupo = total etc.) e avisos |
| T01 | visão geral da base e do Recife |
| T02 | por ciclo (com nº de OVTs por ciclo) |
| T03 | por distrito sanitário, com EDL e % de OVTs a até 300/400 m |
| T04 / T04b | DS × ciclo (longo) e matriz de calor do IDV |
| T05 | 86 bairros, amostras adequadas primeiro, EDL ligadas pelo nome |
| T06 | por faixa de distância até a EDL mais próxima |
| T07 | dentro × fora de 300 e 400 m, Recife e cada DS |
| T08 | estatística descritiva dos ovos por leitura |
| T09 | códigos de coleta (F, E, R, D, REC) por ciclo |
| T10 | correlação de Spearman entre distância à EDL e IDV de cada OVT |
| T11 | qualidade da posição e da data das EDL |
| T12 | antes × depois da instalação da EDL mais próxima |
| T13 | DS × faixa de distância (base do mapa de calor g10) |
| T14 | ciclo × faixa de distância (base do g11) |
| T15 | bairro × ciclo (base do g12) |

## Os gráficos

| Arquivo | Tipo | O que mostra |
| --- | --- | --- |
| g1 | linha | IDV por ciclo, Recife |
| g2 | barras | IDV por faixa de distância até a EDL mais próxima |
| g3 | **mapa de calor** | IDV por DS × ciclo |
| g4 | barras | IDV dentro × fora de 400 m, por DS |
| g5 | barras | IDV por distrito sanitário |
| g6 | barras horizontais | 10 bairros de maior e 10 de menor IDV (só os 28 com ≥ 300 armadilhas) |
| g7 | barras | diferença de IDV dentro − fora de 400 m, por DS |
| g8 | barras | IDV antes × depois da instalação da EDL mais próxima |
| g9 | barras | % de leituras sem resultado por ciclo |
| g10 | **mapa de calor** | IDV por DS × faixa de distância |
| g11 | **mapa de calor** | IDV por ciclo × faixa de distância |
| g12 | **mapa de calor** | IDV por bairro × ciclo (28 bairros) |

Nos mapas de calor, células com poucas armadilhas aparecem em *itálico com asterisco* (menos de 100 em g10 e g11; menos de 30 em g12). No g12 cada célula tem em média cerca de 50 armadilhas, então ele serve para ver padrões (por exemplo, o ciclo 6 baixo em quase todos os bairros), não para comparar dois bairros em um ciclo só. As versões em R (`graficos_r/`) têm os mesmos 12 gráficos.

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
- **Amostra pequena** (menos de 300 armadilhas examinadas) está marcada em T05, T06 e T07; 58 dos 86 bairros caem aí. Em T13 e T14 o limite é 100 por célula (2 células de T13 e 12 de T14, todas em "acima de 1.000 m" ou DS II 600–1.000 m); em T15, 58 das 336 células têm menos de 30 armadilhas.

## O que foi verificado

- Todas as tabelas batem com os CSVs do grupo (`saida/`) e com `evidencias/conferencia.md` (raios de 300 e 400 m, faixas, antes × depois, por DS, por ciclo, OVT CDB2010), e com as **planilhas originais** (31.455 leituras; 5.907.811 ovos lidos, mais 201.564 preenchidos pela média, total 6.109.375).
- As consultas 1 a 5 do Mongo rodaram em `mongomock` e dão os mesmos números das tabelas.
- Os CSVs foram lidos em R (base) e reproduzem os valores esperados do script, incluindo os rótulos das faixas com travessão. T13, T14 e T15 também foram recalculadas em R base e batem com as de Python (50, 84 e 336 células; mesmas células pequenas).
- Os 12 PNGs de Python foram abertos e conferidos um a um (rótulos, eixos, legendas).

## O que **não** foi testado

- **`r/analise_argos.R` não foi executado** (inclusive os gráficos g5 a g12 em ggplot2, que você nunca viu renderizados aqui): o ambiente em que foi escrito não tinha tidyverse/ggplot2. A lógica e os dados foram validados em R base, mas se algum comando do tidyverse acusar erro, é a primeira coisa a olhar. O script tem `stopifnot` no início e valores `# esperado` nos comentários para você conferir.
- **Carga no Atlas, índices `2dsphere` e a consulta 6 (geoespacial)** não foram rodados em servidor MongoDB real. Valor esperado da consulta 6: **18 OVTs** a até 400 m do local DS2-L067 (Policlínica Amauri Coutinho).
- O Excel foi aberto e conferido no LibreOffice, não no Microsoft Excel.
