# PLANEJAMENTO DO PROJETO DE ENGENHARIA DE DADOS (CRISP-DM)
**Projeto:** Eficácia das EDLs e Monitoramento por OVTs no Recife
**Disciplina:** Engenharia de Dados | Graduação em Análise de Dados — CESAR School (2026.2)
**Parceiro Institucional:** Gerência de Vigilância Ambiental e Controle de Zoonoses (GEVACZ) / Prefeitura da Cidade do Recife

---

## 1. Entendimento do Negócio (Business Understanding)
*Objetivo: Definir a dor do parceiro, a pergunta de negócio central, o público-alvo e os critérios de sucesso do projeto.*

### 1.1. Pergunta de Negócio Central
* **Pergunta Principal:** *"A instalação das Estações Disseminadoras de Larvicida (EDLs) reduziu a densidade populacional do Aedes aegypti (medida pelo número de ovos nas Ovitrampas - OVTs em um raio de 300m a 400m) e quais regiões de Recife devem ser priorizadas para novas intervenções?"*
* **Perguntas Secundárias:**
  * Qual a variação temporal de ovos antes e depois da instalação de uma EDL?
  * Onde estão localizados os *hotspots* de proliferação persistente no território urbano?
  * Como automatizar o fluxo analítico eliminando a dependência de processos manuais em planilhas Excel?

### 1.2. Público-Alvo e Uso Pretendido
* **Público Primário:** Analistas técnicos, epidemiologistas e gestores de saúde da GEVACZ.
* **Uso Pretendido:** Alimentar painéis operacionais georreferenciados para tomada de decisão rápida, otimizando o envio de Agentes de Combate às Endemias (ACE) em campo e fundamentando a distribuição estratégica de novos insumos e armadilhas no município de Recife.

### 1.3. Critérios de Sucesso do Projeto
* **Critério de Negócio:** Reduzir o tempo de resposta analítica (entre a coleta em campo e a tomada de decisão tática) de semanas para poucos dias, fornecendo um *Score de Priorização* automático.
* **Critério Técnico:** Construção de uma arquitetura de banco de dados relacional SQL georreferenciada e um pipeline de dados (ETL) automatizado, garantindo 100% de integridade referencial entre OVTs, EDLs e visitas.

---

## 2. Entendimento dos Dados (Data Understanding)
*Objetivo: Mapear o acervo de dados brutos da GEVACZ, identificar variáveis, granularidade e diagnosticar gargalos de qualidade.*

### 2.1. Fontes de Dados e Variáveis Exploradas
* **Base Histórica de Ovitrampas (OVTs - desde 2018):**
  * *Variáveis:* Código/Número da armadilha, data da instalação/coleta, contagem de ovos, status da palheta (positiva/negativa/danificada), Bairro, Distrito Sanitário, Coordenadas Geográficas (Latitude e Longitude).
* **Base de Estações Disseminadoras (EDLs - desde 2024):**
  * *Variáveis:* Código/ID da EDL, data de instalação, data de manutenção/troca de tela, tipo de imóvel, Bairro, Distrito Sanitário, Coordenadas Geográficas (Latitude e Longitude).
* **Bases Complementares de Apoio:**
  * *Dados Climáticos:* Pluviosidade (chuva) e temperatura por semana epidemiológica (para controle de sazonalidade).
  * *Camadas Geoespaciais:* Malha de Bairros e Estratos Sanitários do Recife (arquivos GeoJSON/Shapefile).

### 2.2. Granularidade Disponível
* **Temporal:** Semanal (Semana Epidemiológica - SE de 1 a 53) e Mensal/Anual.
* **Geográfica:** Pontual (Coordenadas de GPS Lat/Long), Bairro, Distrito Sanitário (DS) e Estrato LIRAa.

### 2.3. Problemas de Qualidade de Dados Identificados (Data Quality)
* **Valores Ausentes e Nulos:** Contagens sem registro de data ou armadilhas sem coordenadas geográficas cadastradas.
* **Coordenadas Inconsistentes:** Erros de digitação manual de GPS (latitude/longitude invertidas ou fora dos limites do município do Recife).
* **Despadronização de Nomenclaturas:** Variações de grafia e acentuação nos nomes dos Bairros e Distritos Sanitários (ex: "Casa Amarela", "C. Amarela", "CASA AMARELA").
* **Registros Duplicados:** Inserções assíncronas repetidas da mesma armadilha na mesma semana epidemiológica por ausência de chaves primárias nas planilhas.

---

## 3. Preparação dos Dados (Data Preparation)
*Objetivo: Estruturar as rotinas de limpeza, transformação, geocodificação e junção de dados (Pipeline ETL).*

### 3.1. Tratamento de Erros e Limpeza (Data Cleaning)
* **Higienização de Coordenadas:** Filtro e validação de atributos geoespaciais, restringindo latitudes para a faixa aproximada do Recife (-8.15 a -7.95) e longitudes (-35.00 a -34.85). Registros fora do polígono oficial serão isolados em tabela de exceção/log.
* **Padronização de Strings e Tipos:** Conversão forçada de colunas de datas para formato `YYYY-MM-DD`, padronização dos nomes de Bairros em caixa alta sem acentuação e conversão das contagens de ovos para inteiro positivo (`INT`).
* **Tratamento de Nulos:** Atribuição de motivos padronizados para perdas de palhetas (ex: "Sem Acesso", "Armadilha Danificada") mantendo o indicador de positividade consistente sem corromper a média.

