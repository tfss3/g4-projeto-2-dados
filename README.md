# Pipeline de Engenharia de Dados — PNADC / GEVACZ

**Disciplina:** Engenharia de Dados | Graduação em Banco de Dados — CESAR School (2026.2)
**Parceiro Institucional:** GEVACZ — Gerência de Vigilância Ambiental e Controle de Zoonoses / Prefeitura do Recife

---

## Visão Geral

Este projeto implementa um **pipeline ETL (Extract → Transform → Load)** em Python para ingestão, tratamento e persistência de dados públicos do IBGE (PNADC) e, em seguida, dados operacionais da GEVACZ referentes ao monitoramento do *Aedes aegypti* no município do Recife.

O pipeline segue a **arquitetura em camadas Medalhão**:

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   Fonte de Dados    │────►│  Camada Bronze        │────►│  Camada Silver       │
│  (API IBGE / Excel) │     │  MongoDB Atlas        │     │  Neon (PostgreSQL)   │
└─────────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                                     │
                                                                     ▼
                                                         ┌──────────────────────┐
                                                         │  Análise / Dashboard │
                                                         │  (Notebooks / PoC)   │
                                                         └──────────────────────┘
```

---

## Pergunta de Negócio

> *"A instalação das Estações Disseminadoras de Larvicida (EDLs) reduziu a densidade populacional do Aedes aegypti (medida pelo número de ovos nas Ovitrampas — OVTs em raio de 300 m a 400 m) e quais regiões de Recife devem ser priorizadas para novas intervenções?"*

---

## Estrutura do Projeto

```
.
├── main.py                   # Ponto de entrada do pipeline
├── requirements.txt          # Dependências Python
├── src/
│   ├── extract.py            # Camada de extração (API IBGE e MongoDB)
│   ├── transform.py          # Camada de transformação (Pandas)
│   ├── load.py               # Camada de carga (MongoDB, SQLite, Neon)
│   ├── connect_mongodb.py    # Conexão com MongoDB Atlas
│   └── connect_neon.py       # Conexão com Neon (PostgreSQL)
├── notebooks/
│   └── transform.ipynb       # Exploração e prototipagem da transformação
├── data/
│   ├── parana_desocupacao.json
│   └── parana_informalidade.json
├── docs/
│   └── planejamento-crispdm.md  # Planejamento detalhado CRISP-DM
└── scripts/
    ├── teste.py              # Visualização de planilhas GEVACZ
    └── teste.neon.py         # Teste de conexão com Neon
```

---

## Fluxo do Pipeline

### 1. Extract — `src/extract.py`

| Método | Fonte | Descrição |
|---|---|---|
| `extract_pnadc()` | API IBGE v3 | Busca dados trimestrais da PNADC (agregado 4093, variável 4099 — taxa de desocupação no Paraná) |
| `extract_collection_from_mongo()` | MongoDB Atlas | Lê uma coleção da camada Bronze para reprocessamento |

**Endpoint IBGE utilizado:**
```
https://servicodados.ibge.gov.br/api/v3/agregados/4093/periodos/201201|201202-202602/variaveis/4099
```

---

### 2. Transform — `src/transform.py`

Recebe a lista de documentos JSON retornada pela API (ou pelo MongoDB) e produz um `DataFrame` Pandas estruturado com as colunas:

| Coluna | Tipo | Descrição |
|---|---|---|
| `periodo` | `datetime` | Data de início do trimestre (ex: `2012-01-01`) |
| `valor` | `float` | Taxa de desocupação (%) |
| `ano` | `str` | Ano de referência |
| `tri` | `int` | Trimestre (1 a 4) |

**Transformações aplicadas:**
- Substituição de valores ausentes (`'...'`) por `0`
- Conversão do período no formato `YYYYQT` para `PeriodIndex` trimestral do Pandas
- Conversão do `PeriodIndex` para `Timestamp` (compatível com SQL)

---

### 3. Load — `src/load.py`

| Método | Destino | Camada | Formato |
|---|---|---|---|
| `load_json()` | Sistema de arquivos local | — | `.json` |
| `load_mongo()` | MongoDB Atlas | Bronze | Documentos NoSQL |
| `load_sqlite()` | Arquivo local `ibge.db` | — | SQLite |
| `load_neon()` | Neon (PostgreSQL na nuvem) | Silver | Tabela relacional |

---

## Ordem de Execução Correta

O `main.py` deve ser executado seguindo a ordem abaixo para garantir que o MongoDB seja populado antes de ser lido:

```python
# 1. Extrai da API do IBGE
pnadc_api = extrator.extract_pnadc()

# 2. Salva na camada Bronze (MongoDB)
loader.load_mongo(pnadc_api, "IBGE", "PNADC")

# 3. Lê da camada Bronze
pnadc = extrator.extract_collection_from_mongo("IBGE", "PNADC")

# 4. Transforma
df = transformer.transform_pnadc(pnadc)

# 5. Salva na camada Silver (Neon)
loader.load_neon(df, "pnadc")
```

---

## Configuração do Ambiente

### 1. Clonar o repositório

```bash
git clone <url-do-repositorio>
cd ProjEngDados202602-BD
```

### 2. Criar e ativar o ambiente virtual

```bash
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
.venv\Scripts\activate      # Windows
```

### 3. Instalar dependências

```bash
pip install -r requirements.txt
```

### 4. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
MONGODB_USERNAME=seu_usuario
MONGODB_PASSWORD=sua_senha
MONGODB_CLUSTER=cluster0.xxxxx.mongodb.net

NEONDB_URL=postgresql://usuario:senha@host/banco?sslmode=require
```

### 5. Executar o pipeline

```bash
python main.py
```

---

## Tecnologias Utilizadas

| Tecnologia | Uso |
|---|---|
| Python 3.x | Linguagem principal do pipeline |
| Pandas | Transformação e manipulação de dados |
| Requests | Consumo da API REST do IBGE |
| PyMongo | Conexão e operações com MongoDB Atlas |
| SQLAlchemy + psycopg2 | Conexão com Neon (PostgreSQL) |
| MongoDB Atlas | Camada Bronze — armazenamento NoSQL na nuvem |
| Neon | Camada Silver — PostgreSQL serverless na nuvem |
| SQLite | Alternativa local para a camada Silver |
| python-dotenv | Gerenciamento seguro de credenciais |
| Jupyter Notebook | Prototipagem e análise exploratória |

---

## Planejamento CRISP-DM

O planejamento completo do projeto seguindo a metodologia CRISP-DM está documentado em [docs/planejamento-crispdm.md](docs/planejamento-crispdm.md), cobrindo:

- Entendimento do negócio e pergunta central
- Mapeamento das fontes de dados da GEVACZ (OVTs e EDLs)
- Estratégia de limpeza e feature engineering (IPO, IDO, IMO)
- Modelagem do banco relacional com PostGIS
- Critérios de aceite e validação
- Arquitetura de deployment com dashboard georreferenciado

---

## Equipe

Projeto desenvolvido como trabalho prático da disciplina **Engenharia de Dados** — CESAR School, 2026.2.
