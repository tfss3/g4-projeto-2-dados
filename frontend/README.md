# ARGOS integrado

Aplicação de campo, laboratório e análise territorial. Usa os bancos, gráficos, tabelas e arquivos da main.

## Executar

Requer Node.js 22.13 ou superior. Na raiz do repositório:

```powershell
cd frontend
npm ci
npm start
```

Abra http://127.0.0.1:8090. Outra porta pode ser usada com `npm start -- 8092`.

## Login e perfis

A tela de acesso oferece contas de demonstração no servidor local. Gestão acessa todas as áreas. Laboratório registra e valida leituras. Agente de Campo registra coletas e acompanha suas próprias devolutivas. Diretoria consulta indicadores, mapas e relatórios.

A conta administrativa inicial é admin@argos.local. A senha é gerada e exibida no terminal na primeira execução. Para escolher a senha antes da criação do banco, copie .env.example para .env e defina ARGOS_ADMIN_PASSWORD com pelo menos 12 caracteres. A gestão cria contas em Configurações. Uma conta cadastrada pode alterar a própria senha.

As permissões são verificadas na API. Contas de demonstração são habilitadas somente com o servidor vinculado a loopback e ARGOS_ALLOW_DEMO diferente de false.

## Banco e fontes

- runtime/operacional.db armazena usuários, sessões, cadastros, coletas, leituras, manutenção e auditoria. Esse diretório é ignorado pelo Git.
- ../argos-analise/dados/argos.db é aberto somente para leitura. O catálogo inicial de OVTs e locais de EDL é carregado dele.
- Os arquivos analíticos originais da main ficam disponíveis na área Relatórios. O painel dos seis gráficos conserva seus filtros próprios e inclui as 1.011 leituras estimadas por média.
- A opção Somente contagens observadas exclui as leituras estimadas nos indicadores da aplicação.
- Leituras novas só entram nos indicadores da Operação atual depois da validação do laboratório.
- A gestão pode importar em Configurações os registros da versão anterior que estejam no navegador. A importação é transacional e idempotente por identificador.

## Fluxo e análises

Cadastre uma OVT ou escolha uma do catálogo. O agente registra amostra, ciclo e data da coleta. O calendário prevê novas visitas a cada 15 dias. O laboratório registra a contagem, pode solicitar revisão, corrigir e validar. Zero ovos e amostra não examinada têm tratamentos distintos.

O mapa apresenta OVTs e locais de EDL, com raios de 300 e 400 metros. O contorno municipal oficial do IBGE fica disponível offline. A camada opcional de ruas OpenStreetMap exige internet. As posições estimadas são identificadas no detalhe do ponto.

Na Visão geral do agente, os filtros de distrito e bairro permitem consultar até seis ciclos históricos com pelo menos dez leituras examinadas por ciclo. A variação exige ciclos consecutivos e média anterior maior que zero. O agente acompanha somente as próprias devolutivas operacionais.

A análise por estação usa a data real de coleta, em 28 dias anteriores e 28 dias posteriores. O dia da instalação é excluído. A comparação exige dia exato de instalação. A fonte pode ser histórica ou operacional. As diferenças são descritivas.

A priorização oferece triagem por IDV e agenda de manutenção. O score com população e a decisão de novas intervenções dependem de validação metodológica. Datas e coordenadas incompletas ficam sinalizadas.

## Organização

```text
frontend/
  app.js                  login e navegação
  model.mjs               validação compartilhada entre interface e API
  server.mjs              inicialização do servidor
  backend/
    paths.mjs             caminhos e configuração
    schema.sql            esquema do banco operacional
    auth.mjs              senhas, sessões e permissões
    store.mjs             persistência e auditoria
    analytics.mjs         histórico, indicadores e geografia
    http.mjs              rotas e arquivos autorizados
  ui/
    api.mjs               cliente HTTP e formatação
    icons.mjs             ícones compartilhados
    forms.mjs             estrutura dos formulários
    operations.mjs        cadastros, coletas, laboratório e calendário
    panels.mjs            indicadores, barras e filtros
    map.mjs               mapa e camadas
    field-overview.mjs    histórico do bairro e resumo para visitas
    workspace.mjs         áreas analíticas e configurações
  tests/                  regras e integração da API
  runtime/                SQLite local, ignorado pelo Git
```

## Testes

Execute `npm test` na pasta frontend. Os testes usam bancos temporários e verificam autenticação, permissões, banco, fluxo campo/laboratório, persistência, mapa e conciliação com os totais da main.

O sistema integrado depende deste servidor para autenticação e gravação. O GitHub Pages pode hospedar os gráficos HTML independentes da análise.

Fonte do contorno municipal: https://servicodados.ibge.gov.br/api/v3/malhas/municipios/2611606?formato=application/vnd.geo+json&qualidade=minima . Código IBGE 2611606 (Recife). A geometria é usada como referência territorial, sem subdivisões de bairros inferidas.
