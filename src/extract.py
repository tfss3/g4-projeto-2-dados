from xmlrpc import client
import requests
import os
from dotenv import load_dotenv
import requests
from src.connect_mongodb import get_mongo_client


class Extract():

    def __init__(self):
        pass

    def extract_pnadc(self):
        url = f"https://servicodados.ibge.gov.br/api/v3/agregados/4093/periodos/201201%7C201202-202602/variaveis/4099?localidades=N3[26]&classificacao=2[all]"

        response = requests.get(url)
        data = response.json()

        return data
    
    def extract_collection_from_mongo(self, db_name, collection_name):
        client = get_mongo_client()
        db = client[db_name]
        data = list(db[collection_name].find())
        return data