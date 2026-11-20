# g4-projeto-2-dados · ARGOS GeoVigilância

Projeto do Grupo 4 (Análise de Dados, CESAR School 2026.2) com a GEVACZ, a Vigilância Ambiental da Prefeitura do Recife.

A pergunta central do projeto é: **as Estações Disseminadoras de Larvicida (EDL) reduzem a quantidade de ovos de *Aedes aegypti* nas ovitrampas (OVT) instaladas num raio de 300 a 400 m?** Os termos usados no projeto estão em [`GLOSSARIO.md`](GLOSSARIO.md), e o planejamento CRISP-DM está em [`docs/planejamento-crispdm.md`](docs/planejamento-crispdm.md).

O repositório tem três partes independentes:

| Parte | Pasta | O que faz |
| --- | --- | --- |
| **Pipeline ETL** | `main.py`, `src/` | Baixa as planilhas da GEVACZ de um bucket S3, limpa os dados e grava em SQLite (e, se configurado, no Postgres do Neon) |
| **Análise** | `argos-analise/` | Lê o banco já limpo e gera as tabelas de análise, o modelo dimensional, as coleções do MongoDB e os gráficos (Python e R) |
| **Frontend** | `frontend/` | Protótipo web para cadastrar OVT e EDL, registrar coletas e contagens de ovos |

```
planilhas .xlsx (bucket S3 do Neon)
        │  src/extract.py      baixa e lê tudo como texto
        ▼
   DataFrames brutos
        │  src/transform.py    limpa colunas, datas, coordenadas, DS
        ▼
   DataFrames limpos
        │  src/load.py + src/sqlite_schema.py
        ▼
 saida/*.db (SQLite)  ──►  Neon/Postgres (opcional)
        │
        ▼
 argos-analise/gerar_tabelas.py  ──►  CSV · Excel · JSONL (Mongo) · gráficos PNG/PDF
```

---

## 1. Pipeline ETL (`main.py` + `src/`)

### Como funciona

`main.py` executa três cargas em sequência. Cada uma segue o caminho **extrair → transformar → carregar**:

| Função | Planilha de origem | Banco gerado | Tabelas |
| --- | --- | --- | --- |
| `ovitrampas()` | `Dados_2026/Total Ovtrampas.xlsx` (aba `CICLO 1`) | `saida/total_ovt.db` | `ovt` |
| `edl_por_ds()` | `Dados_2026/TOTAL DE EDL POR DS.xlsx` (todas as abas) | `saida/edl_por_ds.db` | `edl_ds_i` … `edl_ds_viii`, `edl_total_por_ds`, `edl_total_por_bairro` |
| `georreferenciamento()` | `Dados_2026/Georreferenciamento OVT 2026 ATUALIZAÇÃO.xlsx` (todas as abas) | `saida/georreferenciamento_ovt.db` | `georef_ovt_ds_i` … `georef_ovt_ds_viii` |

Os caminhos `Dados_2026/...` são **chaves dentro do bucket S3**. Não são arquivos locais.

#### `src/extract.py`: extração
- Cria um cliente `boto3` para o Object Storage do Neon, uma única vez (`@cache`). As credenciais vêm do `.env`.
- `extrair(chave, aba, header)` baixa o arquivo para a memória e o lê com `pandas.read_excel`. **Todas as colunas são lidas como texto** (`dtype=str`), e valores como `-`, `N/A`, `#DIV/0!` e `#N/D` viram nulos. Com `aba=None`, a função devolve um dicionário `{nome_da_aba: DataFrame}`.

#### `src/transform.py`: limpeza
As planilhas são preenchidas à mão e têm muitas inconsistências. As funções auxiliares tratam cada uma delas:

| Função | O que resolve | Exemplo |
| --- | --- | --- |
| `normalizar_nome` | Nome de coluna em `snake_case`, sem acento | `'Agente / Matrícula'` → `'agente_matricula'` |
| `texto_limpo`, `juntar` | Espaços extras, células vazias, junção de células | `'  a   b '` → `'a b'` |
| `ds_romano` | Distrito sanitário em algarismos romanos, a partir do nome da aba | `'DS 1 - TOTAL'` → `'I'` |
| `coordenadas` | Latitude e longitude em qualquer formato: decimal, GMS (`8°7'34"S`), GMS sem símbolos, ponto perdido pelo Excel, colunas trocadas. Valores fora da caixa do Recife viram `None` | `('-8.0518288','-34.916')` → `(-8.0518288, -34.916)` |
| `para_data` | Datas ISO ou `dd/mm/aaaa` → `AAAA-MM-DD`. Descarta anos absurdos (ex.: 3036) | `'20/05/2026'` → `'2026-05-20'` |
| `data_instalacao` | Data de instalação escrita em texto livre | `'Instalada em 16/05/2026'` → `'2026-05-16'` |
| `area_m2` | Área em m² escrita como texto | `'3,7 MIL M²'` → `3700.0` |

