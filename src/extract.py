from pathlib import Path
import pandas as pd

def extrair(caminho, ABA, header=0) -> pd.DataFrame | dict[str, pd.DataFrame]:
    """Lê a planilha como texto. Com ABA=None lê todas as abas e devolve um
    dicionário {nome_da_aba: DataFrame}. header=None mantém o layout cru
    (útil quando o cabeçalho não está na primeira linha)."""
    caminho = Path(caminho)
    if not caminho.exists():
        raise FileNotFoundError(f"Planilha não encontrada: {caminho}")
    df = pd.read_excel(
        caminho,
        sheet_name=ABA,
        header=header,
        dtype=str,
        na_values=["", "-", "N/A", "#DIV/0!", "#N/D"],
        engine="openpyxl",
    )

    return df
