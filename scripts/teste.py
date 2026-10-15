import pandas as pd
xl = pd.ExcelFile('/Users/tsilva/Documents/GRADUACAO - BANCO DE DADOS/2-PERIODO/Projetos 2 - 2026.2/Repositorio/Documentos - GEVACZ/INFORMAÇÕES - GEVACZ/OVITRAMPAS 2026/PLANILHA_GERAL_OVT_2026.xlsx')
print('Sheets:', xl.sheet_names)


for sheet in xl.sheet_names[:3]:
    df = xl.parse(sheet, nrows=5)
    print(f'\n--- {sheet} ---')
    print('Shape:', df.shape)
    print('Columns:', df.columns.tolist())
    print(df.head(3).to_string())
