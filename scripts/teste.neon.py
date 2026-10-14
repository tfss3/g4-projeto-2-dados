import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

ACCESS_NEON = os.getenv("NEONDB_URL")
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

engine = create_engine(ACCESS_NEON)

df = pd.DataFrame(
    {
        "periodo": ["2024Q1", "2024Q2"],
        "valor":[10.5,11.2],
    }
)

df.to_sql("teste_neon", engine, if_exists="replace")
print("Dados Salvos na tabela 'teste_neon'!")


#Passo 4: ler os dados de volta para confirmar que foram salvos
df_lido = pd.read_sql("SELECT * FROM teste_neon", engine)
print(df_lido)

engine.dispose()