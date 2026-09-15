import requests

class Extract():

    def __init__(self):
        pass

    def extract_pnadc(self):
        url = f"https://servicodados.ibge.gov.br/api/v3/agregados/4093/periodos/201201%7C201202-202602/variaveis/4099?localidades=N3[26]&classificacao=2[all]"

        response = requests.get(url)
        data = response.json()

        return data