# Planejamento CRISP-DM — Projeto GEVACZ

**Projeto:** Projeto Integrador · Engenharia de Dados · CESAR School · Grupo 4
**Cliente:** GEVACZ (Gerência de Vigilância Ambiental e Controle de Zoonoses) — Prefeitura do Recife
**Metodologia:** CRISP-DM (Cross Industry Standard Process for Data Mining) — processo iterativo de 6 fases, aplicado aqui a um pipeline de engenharia de dados sobre os registros de vigilância entomológica da GEVACZ.

---

## 1. Entendimento do Negócio ✅ *(explorado em profundidade)*

**Pergunta de negócio:** Como automatizar a coleta, integração e análise dos dados de Ovitrampas (OVTs) e Estações Disseminadoras de Larvicida (EDLs) da GEVACZ, de forma a calcular automaticamente a efetividade de cada EDL e priorizar onde instalar as próximas, substituindo o processo manual atual em planilhas Excel?

**Público / uso pretendido da resposta:** Analistas, gestores e agentes de endemias da GEVACZ — na persona provisória do projeto, representados por Renata Vasconcelos, Analista Técnico-Estatística de Vigilância Ambiental, que hoje gasta a maior parte do tempo higienizando e cruzando planilhas em vez de analisar dados.

**Formato da entrega final:** Aplicação web com banco de dados relacional estruturado, mapa de calor interativo de infestação e painel com o índice de efetividade por EDL, substituindo o fluxo atual de planilhas desconectadas.

**Critério de sucesso do projeto:** Reduzir o tempo de resposta a um surto de "semanas" para "dias"; eliminar a dupla digitação (papel → planilha); e entregar, de forma automatizada, um índice de efetividade por EDL (cruzando a densidade de ovos das OVTs vizinhas antes/depois da instalação) — algo que hoje não existe nem nos sistemas concorrentes analisados no benchmarking (Conta Ovos, InfoDengue, Painel Arboviroses ES, SINAN, QGIS).

---

## 2. Entendimento dos Dados ✅ *(explorado em profundidade)*

**Fonte:** planilhas eletrônicas (Excel) mantidas pelos Distritos Sanitários da GEVACZ — dado interno da prefeitura, não uma API pública.

**Dois conjuntos de dados principais:**

- **OVTs (Ovitrampas):** histórico contínuo desde **2018**. Armadilhas atrativas com solução e palhetas de madeira que mensuram a densidade e dispersão do vetor. Cada leitura gera os índices **IPO** (% de positividade), **IDO** (densidade de ovos) e **IMO** (índice médio de ovos), por armadilha e por semana.
- **EDLs (Estações Disseminadoras de Larvicida):** histórico desde **2024**. Armadilhas impregnadas com larvicida microencapsulado (Pyriproxyfen) que o mosquito dissemina para criadouros num raio de **300m a 400m**.

**Granularidade disponível:**
- **Geográfica:** endereço completo (bairro, rua, número, ponto de referência, setor) + coordenadas de latitude/longitude por armadilha/estação.
- **Temporal:** leituras semanais, organizadas por semana epidemiológica e ano.

**Significado / como são coletados:** os dados nascem em campo, preenchidos em papel (ou digitados diretamente, dependendo da equipe) pelos Agentes de Combate às Endemias durante a vistoria, e só depois transcritos para as planilhas centrais — etapa que hoje é manual e assíncrona.

**Problemas de qualidade já identificados** (mapeados no desk research, Tópico 1.3):
- Coordenadas geográficas inconsistentes (latitude/longitude digitadas incorretamente).
- Datas e nomenclaturas de bairros despadronizadas entre Distritos Sanitários diferentes.
- Ausência de identificador único por armadilha/estação, dificultando o cruzamento histórico.
- Sem regras de integridade referencial: é possível inserir código de armadilha duplicado ou coordenada inválida sem nenhum aviso.
- Dupla digitação (papel → planilha) como origem recorrente de erro e de dados "fantasma" (perdidos ou não rastreáveis).
- Cálculo do raio de efetividade das EDLs (300–400m) sobre as OVTs do entorno é, hoje, impossível de fazer de forma confiável em planilha — exige processamento geoespacial nativo.

---

## 3. Preparação dos Dados 📋 *(planejamento — ainda não implementado)*

- [ ] Normalizar tipos de coordenadas (latitude/longitude) e validar se estão dentro dos limites geográficos do Recife.
- [ ] Padronizar datas e nomenclatura de bairros/setores entre os diferentes Distritos Sanitários.
- [ ] Criar/validar um identificador único por OVT e por EDL, eliminando duplicidade de código.
- [ ] Tratar valores ausentes e registros "fantasma" originados de erro de digitação.
- [ ] Empilhar (concat) o histórico de OVTs (desde 2018) com o de EDLs (desde 2024), mantendo a rastreabilidade da fonte e do período de cada um.
- [ ] Calcular a distância geoespacial entre cada OVT e a EDL mais próxima, como base para o índice de efetividade (raio de 300–400m).

