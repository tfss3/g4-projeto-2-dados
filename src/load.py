import json

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