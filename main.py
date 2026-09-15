from src.extract import Extract
from src.load import Load


extrator = Extract()
pnadc = extrator.extract_pnadc()

print("Extração efetuada com sucesso!")

loader = Load()
loader.load_mongo(pnadc, "IBGE", "PNADC")

print("Dados salvos no Mongo!")