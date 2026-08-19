from src.extract import Extract
from src.load import Load

# Parâmetros da consulta - troque aqui para gerar outras combinações
# sem alterar o código do Extract/Load.
VARIAVEIS = [4099, 4096, 12466]   # desocupação, participação na força de trabalho, informalidade
SEXO = [6794, 4, 5]               # total, homens, mulheres
ESTADOS = [26, 31, 35, 43, 53]    # PE, MG, SP, RS, DF

ext = Extract()
dados = ext.extract_pnadc(variaveis=VARIAVEIS, localidades=ESTADOS, sexo=SEXO)

ld = Load()
ld.load_json("pnadc_multivariaveis", dados)
print("Salvo: pnadc_multivariaveis.json")
