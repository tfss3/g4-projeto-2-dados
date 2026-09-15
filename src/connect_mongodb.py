from pymongo import MongoClient
from pymongo.server_api import ServerApi
import certifi
from dotenv import load_dotenv
import os
from urllib.parse import quote_plus

load_dotenv()


def get_mongo_client():
    username = os.getenv("MONGODB_USERNAME")
    password = os.getenv("MONGODB_PASSWORD")
    cluster = os.getenv("MONGODB_CLUSTER")

    password = quote_plus(password)

    mongo_uri = (
        f"mongodb+srv://{username}:{password}@{cluster}/"
        f"?appName=Cluster0"
    )

    client = MongoClient(
        mongo_uri,
        server_api=ServerApi("1"),
        tlsCAFile=certifi.where()
    )

    return client

if __name__ == "__main__":
    client = get_mongo_client()
    client.admin.command("ping")
    print("Conexão com MongoDB realizada com sucesso!")