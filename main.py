from pathlib import Path
import src.extract as ex
import src.transform as transform
import src.sqlite_schema as SCHEMA
import src.load as carregar


CAMINHO_XLSX = "dados/Total Ovtrampas.xlsx"
ABA = "CICLO 1"
CAMINHO_DB = Path("saida/total_ovt.db")
TABELA = "ovt"
criar_tabela = SCHEMA.criar_tabela()

CAMINHO_XLSX_EDL = "dados/TOTAL DE EDL POR DS.xlsx"
ABA_RESUMO_EDL = "TOTAL DE PE E EDL"
CAMINHO_DB_EDL = Path("saida/edl_por_ds.db")

CAMINHO_XLSX_GEO = "dados/Georreferenciamento OVT 2026 ATUALIZAÇÃO.xlsx"
LINHA_CABECALHO_GEO = 2  # as duas primeiras linhas são título
CAMINHO_DB_GEO = Path("saida/georreferenciamento_ovt.db")


def ovitrampas() -> None:
    dado_bruto = ex.extrair(CAMINHO_XLSX, ABA)
    print(f"Lidas {len(dado_bruto)} linhas da aba '{ABA}' de {CAMINHO_XLSX}")

    tratado = transform.transformar(dado_bruto)
    print(f"Restaram {len(tratado)} linhas após a limpeza")

    total = carregar.carregar(tratado, CAMINHO_DB, TABELA, criar_tabela)
    print(f"Tabela '{TABELA}' agora tem {total} registros em {CAMINHO_DB}")



def edl_por_ds() -> None:
    """Cada aba vira uma tabela: 'DS 1 - TOTAL' -> edl_ds_i ... 'DS 8 - TOTAL' -> edl_ds_viii.
    A aba de resumo tem dois quadros, então vira duas tabelas."""
    abas = ex.extrair(CAMINHO_XLSX_EDL, None, header=None)
    print(f"Lidas {len(abas)} abas de {CAMINHO_XLSX_EDL}")

    for nome_aba, bruto in abas.items():
        ds = transform.ds_romano(nome_aba)
        if nome_aba == ABA_RESUMO_EDL:
            total_ds, total_bairro = transform.transformar_resumo_edl(bruto)
            salvar(total_ds, CAMINHO_DB_EDL, "edl_total_por_ds", SCHEMA.criar_tabela_resumo_ds, nome_aba)
            salvar(total_bairro, CAMINHO_DB_EDL, "edl_total_por_bairro", SCHEMA.criar_tabela_resumo_bairro, nome_aba)
        elif ds:
            salvar(transform.transformar_edl(bruto, ds), CAMINHO_DB_EDL, f"edl_ds_{ds.lower()}",
                   SCHEMA.criar_tabela_edl, nome_aba)
        else:
            print(f"Aba '{nome_aba}' ignorada: formato desconhecido")

   


def georreferenciamento() -> None:
    """Cada aba vira uma tabela: 'DS I - ID OVT' -> georef_ovt_ds_i ..."""
    abas = ex.extrair(CAMINHO_XLSX_GEO, None, header=LINHA_CABECALHO_GEO)
    print(f"Lidas {len(abas)} abas de {CAMINHO_XLSX_GEO}")

    for nome_aba, bruto in abas.items():
        ds = transform.ds_romano(nome_aba)
        if ds:
            salvar(transform.transformar_georef(bruto, ds), CAMINHO_DB_GEO, f"georef_ovt_ds_{ds.lower()}",
                   SCHEMA.criar_tabela_georef, nome_aba)
        else:
            print(f"Aba '{nome_aba}' ignorada: formato desconhecido")


def salvar(tratado, caminho_db: Path, tabela: str, criar_schema, nome_aba: str) -> None:
    total = transform.carregar(tratado, caminho_db, tabela, criar_schema(tabela))
    print(f"Aba '{nome_aba.strip()}' -> tabela '{tabela}' com {total} registros em {caminho_db}")


def main() -> None:
    ovitrampas()
    edl_por_ds()
    georreferenciamento()

if __name__ == "__main__":
    main()