Em seguida, cada planilha tem seu transformador:
- **`transformar`** (ovitrampas): remove colunas `Unnamed`, separa `agente / matrícula`, converte números e datas, remove linhas vazias e duplicadas.
- **`transformar_edl`** (uma aba por DS): a aba tem vários blocos (`EDL - PONTO ESTRATÉGICO…`, `EDL - OUTROS EQUIPAMENTOS`…), uma linha `TOTAL` e às vezes um bloco `RETIRADO`. A função localiza as colunas pelo texto do cabeçalho, porque cada aba tem um layout diferente. O resultado é uma tabela única com `categoria` e `situacao` (`ATIVA`/`RETIRADA`).
- **`transformar_resumo_edl`**: separa a aba de resumo em duas tabelas, uma com o total por DS e outra com o total por bairro.
- **`transformar_georef`**: padroniza o `id_ovt` (`'SAM 1001'` → `'SAM1001'`, no mesmo formato de `total_ovt.db`) e trata coordenadas e datas.

#### `src/sqlite_schema.py` e `src/load.py`: carga
- `sqlite_schema.py` contém o DDL de cada tabela, com chaves, `CHECK`, `UNIQUE` e índices.
- `carregar()` **recria a tabela a cada execução**, porque a planilha é a fonte da verdade. Assim, rodar o pipeline de novo substitui os dados em vez de duplicá-los. O `DROP` + `CREATE` + `INSERT` acontecem numa única transação: se algo falhar, a versão anterior da tabela é mantida.
- Depois do SQLite, a mesma tabela é gravada no **Neon (Postgres)**. `para_postgres()` converte o DDL (`AUTOINCREMENT` → `IDENTITY`, `REAL` → `DOUBLE PRECISION`). Sem `NEON_DB` no `.env`, ou se o Neon falhar, o programa mostra só um aviso e o SQLite continua valendo.

O arquivo `dados/alteracoes_planilhas_2026-10-27.csv` registra as correções feitas à mão nas planilhas originais (célula, valor antigo, valor novo e motivo).

### Como executar

Pré-requisito: Python 3.11 ou superior. O código usa sintaxe `X | None`; o `requirements.txt` fixa `pandas 3.0`.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # preencha as variáveis abaixo
python main.py
```

Variáveis do `.env`:

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | sim | Acesso ao Object Storage do Neon |
| `S3_BUCKET` | sim | Bucket que contém a pasta `Dados_2026/` |
| `NEON_DB` | não | URL do Postgres (`postgres://…`). Sem ela, a carga vai só para o SQLite |

Saída esperada (uma linha por aba):

```
Lidas N linhas da aba 'CICLO 1' de Dados_2026/Total Ovtrampas.xlsx
Restaram M linhas após a limpeza
Tabela 'ovt' agora tem M registros em saida/total_ovt.db
Aba 'DS 1 - TOTAL' -> tabela 'edl_ds_i' com X registros em saida/edl_por_ds.db
...
```

> As planilhas e os `.db` gerados estão no `.gitignore` porque contêm dados do parceiro. Sem acesso ao bucket, não é possível rodar o `main.py` de ponta a ponta, mas dá para testar as transformações (próxima seção).

### Como testar

O pipeline ainda não tem testes automatizados. As funções de `src/transform.py` são puras e podem ser testadas sem bucket nem banco. Na raiz do repositório:

```bash
python -c "
import src.transform as t
assert t.ds_romano('DS 1 - TOTAL') == 'I'
assert t.ds_romano('DISTRITO SANITÁRIO III') == 'III'
assert t.coordenadas('-8.0518288', '-34.916') == (-8.0518288, -34.916)
lat, lon = t.coordenadas('8°7\'34.735\"S', '34°53\'14\"W')
assert -8.2 < lat < -7.9 and -35.05 < lon < -34.8
assert t.coordenadas('-34.916', '-8.0518288') == (-8.0518288, -34.916)  # colunas trocadas
assert t.coordenadas('-12.5', '-40.1') == (None, None)                 # fora do Recife
assert t.area_m2('3,7 MIL M²') == 3700.0
assert t.data_instalacao('Instalada em 16/05/2026') == '2026-05-16'
assert t.data_instalacao('INSTALAÇÃO ABRIL 2026') == '2026-04'
assert t.normalizar_nome('Agente / Matrícula') == 'agente_matricula'
print('ok')
"
```

Para testar a carga sem S3 nem Neon, monte um DataFrame pequeno e grave num SQLite temporário:

```bash
python -c "
from pathlib import Path
import pandas as pd, sqlite3
import src.load as load, src.sqlite_schema as schema
df = pd.DataFrame([{'ds':'I','bairro':'A','locais':1,'edls':2}])
db = Path('saida/teste.db')
print(load.carregar(df, db, 'resumo', schema.criar_tabela_resumo_bairro('resumo')))  # 1
print(load.carregar(df, db, 'resumo', schema.criar_tabela_resumo_bairro('resumo')))  # 1 de novo: não duplica
"
rm saida/teste.db
```

