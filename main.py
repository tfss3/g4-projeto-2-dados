from src.extract import Extract
from src.load import Load
from src.transform import Transform


# 1 - Extrair da API do IBGE
extrator = Extract()
pnadc = extrator.extract_pnadc()
print("Dados extraídos da API do IBGE")


# 2 - Salvar no MongoDB (camada bronze)
loader = Load()
loader.load_mongo(pnadc, "IBGE", "PNADC")
print("Dados salvos na camada Bronze!")

# 3 - Extrair do MongoDB (camada bronze)
pnadc = extrator.extract_collection_from_mongo("IBGE", "PNADC")
print("Extração da camada bronze efetuada com sucesso!")

# 4 - Transformar os dados
transformer = Transform()
df = transformer.transform_pnadc(pnadc)
print("Dados transformados com Sucesso!")


# 5 - Salvar no Neon (camada silver)
loader.load_neon(df, "pnadc")
print("Dados salvos na camada Silver Nuvem!")