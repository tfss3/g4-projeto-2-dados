from src.extract import Extract
from src.load import Load

# Instanciando as classes
extract = Extract()
load = Load()

#Pedimos para o usuário digitar os dados pelo terminal
print("--- CONSULTA DE DADOS DA PNAD/IBGE ---")
uf_usuario = input("Digite o código da UF desejada (ex: 26 para PE, 35 para SP, 33 para RJ): ")
nome_estado = input("Digite o nome do estado (para usar no nome do arquivo): ")

#Fazemos a busca da Taxa de Desocupação/Emprego (Variável 4099)
print(f"\nBuscando taxa de desocupação para {nome_estado}...")
pnadc_desocupacao = extract.extract_pnadc(uf_code=uf_usuario, variavel=4099)
load.load_json(f"{nome_estado}_desocupacao", pnadc_desocupacao)

#Fazemos a busca da Taxa de Informalidade (Variável 4100)
print(f"Buscando taxa de informalidade para {nome_estado}...")
pnadc_informalidade = extract.extract_pnadc(uf_code=uf_usuario, variavel=4100)
load.load_json(f"{nome_estado}_informalidade", pnadc_informalidade)

print("\nProcesso concluído! Os arquivos JSON foram gerados com sucesso.")






'''
from src.extract import Extract
from src.load import Load

extract = Extract()
pnadc = extract.extract_pnadc()

load = Load()
load.load_json("pernambuco", pnadc)
'''