Sem `NEON_DB` definido, o teste mostra antes `Aviso: NEON_DB não definido no .env, gravando só no SQLite`. Isso é esperado.

Depois de rodar o `main.py`, confira os bancos com `sqlite3 saida/total_ovt.db ".tables"` ou num visualizador como o DB Browser for SQLite.

---

## 2. Análise (`argos-analise/`)

`gerar_tabelas.py` lê o banco limpo `argos-analise/dados/argos.db`, que já está no repositório, e gera:

- `tabelas/`: o modelo em estrela (`fato_leitura`, `dim_ovt`, `dim_edl`, `dim_ciclo`) e as tabelas de análise T00–T15 em CSV;
- `ARGOS_tabelas_de_analise.xlsx`: as mesmas tabelas num único Excel;
- `mongo/*.jsonl`: coleções para o MongoDB Atlas;
- `graficos/`: 12 gráficos em PNG e um PDF com todos.

Os indicadores seguem a Nota Técnica nº 3/2025:
`A` = armadilhas examinadas, `P` = positivas, `O` = ovos; **IPO = P/A·100**, **IDO = O/P**, **IDV = O/A**. Os valores são sempre somados no grupo antes da divisão; o script nunca tira média de taxas.

```bash
cd argos-analise
pip install -r requirements.txt
python gerar_tabelas.py
```

**Como testar:** a aba/arquivo `t00_conferencias.csv` traz conferências internas, como "soma por grupo = total", e deve sair sem divergências. Para rodar as consultas do Mongo sem servidor, use `python mongo/consultas_agregacao.py --simulado` (usa `mongomock`). As consultas 1 a 5 devem dar os mesmos números das tabelas. A versão em R está em `r/analise_argos.R` (`Rscript r/analise_argos.R`, precisa do `tidyverse`).

Os detalhes, os resultados e os cuidados com os dados estão em [`argos-analise/README.md`](argos-analise/README.md).

---

## 3. Frontend (`frontend/`)

Protótipo em HTML/JS puro, sem dependências, com quatro fluxos:

1. **Cadastro de OVT** e 2. **Cadastro de EDL**: código (`OVT-…`/`EDL-…`), distrito, bairro (lista em `territorios.json`), coordenadas dentro do Recife, data de instalação e situação. A EDL também tem data de manutenção.
3. **Coleta de campo**: só para OVT ativa. Não é possível repetir a mesma OVT no mesmo ciclo e ano. O calendário sugere a próxima coleta a cada 15 dias.
4. **Contagem de ovos**: uma leitura por coleta. Zero ovos significa "examinada e sem ovos"; "Não examinada" deixa a contagem vazia e exige um motivo.

Organização do código:
- `model.mjs`: regras de negócio puras, sem DOM. `validate`/`makeRecord` validam e montam os registros, `parseState` valida o que está no `localStorage`, `csvCell` exporta o CSV e neutraliza fórmulas (`=`, `+`, `-`, `@`), e `nextCollectionDate` calcula o calendário de 15 dias.
- `app.js`: interface que liga os formulários ao `model.mjs` e salva os dados no `localStorage` do navegador.
- `server.mjs`: servidor estático mínimo em `127.0.0.1:8090` que só entrega a lista fixa de arquivos do front.

### Como executar e testar

Requer Node.js 18 ou superior.

```bash
cd frontend
npm start        # abra http://127.0.0.1:8090 (para outra porta: node server.mjs 3000)
npm test         # roda tests/fluxo.test.mjs com o node:test
```

`npm test` executa 6 testes das regras do `model.mjs`: código duplicado, coordenada fora do Recife, EDL sem contagem de ovos, coleta repetida no ciclo, distinção entre zero e "não examinada", leitura sem coleta ou com data incoerente e escape do CSV. O resultado esperado é `# pass 6` e `# fail 0`.

Para o teste manual, siga o roteiro de [`frontend/README.md`](frontend/README.md): cadastre uma OVT, registre uma coleta, abra o calendário e lance a contagem. Use dados fictícios. Tudo fica no navegador, e o botão **Exportar CSV** baixa os registros.

---

## Outros arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `GLOSSARIO.md` | Termos de vigilância ambiental (OVT, EDL, IPO, IDO, LIRAa…) |
| `docs/planejamento-crispdm.md` | Planejamento do projeto nas fases do CRISP-DM |
| `dados/alteracoes_planilhas_*.csv` | Registro das correções feitas à mão nas planilhas de origem |
| `data/parana_*.json` | Séries do IBGE (desocupação e informalidade no Paraná), usadas como dados de apoio e fora do pipeline principal |