### 3.2. Transformação e Feature Engineering
* **Cálculo de Indicadores Entomológicos:**
  * *IPO (Índice de Positividade de Ovitrampas):* $(OVTs_{positivas} / OVTs_{totais}) 	imes 100$.
  * *IDO (Índice de Densidade de Ovos):* $Total_{ovos} / OVTs_{positivas}$.
  * *IMO (Índice Médio de Ovos):* $Total_{ovos} / OVTs_{recolhidas}$.
* **Cálculo de Buffers Espaciais de Influência:**
  * Criação do raio geométrico de 300 metros e 400 metros ao redor do ponto de cada EDL ativa.
  * Intersecção espacial para relacionar cada OVT às EDLs que cobrem sua localização.

---

## 4. Modelagem (Modeling)
*Objetivo: Definir a arquitetura do banco de dados relacional e o esquema de tabelas prontas para consumo analítico.*

### 4.1. Esquema de Banco de Dados Relacional (SQL + PostGIS)

#### Tabela 1: `dim_localizacao` (Dimensão Geográfica)
* `id_localizacao` (PK, INT): Chave primária.
* `bairro` (VARCHAR): Nome padronizado do bairro.
* `distrito_sanitario` (INT): Código do distrito sanitário (1 a 8).
* `estrato_liraa` (VARCHAR): Código do estrato.

#### Tabela 2: `dim_armadilha` (Cadastro de Armadilhas)
* `id_armadilha` (PK, INT): Identificador único da armadilha.
* `codigo_campo` (VARCHAR): Código físico impresso na armadilha.
* `tipo_armadilha` (VARCHAR): 'OVT' ou 'EDL'.
* `latitude` (DECIMAL): Latitude decimal.
* `longitude` (DECIMAL): Longitude decimal.
* `geom` (GEOMETRY/Point, PostGIS): Ponto geométrico de localização.
* `id_localizacao` (FK): Vínculo com a dim_localizacao.

#### Tabela 3: `fact_medicao_ovt` (Fato Ovitrampas)
* `id_medicao` (PK, INT): Chave primária.
* `id_armadilha` (FK): Vínculo com a OVT.
* `data_coleta` (DATE): Data do recolhimento da palheta.
* `semana_epidemiologica` (INT): Semana de 1 a 53.
* `ano` (INT): Ano da medição.
* `qtd_ovos` (INT): Quantidade de ovos contabilizada.
* `status_palheta` (VARCHAR): 'Positiva', 'Negativa', 'Avaria'.

#### Tabela 4: `fact_intervencao_edl` (Fato EDLs)
* `id_intervencao` (PK, INT): Chave primária.
* `id_armadilha` (FK): Vínculo com a EDL.
* `data_instalacao_manutencao` (DATE): Data do evento.
* `status_dispositivo` (VARCHAR): 'Ativa', 'Manutenção', 'Desativada'.
* `buffer_geom` (GEOMETRY/Polygon, PostGIS): Polígono do raio de 300m/400m de influência.

---

## 5. Avaliação (Evaluation)
*Objetivo: Estabelecer os critérios de aceite para validar se os dados tratados e modelados respondem com precisão à pergunta de negócio.*

### 5.1. Critérios de Aceite de Engenharia e Qualidade
* **Integridade Referencial:** 0% de orfãos entre tabelas fatos e dimensões (100% das medições vinculadas a armadilhas e bairros válidos).
* **Validação de Coordenadas:** 100% das coordenadas na base final contidas dentro do limite geográfico oficial do Recife.
* **Inexistência de Duplicatas:** Ausência de duas medições para a mesma OVT na mesma semana epidemiológica/ano.

### 5.2. Validação da Pergunta de Negócio
* **Série Temporal Antes vs. Depois:** O sistema deve ser capaz de plotar a curva de densidade de ovos (IDO/IMO) nas OVTs inseridas no buffer da EDL para as 4 semanas anteriores e 4 semanas posteriores à instalação.
* **Geração de Hotspots e Score de Priorização:** Mapeamento visual claro que destaque agrupamentos de alta infestação persistente para direcionar a alocação das próximas EDLs.

---

## 6. Implementação (Deployment)
*Objetivo: Definir a operacionalização contínua do pipeline, arquitetura web e governança de código.*

### 6.1. Arquitetura do Pipeline Recorrente
```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│  Arquivos / Planilhas  │ ──►  │    Pipeline Python     │ ──►  │ Banco de Dados SQL     │
│  ou Formulários Web    │      │ (Ingestão & ETL)       │      │ (PostgreSQL + PostGIS) │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
                                                                            │
                                                                            ▼
                                                                ┌────────────────────────┐
                                                                │  Dashboard Web / PoC   │
                                                                │ (Flask + Leaflet API)  │
                                                                └────────────────────────┘
```
* **Execução Programada:** Agendamento do script ETL (via cron job ou Airflow) para execução semanal (ex: todas as segundas-feiras às 06:00), automatizando o processamento dos novos lotes de contagem.
* **Camada de Visualização (PoC):** Aplicação web desenvolvida em Flask, consumindo consultas SQL otimizadas e renderizando mapas interativos via Leaflet.js / Mapbox.

### 6.2. Versionamento e Governança de Código
* **Repositório GitHub:** Versionamento de todo o código-fonte (scripts Python ETL, scripts DDL/DML em SQL e aplicação Flask).
* **Documentação:** Preservação do Dicionário de Dados (`DATA_DICTIONARY.md`) e instruções de reprodução do ambiente (`README.md` e `requirements.txt`).


