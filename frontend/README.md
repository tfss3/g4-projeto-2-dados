# ARGOS · Cadastros e leituras

Front local do Projeto 2 para a vigilância ambiental do Recife. A interface aproveita o tema azul e turquesa, os campos territoriais e a organização em painéis do [protótipo original](https://github.com/RomeuCcampello/Projeto-2-prototipo).

## Executar

Com Node.js 18 ou superior, a partir da raiz do repositório:

```powershell
cd frontend
npm start
```

Abra [http://127.0.0.1:8090](http://127.0.0.1:8090). Não é necessário instalar dependências. Para executar as verificações da regra de cadastro e leitura: `npm test`.

## Experimentar o fluxo

1. **Cadastro de OVT:** cadastre a ovitrampa com código, responsável, data de instalação, situação e localização.
2. **Cadastro de EDL:** cadastre a estação disseminadora com sua data de instalação e, se conhecida, a data da próxima manutenção. É um fluxo independente.
3. **Coleta de campo:** selecione uma OVT ativa, identifique a amostra/palheta, informe ciclo, data da coleta e agente. A coleta não tem campo de ovos. Ao informar a data, abra **Calendário de coletas** no menu principal ou use **Ver calendário** no formulário. A previsão segue de 15 em 15 dias. Após salvar, a última coleta da OVT vira a referência do calendário.
4. **Contagem de ovos:** selecione a coleta pendente. Informe a data, responsável e resultado no laboratório. A contagem zero indica uma amostra examinada sem ovos; “Não examinada” mantém o número vazio e exige um motivo.

Os dados permanecem neste navegador, no endereço em que o front foi aberto. Use **Exportar CSV** para gerar um CSV. Use dados fictícios nesta versão. O front não possui login, servidor de dados ou sincronização entre aparelhos.

Os cadastros e leituras são armazenados localmente no navegador. A integração com o banco e as APIs do projeto será feita em uma etapa posterior.
