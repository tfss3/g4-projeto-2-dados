import pandas as pd
from contextlib import closing
from pathlib import Path
import re
import sqlite3
import unicodedata as uni

ROMANOS = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII"}
MESES = {"JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
         "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12}

# Recife inteiro cabe nesta caixa; coordenada fora dela é erro de digitação
LAT_RECIFE = (-8.20, -7.90)
LON_RECIFE = (-35.05, -34.80)


def sem_acento(texto) -> str:
    texto = uni.normalize('NFKD', str(texto))
    return texto.encode("ascii", "ignore").decode("ascii")


def normalizar_nome(coluna:str) -> str:
    """'Agente / Matricula' -> 'Agente_Matricula'"""
    texto = sem_acento(coluna)
    texto = texto.strip().lower()
    for caractere in "-/().$ ":
        texto = texto.replace(caractere, "_")
    while "__" in texto:
        texto = texto.replace("__","_")
    return texto.strip("_")


def texto_limpo(valor) -> str | None:
    """Tira espaços das pontas e repetidos no meio; célula vazia vira None."""
    if pd.isna(valor):
        return None
    texto = " ".join(str(valor).split())
    return texto or None


def juntar(*valores) -> str | None:
    """Junta as células preenchidas com ' | ' (para guardar o texto original)."""
    preenchidos = [texto_limpo(v) for v in valores if texto_limpo(v)]
    return " | ".join(preenchidos) or None


def ds_romano(texto) -> str | None:
    """'DS 1 - TOTAL' / 'DS I - ID OVT' / 'DISTRITO SANITÁRIO III' -> 'I' / 'I' / 'III'"""
    achado = re.search(r"(?:DS|SANITARIO)\s*([IVX]+|\d+)\b", sem_acento(texto).upper())
    if not achado:
        return None
    return ROMANOS.get(achado.group(1), achado.group(1))


def _graus(pedaco) -> float | None:
    """Um pedaço de coordenada em qualquer formato -> graus decimais negativos
    (Recife fica nos hemisférios sul e oeste, então o sinal é sempre '-')."""
    texto = str(pedaco).strip().upper().replace("º", "°").replace("''", '"')
    gms = re.match(r"^[-\s]*(\d+)\s*°\s*,?\s*(\d+)\s*'\s*([\d.,]*)", texto)
    if gms:  # 8°7'34.735"S
        graus, minutos, segundos = gms.groups()
        segundos = float(segundos.replace(",", ".")) if segundos else 0.0
        return -(int(graus) + int(minutos) / 60 + segundos / 3600)
    # '-8.0518288', '8. 0194858', '-34,916', -80641112.0 (perdeu o ponto no Excel):
    # junta os dígitos e põe o ponto depois do grau (7/8 na latitude, 34/35 na longitude)
    digitos = _digitos(texto)
    grau = 2 if digitos.startswith(("34", "35")) else 1
    if len(digitos) < grau + 3:
        return None
    return -float(f"{digitos[:grau]}.{digitos[grau:]}")


def _digitos(texto: str) -> str:
    return re.sub(r"\D", "", re.sub(r"\.0$", "", texto))


def _graus_gms_compacto(pedaco) -> float | None:
    """GMS digitado sem os símbolos: '34. 5314000' = 34°53'14.000" e
    '8. 111112' = 8°1'11.12". Em Recife os minutos da latitude 8° têm 1 dígito
    (8°0' a 8°9'), os da 7° e da longitude têm 2. Os segundos quase sempre vêm
    com 3 casas decimais ('8. 14218' = 8°1'4.218"); quando não dá, 2 dígitos
    inteiros, ou 1 se 2 passariam de 59 ('8. 180765' = 8°1'8.0765")."""
    texto = str(pedaco).strip().upper()
    if "°" in texto or "º" in texto:
        return None
    digitos = _digitos(texto)
    grau = 2 if digitos.startswith(("34", "35")) else 1
    casas_min = 1 if digitos.startswith("8") else 2
    minutos, resto = digitos[grau:grau + casas_min], digitos[grau + casas_min:]
    if len(resto) < 2 or int(minutos) > 59:
        return None
    if len(resto) in (4, 5) and int(resto[:-3]) < 60:
        casas_seg = len(resto) - 3
    else:
        casas_seg = 2 if int(resto[:2]) < 60 else 1
    segundos = float(f"{resto[:casas_seg]}.{resto[casas_seg:] or 0}")
    return -(int(digitos[:grau]) + int(minutos) / 60 + segundos / 3600)


def _em_recife(graus) -> bool:
    return graus is not None and (LAT_RECIFE[0] <= graus <= LAT_RECIFE[1]
                                  or LON_RECIFE[0] <= graus <= LON_RECIFE[1])


def coordenadas(*valores) -> tuple[float | None, float | None]:
    """Recebe as células de coordenada (lat e lon separadas, ou as duas numa
    célula só) e devolve (latitude, longitude). Quem é latitude ou longitude
    sai da faixa do valor, então colunas trocadas também ficam certas.
    Valor que cai fora de Recife vira None."""
    pedacos = [p for valor in valores if pd.notna(valor)
               for p in re.split(r",\s*(?=-)", str(valor))]
    decimais = [_graus(p) for p in pedacos]
    gms = [_graus_gms_compacto(p) for p in pedacos]
    # GMS compacto só quando algum valor não faz sentido como decimal mas faz
    # como GMS, e todos os valores da linha fazem sentido como GMS
    usar_gms = (any(not _em_recife(d) and _em_recife(g) for d, g in zip(decimais, gms))
                and all(_em_recife(g) for g in gms))
    lat = lon = None
    for graus in (gms if usar_gms else decimais):
        if graus is None:
            continue
        if lat is None and LAT_RECIFE[0] <= graus <= LAT_RECIFE[1]:
            lat = round(graus, 7)
        elif lon is None and LON_RECIFE[0] <= graus <= LON_RECIFE[1]:
            lon = round(graus, 7)
    return lat, lon


def para_data(serie: pd.Series) -> pd.Series:
    """Data do Excel ('2026-05-14 00:00:00') ou digitada ('20/05/2026') -> 'AAAA-MM-DD'."""
    iso = pd.to_datetime(serie, errors="coerce", format="ISO8601")
    br = pd.to_datetime(serie, errors="coerce", format="%d/%m/%Y")
    datas = iso.fillna(br)
    ano_max = pd.Timestamp.today().year + 1
    datas = datas.where(datas.dt.year.between(2000, ano_max))  # ex.: '20/05/0226', '22/05/3036'
    return datas.dt.strftime("%Y-%m-%d")


def data_instalacao(texto) -> str | None:
    """'Instalada em 16/05/2026' -> '2026-05-16'; 'INSTALAÇÃO ABRIL 2026' -> '2026-04'
    (só ano-mês quando a planilha não informa o dia); 'RETIRADA ...' -> None."""
    if pd.isna(texto):
        return None
    texto = sem_acento(texto).upper()
    if "RETIRAD" in texto:
        return None
    if achado := re.search(r"\d{4}-\d{2}-\d{2}", texto):
        return achado.group(0)
    if achado := re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", texto):
        dia, mes, ano = achado.groups()
        return f"{ano}-{int(mes):02d}-{int(dia):02d}"
    if achado := re.search(r"(" + "|".join(MESES) + r")\s+(?:DE\s+)?(\d{4})", texto):
        return f"{achado.group(2)}-{MESES[achado.group(1)]:02d}"
    return None


def area_m2(texto) -> float | None:
    """'2.900m²' -> 2900; '3,7 MIL M²' -> 3700; '180²' -> 180; 'S/I' -> None"""
    if pd.isna(texto):
        return None
    texto = str(texto).upper().replace("²", "")
    achado = re.search(r"\d[\d.,]*", texto)
    if not achado:
        return None
    numero = achado.group(0)
    if re.fullmatch(r"\d+\.0", numero):  # célula numérica lida como texto
        numero = numero[:-2]
    valor = float(numero.replace(".", "").replace(",", "."))
    return valor * 1000 if "MIL" in texto else valor


def transformar (df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")]
    df.columns = [normalizar_nome(c) for c in df.columns]

    df = df.rename(columns=lambda c: "obs" if c.startswith("obs") else c)
    for coluna in df.select_dtypes(include=["object", "str"]).columns:
        df[coluna] = df[coluna].str.strip()

    agen_matri = df["agente_matricula"].str.split("/", n=1, expand=True)
    df = df.drop(columns=["agente_matricula"])

    df["ano"] = pd.to_numeric(df["ano"], errors="coerce")
    df["ciclos"] = pd.to_numeric(df["ciclos"], errors="coerce")
    df["ds"] = df["ds"].str.strip()
    df["bairro"] = df["bairro"].str.strip()
    df["bairro_area"] = df["bairro_area"].str.strip()
    df["agente"] = agen_matri[0].str.strip()
    df["matricula"] = agen_matri[1].str.strip()
    df["qt"] = pd.to_numeric(df["qt"], errors="coerce")
    df["id_ovt"] = df["id_ovt"].str.strip()
    df["dt_coleta"] = pd.to_datetime(df["dt_coleta"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["dt_entrega_apoio"] = pd.to_datetime(df["dt_entrega_apoio"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["dt_entrega_lab"] = pd.to_datetime(df["dt_entrega_lab"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["dt_leitura"] = pd.to_datetime(df["dt_leitura"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["nm_tec_lab"] = df["nm_tec_lab"].str.strip()
    df["dt_dig"] = pd.to_datetime(df["dt_dig"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["dt_envio_ds"] = pd.to_datetime(df["dt_envio_ds"], errors="coerce", format="ISO8601").dt.strftime("%Y-%m-%d")
    df["n_ovos"] = pd.to_numeric(df["n_ovos"], errors="coerce")
    df["obs"] = df["obs"].str.strip()

    df = df.dropna(how='all')
    df = df.drop_duplicates()

    return df


# ---------------------------------------------------------------- EDL por DS

CABECALHO_EDL = {
    "no": "numero",
    "qt": "qt",
    "resp_pelo_pe": "resp_pe",
    "tipo_pe": "tipo_pe",
    "nome_fantasia_comercial": "nome",
    "logradouro": "logradouro",
    "bairro": "bairro",
    "coordenadas": "coordenadas",
    "tamanho": "tamanho",
    "quant_de_edl_ideal": "qt_edl_ideal",
    "quant_de_edl_real": "qt_edl_real",
}


def _colunas_edl(cabecalho: list) -> tuple[dict, list, list]:
    """Acha a posição de cada campo pelo texto do cabeçalho, porque as abas não
    têm as mesmas colunas (umas têm 'EDL IDEAL', a do DS 3 põe as coordenadas
    numa célula só). Devolve (campos, colunas de coordenada, colunas de obs)."""
    campos = {}
    for i, titulo in enumerate(cabecalho):
        if pd.notna(titulo) and normalizar_nome(titulo) in CABECALHO_EDL:
            campos[CABECALHO_EDL[normalizar_nome(titulo)]] = i
    inicio = campos.pop("coordenadas")
    fim = min(i for i in campos.values() if i > inicio)  # 'COORDENADAS' ocupa H:I mesclado
    coord = list(range(inicio, fim))
    obs = list(range(campos["qt_edl_real"] + 1, len(cabecalho)))  # data/observação de instalação
    return campos, coord, obs


def transformar_edl(bruto: pd.DataFrame, ds: str) -> pd.DataFrame:
    """Uma aba 'DS n - TOTAL' (lida com header=None). Ela tem blocos
    ('EDL - PONTO ESTRATÉGICO GEVACZ', 'EDL - OUTROS EQUIPAMENTOS'...), uma
    linha TOTAL e, às vezes, um bloco RETIRADO no fim. Vira uma tabela com
    categoria e situacao em colunas."""
    linhas = bruto.values.tolist()
    topo = next(i for i, linha in enumerate(linhas) if normalizar_nome(linha[0]) == "no")
    campos, coord, obs = _colunas_edl(linhas[topo])

    registros = []
    categoria, situacao = None, "ATIVA"
    for linha in linhas[topo - 1::-1]:  # o 1º bloco fica acima do cabeçalho
        if (texto_limpo(linha[0]) or "").upper().startswith("EDL -"):
            categoria = texto_limpo(linha[0])[5:].strip().upper()
            break
    for linha in linhas[topo + 1:]:
        celulas = [texto_limpo(v) for v in linha]
        marcadores = {sem_acento(c).upper() for c in celulas if c}
        if (celulas[0] or "").upper().startswith("EDL -"):
            categoria = celulas[0][5:].strip().upper()
            continue
        if marcadores & {"RETIRADO", "RETIRADOS"}:
            categoria, situacao = None, "RETIRADA"
            continue
        if "TOTAL" in marcadores:
            continue

        # campo que a aba não tem (ex.: 'EDL IDEAL' só existe em algumas) fica vazio
        registro = {campo: celulas[campos[campo]] if campo in campos else None
                    for campo in CABECALHO_EDL.values() if campo != "coordenadas"}
        if not (registro["nome"] or registro["logradouro"] or registro["qt_edl_real"]):
            continue
        registro["latitude"], registro["longitude"] = coordenadas(*(celulas[i] for i in coord))
        registro.update(
            ds=ds,
            categoria=categoria,
            situacao=situacao,
            coordenadas_original=juntar(*(celulas[i] for i in coord)),
            obs=juntar(*(celulas[i] for i in obs)),
        )
        registros.append(registro)

    df = pd.DataFrame(registros)
    for coluna in ["numero", "qt", "qt_edl_ideal", "qt_edl_real"]:
        df[coluna] = pd.to_numeric(df[coluna], errors="coerce")
    df["resp_pe"] = df["resp_pe"].str.upper().replace({"DISTITRÍTO": "DISTRITO"})
    df["tipo_pe"] = df["tipo_pe"].str.upper()
    df["bairro"] = df["bairro"].str.upper()
    df["tamanho_m2"] = df["tamanho"].map(area_m2)
    df["dt_instalacao"] = df["obs"].map(data_instalacao)
    # célula de data pura não é observação: a data já está em dt_instalacao
    df["obs"] = df["obs"].where(~df["obs"].str.fullmatch(r"\d{4}-\d{2}-\d{2} 00:00:00", na=False))

    df = df.drop_duplicates()
    return df[["ds", "categoria", "situacao", "numero", "qt", "resp_pe", "tipo_pe", "nome",
               "logradouro", "bairro", "latitude", "longitude", "coordenadas_original",
               "tamanho", "tamanho_m2", "qt_edl_ideal", "qt_edl_real", "dt_instalacao", "obs"]]


def transformar_resumo_edl(bruto: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Aba 'TOTAL DE PE E EDL': à esquerda o total por DS, à direita um bloco
    'EDL POR BAIRRO' para cada DS lado a lado. Devolve (resumo_ds, resumo_bairro)."""
    linhas = bruto.values.tolist()

    topo = next(i for i, linha in enumerate(linhas) if normalizar_nome(linha[0]) == "distrito_sanitario")
    colunas = [normalizar_nome(t) for t in linhas[topo][1:10]]
    por_ds = [
        {"ds": ds_romano(linha[0]), **dict(zip(colunas, linha[1:10]))}
        for linha in linhas[topo + 1:]
        if re.fullmatch(r"DS \d", texto_limpo(linha[0]) or "")
    ]
    resumo_ds = pd.DataFrame(por_ds)
    resumo_ds[colunas] = resumo_ds[colunas].apply(pd.to_numeric, errors="coerce")

    por_bairro = []
    titulos = [texto_limpo(t) or "" for t in linhas[topo - 1]]
    for j, titulo in enumerate(titulos):
        if not titulo.upper().startswith("DISTRITO SANIT"):
            continue
        locais = titulos.index("LOCAIS", j)
        edls = titulos.index("EDLs", j)
        for linha in linhas[topo:]:
            bairro = texto_limpo(linha[j])
            if bairro:
                por_bairro.append({"ds": ds_romano(titulo), "bairro": bairro.upper(),
                                   "locais": linha[locais], "edls": linha[edls]})
    resumo_bairro = pd.DataFrame(por_bairro)
    resumo_bairro["locais"] = pd.to_numeric(resumo_bairro["locais"], errors="coerce")
    resumo_bairro["edls"] = pd.to_numeric(resumo_bairro["edls"], errors="coerce")

    return resumo_ds, resumo_bairro


# ------------------------------------------------ Georreferenciamento das OVT

def transformar_georef(df: pd.DataFrame, ds: str) -> pd.DataFrame:
    """Uma aba 'DS n - ID OVT'; todas têm o mesmo cabeçalho."""
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")].copy()
    df.columns = [normalizar_nome(c) for c in df.columns]
    df["ds"] = ds

    for coluna in df.columns:
        df[coluna] = df[coluna].map(texto_limpo)
    df = df.dropna(subset=["id_ovt"])

    # 'SAM 1001' -> 'SAM1001', mesmo formato do id_ovt em total_ovt.db
    df["id_ovt"] = df["id_ovt"].str.replace(r"\s", "", regex=True).str.upper()
    df["bairro"] = df["bairro"].str.upper()
    # extract em vez de split: numa aba sem nenhuma '/matrícula' a 2ª parte ainda existe
    agen_matri = df["agente_matricula"].str.extract(r"^([^/]*)(?:/(.*))?$")
    df["agente"] = agen_matri[0].str.strip()
    df["matricula"] = agen_matri[1].str.strip()
    df["coordenadas_original"] = [juntar(la, lo) for la, lo in zip(df["latitude"], df["longitude"])]
    latlon = [coordenadas(la, lo) for la, lo in zip(df["latitude"], df["longitude"])]
    df["latitude"] = [lat for lat, _ in latlon]
    df["longitude"] = [lon for _, lon in latlon]
    df["qt"] = pd.to_numeric(df["qt"], errors="coerce")
    df["data"] = para_data(df["data"])

    df = df.drop_duplicates()
    return df[["ds", "bairro", "id_ovt", "latitude", "longitude", "coordenadas_original",
               "endereco", "qt", "agente", "matricula", "data"]]


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
