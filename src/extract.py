import requests


class Extract():
    """
    Responsável por acessar a API de Agregados do IBGE (agregado 4093 -
    PNAD Contínua trimestral) e desserializar os dados retornados em JSON.

    Um único método (extract_pnadc) monta a URL a partir dos parâmetros
    recebidos - variáveis, sexo, estados e períodos -, então a mesma
    solução serve para qualquer combinação, sem precisar duplicar código
    para cada série.
    """

    BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"
    AGREGADO = 4093

    def __init__(self, periodos="201201-202602"):
        self.periodos = periodos

    def extract_pnadc(self, variaveis, localidades, sexo="all"):
        """
        variaveis: lista de ids das variáveis do agregado 4093, ex.:
            [4099, 4096, 12466]
            4099 - Taxa de desocupação
            4096 - Taxa de participação na força de trabalho
            12466 - Taxa de informalidade

        localidades: lista de códigos de estado (nível N3), ex.:
            [26, 31, 35, 43, 53]  -> PE, MG, SP, RS, DF

        sexo: 'all' para todas as categorias, ou lista de ids, ex.:
            [6794, 4, 5]  -> Total, Homens, Mulheres
        """
        variaveis_param = "|".join(str(v) for v in variaveis)
        localidades_param = ",".join(str(c) for c in localidades)
        sexo_param = "all" if sexo == "all" else ",".join(str(s) for s in sexo)

        url = (
            f"{self.BASE_URL}/{self.AGREGADO}/periodos/{self.periodos}"
            f"/variaveis/{variaveis_param}"
            f"?localidades=N3[{localidades_param}]&classificacao=2[{sexo_param}]"
        )

        response = requests.get(url)
        response.raise_for_status()
        return response.json()
