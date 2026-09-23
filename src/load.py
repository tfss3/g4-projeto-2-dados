import json
import sqlite3

from src.connect_mongodb import get_mongo_client


class Load:

    def __init__(self):
        self.client = get_mongo_client()

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

    def load_sqlite(self, data: list[dict], db_name: str, table_name: str) -> None:
        conn = sqlite3.connect(f"{db_name}.db")
        cursor = conn.cursor()

        if data:
            columns = data[0].keys()
            placeholders = ", ".join("?" * len(columns))
            insert_query = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
            cursor.executemany(insert_query, [tuple(d.values()) for d in data])
            conn.commit()

        conn.close()
        print(
            f"Dados inseridos com sucesso "
            f"na tabela '{table_name}' do banco '{db_name}'!"
        )