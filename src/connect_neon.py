import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

def get_neon_engine():
    database_url = os.getenv("NEONDB_URL")
    return create_engine(database_url)

if __name__ == "__main__":
    engine = get_neon_engine()
    print("Conexão com Neon realizada com sucesso!")
