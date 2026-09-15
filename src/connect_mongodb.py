from pymongo import MongoClient
from pymongo.server_api import ServerApi
import certifi
from dotenv import load_dotenv
import os

load_dotenv()


def get_mongo_client():
    mongo_uri = os.getenv("MONGODB_URI")

    client = MongoClient(
        mongo_uri,
        server_api=ServerApi("1"),
        tlsCAFile=certifi.where()
    )

    return client