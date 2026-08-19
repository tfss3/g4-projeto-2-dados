import requests

class Extract():

    def __init__(self):
        pass

    def extract_pnadc(self, uf_code=26, variavel=4099):
        url = f"https://servicodados.ibge.gov.br/api/v3/agregados/4093/periodos/201201-202601/variaveis/{variavel}?localidades=N3[{uf_code}]&classificacao=2[all]"

        response = requests.get(url)
        data = response.json()

        return data