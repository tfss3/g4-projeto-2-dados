import os
from functools import cache
from io import BytesIO

import boto3
import pandas as pd
from dotenv import load_dotenv

load_dotenv()


@cache
def _cliente_s3():
    """Cliente S3 do Object Storage do Neon, criado uma única vez. O boto3 lê
    AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e AWS_REGION
    direto do ambiente (carregado do .env)."""
    return boto3.client("s3")


def _baixar(chave: str) -> BytesIO:
    """Baixa o objeto `chave` do bucket S3_BUCKET e devolve o conteúdo em memória."""
    bucket = os.getenv("S3_BUCKET")
    if not bucket:
        raise RuntimeError("S3_BUCKET não definido no .env (ex.: S3_BUCKET=projeto-gevacz)")
    s3 = _cliente_s3()
    try:
        objeto = s3.get_object(Bucket=bucket, Key=chave)
    except s3.exceptions.NoSuchKey:
        raise FileNotFoundError(f"Planilha não encontrada no bucket {bucket}: {chave}") from None
    return BytesIO(objeto["Body"].read())


def extrair(chave, ABA, header=0) -> pd.DataFrame | dict[str, pd.DataFrame]:
    """Baixa a planilha `chave` do bucket do Neon e lê como texto. Com ABA=None
    lê todas as abas e devolve um dicionário {nome_da_aba: DataFrame}.
    header=None mantém o layout cru (útil quando o cabeçalho não está na
    primeira linha)."""
    df = pd.read_excel(
        _baixar(chave),
        sheet_name=ABA,
        header=header,
        dtype=str,
        na_values=["", "-", "N/A", "#DIV/0!", "#N/D"],
        engine="openpyxl",
    )

    return df
