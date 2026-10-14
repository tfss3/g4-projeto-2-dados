import json
import sqlite3
import pandas as pd
from sqlalchemy import create_engine
from src.connect_mongodb import get_mongo_client
from src.connect_neon import get_neon_engine


class Load:

    def __init__(self):
        self.client = get_mongo_client()
        self.engine = get_neon_engine()

    def load_json(self, nome_doc, data):
        with open(f"{nome_doc}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_mongo(
        self,
        data: list[dict],
        db_name: str,
        collection_name: str
    ) -> None:

        collection = self.client[db_name][collection_name]

        if data:
            collection.insert_many(data)

        print(
            f"Dados inseridos com sucesso "
            f"na coleção '{collection_name}'!"
        )

    def load_sqlite(self,df: pd.DataFrame):
        conn = sqlite3.connect("ibge.db")
        df.to_sql("pnadc", conn, if_exists="replace", index=False)
        conn.close()


    def load_neon(self, df, nome_tabela):
        df.to_sql(nome_tabela, self.engine, if_exists="replace")
        self.engine.dispose()
        print(f"Dados salvos no Neon com sucesso na tabela '{nome_tabela}'!")