import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from contextlib import closing
from pathlib import Path
import sqlite3

load_dotenv()

banco_url = os.getenv("NEON_DB")

engine = create_engine(banco_url)

def carregar(df: pd.DataFrame, caminho_db: Path, tabela: str, SCHEMA) -> int:
    """Recria a tabela a partir do df. A planilha é a fonte da verdade, então
    rodar de novo substitui os dados em vez de duplicá-los. Tudo acontece numa
    única transação: se a inserção falhar, a tabela anterior é preservada."""
    caminho_db.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(caminho_db)) as conexao:
        with conexao:
            conexao.executescript(f"BEGIN; DROP TABLE IF EXISTS {tabela}; {SCHEMA}")
            df.to_sql(tabela, conexao, if_exists="append", index=False)
        return conexao.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]

def carregar_neon(self, df, nome_tabela):
    df.to_sql(nome_tabela, self.engine, if_exists="replace")
    self.engine.dispose()
    print(f"Dados salvos no Neon com sucesso na tabela'{nome_tabela}'!")