---

## 4. Modelagem 📋 *(planejamento — ainda não implementado)*

**Formato final proposto:** banco de dados relacional com extensão espacial (**PostgreSQL + PostGIS**), com as seguintes tabelas principais:

| Tabela | Descrição |
|---|---|
| `ovitrampas` | Cadastro de OVTs — id, endereço, tipo (urbana/rural), geometria (lat/long), responsável |
| `leituras_ovt` | Leituras semanais — id_ovt, semana, ano, nº de ovos, IMO/IDO/IPO calculados |
| `edls` | Cadastro de EDLs — id, endereço, geometria (lat/long), data de instalação |
| `visitas_edl` | Visitas de manutenção — id_edl, data, nível de água, observações |
| `quarteirões` | Unidade geográfica de agrupamento das ações de campo |
| `agentes` | Usuários do sistema, com hierarquia de perfis (agente, gestor municipal, gestor regional) |

A chave geoespacial (`geometry`/`point`, via PostGIS) é o que permite consultas de proximidade (ex.: "quais OVTs estão a até 400m desta EDL") de forma nativa e performática — o gargalo que hoje inviabiliza esse cálculo em Excel.

---

## 5. Avaliação 📋 *(planejamento — ainda não implementado)*

Critérios para considerar os dados "prontos":

- [ ] Nenhuma coordenada nula ou fora dos limites geográficos esperados (Recife/RMR).
- [ ] Sem duplicidade de leitura para a mesma armadilha na mesma semana/ano.
- [ ] Cobertura histórica completa desde 2018 (OVTs) e 2024 (EDLs), sem lacunas não documentadas.
- [ ] Índices (IMO, IDO, IPO) dentro de faixas plausíveis, sem outliers não investigados.
- [ ] Todo registro de OVT/EDL possui identificador único, sem colisão de código.

---

## 6. Implantação 📋 *(planejamento — ainda não implementado)*

**Recorrência:** diferente de uma API externa com publicação trimestral, o pipeline da GEVACZ precisa rodar de forma **contínua/próxima do tempo real**, à medida que os agentes registram novas leituras em campo — o objetivo final é substituir o lote manual mensal por ingestão incremental (idealmente via aplicativo móvel comunicando-se por API com o backend).

**Stack técnica proposta** (já validada no benchmarking do Tópico 3):
- Backend em **Python**, com framework **Flask** aplicando princípios de **Clean Architecture** (separação entre lógica de negócio e interface).
- Front-end orquestrado com **Jinja2**.
- Visualização geoespacial via **Leaflet**, **Mapbox** ou **Google Maps API**, para os mapas de calor e o índice de efetividade por EDL.

**Versionamento:**
- Código versionado em Git, no repositório do projeto integrador.
- Arquitetura em camadas por responsabilidade única (extração/ingestão, tratamento, modelagem, API/visualização).
- Próximos passos de maturidade: testes automatizados e integração contínua (CI) antes de qualquer expansão do pipeline.

---

## Declaração de Uso de Inteligência Artificial

Este documento foi redigido com apoio do Claude (Anthropic), a partir de informações já levantadas e validadas pelo grupo ao longo do desenvolvimento do projeto GEVACZ — a IA foi usada para **estruturar e redigir** o conteúdo no formato das 6 fases do CRISP-DM, não para pesquisar ou decidir o conteúdo técnico do projeto. As fontes de cada parte foram:

- **Fase 1 — Entendimento do Negócio:** pergunta de negócio, persona (Renata Vasconcelos) e critério de sucesso extraídos das Seções 1, 1.1 e 1.2 do documento "S1 - Pesquisa Desk Research" do grupo.
- **Fase 2 — Entendimento dos Dados:** características dos dados de OVTs e EDLs (histórico desde 2018/2024, indicadores IMO/IDO/IPO, raio de efetividade de 300–400m) e os problemas de qualidade identificados, extraídos da Seção 1.3 do mesmo documento (conteúdo originalmente redigido por José Roberto).
- **Fases 3 e 4 — Preparação e Modelagem:** tratamentos de dados e esquema de tabelas propostos com base na arquitetura técnica já definida pelo grupo na Seção 3 (Levantamento Tecnológico), também de autoria de José Roberto.
- **Fases 5 e 6 — Avaliação e Implantação:** critérios de qualidade e stack proposta (Python, Flask, PostgreSQL/PostGIS, Leaflet/Mapbox) baseados na mesma Seção 3 e na Matriz Técnica do benchmarking do grupo.

Todas as informações de negócio, dados e arquitetura já haviam sido levantadas e validadas pelo grupo antes da redação deste documento; a IA não introduziu decisões técnicas ou de negócio novas.