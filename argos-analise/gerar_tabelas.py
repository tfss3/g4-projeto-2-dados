#!/usr/bin/env python3
"""ARGOS GeoVigilância · Grupo 4 · tabelas de análise.

Lê o banco SQLite já limpo pelo pipeline do grupo (dados/argos.db) e gera:

  tabelas/   modelo dimensional (dim_*, fato_leitura) e as tabelas de análise T01..T12, em CSV
  ARGOS_tabelas_de_analise.xlsx   as mesmas tabelas em um único Excel
  mongo/     coleções em JSON Lines (formato do mongoimport / Atlas)
  graficos/  quatro gráficos em PNG

Uso:   python gerar_tabelas.py          (precisa de pandas, numpy, scipy, openpyxl, matplotlib)

Regras dos indicadores (Nota Técnica nº 3/2025, as mesmas do projeto do grupo):
  A = armadilha examinada (n_ovos preenchido)   P = armadilha positiva (n_ovos > 0)   O = ovos
  IPO = P/A*100     IDO = O/P     IDV = O/A
  Sempre soma A, P e O no grupo e só depois divide (nunca média de taxas).
  Denominador zero vira vazio ("não calculável").
"""
from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

RAIZ = Path(__file__).resolve().parent
DB = RAIZ / "dados" / "argos.db"
TAB, MONGO, GRAF = RAIZ / "tabelas", RAIZ / "mongo", RAIZ / "graficos"
XLSX = RAIZ / "ARGOS_tabelas_de_analise.xlsx"

ORDEM_DS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
FAIXAS = ["0–100 m", "100–200 m", "200–300 m", "300–400 m", "400–600 m", "600–1.000 m", "acima de 1.000 m"]
RAIOS = (300, 400)
AMOSTRA_MIN = 300  # menos de 300 armadilhas examinadas = amostra pequena (mesmo critério do painel)
AMOSTRA_CELULA = 100  # nas tabelas cruzadas (DS × faixa, ciclo × faixa) cada célula é menor: aviso abaixo de 100


# ----------------------------------------------------------------------------
# utilidades
# ----------------------------------------------------------------------------
def indicadores(df: pd.DataFrame, por: list[str] | None = None) -> pd.DataFrame:
    """Soma A, P, O (por grupo) e só depois calcula IPO, IDO, IDV."""
    if por:
        g = df.groupby(por, observed=True, dropna=False)[["A", "P", "O"]].sum().reset_index()
    else:
        g = df[["A", "P", "O"]].sum().to_frame().T
    g["IPO"] = 100 * g["P"] / g["A"].where(g["A"] > 0)
    g["IDO"] = g["O"] / g["P"].where(g["P"] > 0)
    g["IDV"] = g["O"] / g["A"].where(g["A"] > 0)
    return g


def grupo_raio(dist: pd.Series, r: int) -> pd.Series:
    return pd.Series(np.select([dist.isna(), dist <= r], ["sem coordenada válida", f"dentro de {r} m"],
                               default=f"fora de {r} m"), index=dist.index)


def _norm(s) -> str | None:
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return None
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


_SUFIXO = re.compile(r"(?:\s+(?:AREA\s*\d+|\d+|[IVX]+))+$")


def chave_bairro(s) -> str | None:
    """'Santo Amaro II', 'IBURA 01', 'Campo Grande – Área 1' -> chave sem o número da área."""
    n = _norm(s)
    return None if n is None else _SUFIXO.sub("", n).strip()


# ----------------------------------------------------------------------------
# 1. leitura e modelo dimensional
# ----------------------------------------------------------------------------
def carregar():
    con = sqlite3.connect(DB)
    obs = pd.read_sql("select * from ovt", con)
    cad = pd.read_sql("select * from ovt_cadastro", con)
    prox = pd.read_sql("select * from ovt_proximidade", con)
    edl = pd.read_sql("select * from edl_local", con)
    con.close()
    return obs, cad, prox, edl


def modelar(obs, cad, prox, edl):
    ds_num = {d: i + 1 for i, d in enumerate(ORDEM_DS)}

    # --- dim_ciclo: data do ciclo = mediana das datas de coleta (ciclos de 15 dias)
    dt = pd.to_datetime(obs["dt_coleta"])
    dim_ciclo = (pd.DataFrame({"ciclo": obs["ciclos"], "dt": dt})
                 .groupby("ciclo")["dt"].agg(data_ciclo="median", coleta_inicio="min", coleta_fim="max").reset_index())
    dim_ciclo["data_ciclo"] = dim_ciclo["data_ciclo"].dt.normalize()

    # --- fato_leitura: 1 linha por OVT e ciclo
    f = obs.copy()
    f["ds_num"] = f["ds"].map(ds_num)
    f["ciclo"] = f["ciclos"]
    f["codigo_obs"] = f["obs"].replace({"REC-2026": "REC", "REC-2025": "REC"})
    f["A"] = f["n_ovos"].notna().astype(int)
    f["P"] = (f["n_ovos"].fillna(0) > 0).astype(int)
    f["O"] = f["n_ovos"].fillna(0).astype(int)
    f = f.merge(prox[["id_ovt", "dist_m", "faixa_dist", "id_edl_proxima", "dt_instalacao_edl"]], on="id_ovt",
                how="left", validate="many_to_one")
    f = f.merge(dim_ciclo[["ciclo", "data_ciclo"]], on="ciclo", how="left", validate="many_to_one")
    for r in RAIOS:
        f[f"grupo_{r}m"] = grupo_raio(f["dist_m"], r)
    f["dt_coleta"] = pd.to_datetime(f["dt_coleta"])
    f["dt_instalacao_edl"] = pd.to_datetime(f["dt_instalacao_edl"])
    fato = f.rename(columns={"id": "id_leitura"})[
        ["id_leitura", "id_ovt", "ciclo", "ds", "ds_num", "bairro", "dt_coleta", "data_ciclo", "situacao_coleta",
         "codigo_obs", "n_ovos", "n_ovos_imputado", "A", "P", "O", "dist_m", "faixa_dist", "grupo_300m", "grupo_400m",
         "id_edl_proxima", "dt_instalacao_edl"]]

    # --- dim_ovt: 1 linha por OVT (bairro = o da planilha de observações, usado em todas as tabelas)
    bairro_obs = obs.drop_duplicates("id_ovt").set_index("id_ovt")["bairro"]
    dim_ovt = cad.merge(prox, on="id_ovt", how="left", validate="one_to_one")
    dim_ovt["bairro_cadastro"] = dim_ovt["bairro"]
    dim_ovt["bairro"] = dim_ovt["id_ovt"].map(bairro_obs)
    # 2 OVTs (SJS1005, MGR5013) têm DS diferente no cadastro e nas observações; guardamos os dois
    dim_ovt["ds_cadastro"], dim_ovt["ds_num_cadastro"] = dim_ovt["ds"], dim_ovt["ds_num"]
    dim_ovt["ds_observacao"] = dim_ovt["id_ovt"].map(obs.drop_duplicates("id_ovt").set_index("id_ovt")["ds"])
    dim_ovt["dentro_300m"] = (dim_ovt["dist_m"] <= 300).astype(int)
    dim_ovt = dim_ovt[["id_ovt", "ds_cadastro", "ds_num_cadastro", "ds_observacao", "bairro", "bairro_cadastro", "endereco", "lat", "lon", "fonte_coord",
                       "status_coord", "alerta_local", "dt_instalacao_ovt", "origem_data_ovt", "dist_m", "faixa_dist",
                       "id_edl_proxima", "n_locais_ate_400m", "dentro_300m", "dentro_400m"]]

    # --- dim_edl: 1 linha por local de EDL
    dim_edl = edl[["id_edl", "ds", "ds_num", "nome", "tipo", "secao", "logradouro", "bairro", "lat", "lon",
                   "fonte_coord", "precisao_local", "status_coord", "qtd_edl", "dt_instalacao", "precisao_data"]].copy()
    dim_edl["fonte_coord"] = dim_edl["fonte_coord"].fillna("sem posição")
    return fato, dim_ovt, dim_edl, dim_ciclo


# ----------------------------------------------------------------------------
# 2. tabelas de análise
# ----------------------------------------------------------------------------
def tabelas_analise(fato, dim_ovt, dim_edl, dim_ciclo):
    T: dict[str, pd.DataFrame] = {}
    ok = fato[fato["dist_m"].notna()]  # leituras de OVTs com coordenada válida (todas, neste conjunto)

    # T01 visão geral --------------------------------------------------------
    geral = indicadores(fato).iloc[0]
    ligados, total_edl, nbairros = _edl_por_bairro(dim_ovt, dim_edl)[1:]
    n_tardias = int((fato.groupby("id_ovt")["ciclo"].min() >= 10).sum())
    n_ds_dif = int((dim_ovt["ds_cadastro"] != dim_ovt["ds_observacao"]).sum())
    T["T01_visao_geral"] = pd.DataFrame([
        ("Ciclos de coleta (15 dias)", fato["ciclo"].nunique(), "ciclos 1 a 12 de 2026"),
        ("Ovitrampas (OVT) no cadastro", dim_ovt["id_ovt"].nunique(), "1 linha por OVT"),
        ("Leituras OVT × ciclo", len(fato), "grão da tabela fato_leitura"),
        ("Leituras sem resultado (F, E, R, D)", int((fato["A"] == 0).sum()), "ficam fora de A, P e O"),
        ("Leituras com ovos preenchidos pela média do bairro", int(fato["n_ovos_imputado"].sum()), "regra do grupo (13/10)"),
        ("A · armadilhas examinadas", int(geral["A"]), ""),
        ("P · armadilhas positivas", int(geral["P"]), ""),
        ("O · ovos contados", int(geral["O"]), "inclui os preenchidos pela média"),
        ("IPO · positividade (%)", round(geral["IPO"], 2), "quase toda armadilha tem ovos: pouco discrimina"),
        ("IDO · ovos por armadilha positiva", round(geral["IDO"], 2), ""),
        ("IDV · ovos por armadilha examinada", round(geral["IDV"], 2), ""),
        ("Locais de EDL", len(dim_edl), "1 linha por local"),
        ("Estações EDL nesses locais", int(dim_edl["qtd_edl"].sum()), ""),
        ("Locais de EDL ligados a um bairro das OVTs (pelo nome)", f"{ligados} de {total_edl}",
         f"normalização do texto; {nbairros} bairros com EDL"),
        ("OVTs que só entram a partir do ciclo 10", n_tardias,
         "todas no DS V (3 leituras cada): a composição da amostra muda no ciclo 10"),
        ("OVTs com DS diferente no cadastro e nas observações", n_ds_dif,
         "SJS1005 e MGR5013 (alerta 'longe do bairro'); indicadores usam o DS das observações"),
    ], columns=["medida", "valor", "observação"])

    # T02 por ciclo ------------------------------------------------------------
    t = indicadores(fato, ["ciclo"])
    extra = fato.groupby("ciclo").agg(ovts_com_leitura=("id_ovt", "nunique"), leituras=("id_ovt", "size"),
                                      sem_resultado=("A", lambda s: int((s == 0).sum())),
                                      preenchidas_pela_media=("n_ovos_imputado", "sum")).reset_index()
    t = dim_ciclo[["ciclo", "data_ciclo"]].merge(extra, on="ciclo").merge(t, on="ciclo")
    T["T02_por_ciclo"] = t[["ciclo", "data_ciclo", "ovts_com_leitura", "leituras", "sem_resultado", "preenchidas_pela_media",
                            "A", "P", "O", "IPO", "IDO", "IDV"]]

    # T03 por DS ---------------------------------------------------------------
    t = indicadores(fato, ["ds_num", "ds"])
    # contagem de OVTs e cobertura pelo DS do cadastro (como no relatório do grupo); A, P, O pelo DS das observações
    prox_ds = (dim_ovt.groupby("ds_num_cadastro").agg(ovts_cadastro=("id_ovt", "size"), pct_ovts_ate_300m=("dentro_300m", "mean"),
                                                      pct_ovts_ate_400m=("dentro_400m", "mean"))
               .reset_index().rename(columns={"ds_num_cadastro": "ds_num"}))
    prox_ds[["pct_ovts_ate_300m", "pct_ovts_ate_400m"]] *= 100
    e = dim_edl.groupby("ds_num").agg(locais_edl=("id_edl", "size"), estacoes_edl=("qtd_edl", "sum")).reset_index()
    T["T03_por_ds"] = (t.merge(prox_ds, on="ds_num").merge(e, on="ds_num")
                       [["ds_num", "ds", "ovts_cadastro", "A", "P", "O", "IPO", "IDO", "IDV",
                         "locais_edl", "estacoes_edl", "pct_ovts_ate_300m", "pct_ovts_ate_400m"]])

    # T04 DS × ciclo (formato longo) e T04b matriz do IDV ------------------------
    t = indicadores(fato, ["ds_num", "ds", "ciclo"])
    T["T04_ds_x_ciclo"] = t
    T["T04b_matriz_IDV"] = t.pivot(index="ds", columns="ciclo", values="IDV").reindex(ORDEM_DS).reset_index()

    # T05 por bairro -----------------------------------------------------------
    t = indicadores(fato, ["ds", "bairro"])
    pb = dim_ovt.groupby("bairro").agg(n_ovts=("id_ovt", "size"), pct_ovts_ate_400m=("dentro_400m", "mean")).reset_index()
    pb["pct_ovts_ate_400m"] *= 100
    edl_b = _edl_por_bairro(dim_ovt, dim_edl)[0]
    t = t.merge(pb, on="bairro", how="left").merge(edl_b, on="bairro", how="left")
    t[["locais_edl_por_nome", "estacoes_edl_por_nome"]] = t[["locais_edl_por_nome", "estacoes_edl_por_nome"]].fillna(0).astype(int)
    t["amostra"] = np.where(t["A"] < AMOSTRA_MIN, "pequena (< 300 armadilhas)", "ok")
    t["_pequena"] = t["amostra"] != "ok"  # amostras adequadas primeiro, depois as pequenas; dentro de cada grupo, IDV decrescente
    T["T05_por_bairro"] = (t.sort_values(["_pequena", "IDV"], ascending=[True, False])
                           [["ds", "bairro", "n_ovts", "A", "P", "O", "IPO", "IDO", "IDV", "pct_ovts_ate_400m",
                             "locais_edl_por_nome", "estacoes_edl_por_nome", "amostra"]])

    # T06 por faixa de distância até a EDL mais próxima (V2 do painel) -------------
    t = indicadores(ok, ["faixa_dist"])
    t["faixa_dist"] = pd.Categorical(t["faixa_dist"], FAIXAS, ordered=True)
    nov = ok.groupby("faixa_dist")["id_ovt"].nunique().rename("n_ovts")
    t = t.sort_values("faixa_dist").merge(nov, left_on="faixa_dist", right_index=True)
    t["IDV_dif_recife"] = t["IDV"] - geral["IDV"]
    t["amostra"] = np.where(t["A"] < AMOSTRA_MIN, "pequena (< 300 armadilhas)", "ok")
    T["T06_por_faixa_dist"] = t[["faixa_dist", "n_ovts", "A", "P", "O", "IPO", "IDO", "IDV", "IDV_dif_recife", "amostra"]]

    # T07 dentro × fora do raio (300 e 400 m), Recife e por DS ----------------------
    linhas = []
    for r in RAIOS:
        for ds in ["Todos"] + ORDEM_DS:
            b = ok if ds == "Todos" else ok[ok["ds"] == ds]
            g = indicadores(b, [f"grupo_{r}m"]).set_index(f"grupo_{r}m")
            n = b.groupby(f"grupo_{r}m")["id_ovt"].nunique()
            d, fo = f"dentro de {r} m", f"fora de {r} m"
            if d not in g.index or fo not in g.index:
                continue
            linhas.append({"raio_m": r, "ds": ds,
                           "n_ovts_dentro": n[d], "n_ovts_fora": n[fo], "A_dentro": g.loc[d, "A"], "A_fora": g.loc[fo, "A"],
                           "IDV_dentro": g.loc[d, "IDV"], "IDV_fora": g.loc[fo, "IDV"],
                           "IDV_dif": g.loc[d, "IDV"] - g.loc[fo, "IDV"],
                           "IDV_dif_pct": 100 * (g.loc[d, "IDV"] / g.loc[fo, "IDV"] - 1),
                           "IPO_dentro": g.loc[d, "IPO"], "IPO_fora": g.loc[fo, "IPO"],
                           "amostra": "ok" if min(g.loc[d, "A"], g.loc[fo, "A"]) >= AMOSTRA_MIN
                           else "pequena (< 300 armadilhas em um dos lados)"})
    T["T07_dentro_fora_raio"] = pd.DataFrame(linhas)

    # T08 estatística descritiva dos ovos por leitura (só leituras reais) --------------
    real = fato[(fato["A"] == 1) & (fato["n_ovos_imputado"] == 0)]
    def desc(x: pd.Series) -> pd.Series:
        return pd.Series({"leituras": len(x), "media": x.mean(), "desvio_padrao": x.std(), "minimo": x.min(),
                          "p25": x.quantile(.25), "mediana": x.median(), "p75": x.quantile(.75),
                          "p90": x.quantile(.90), "p99": x.quantile(.99), "maximo": x.max(),
                          "pct_zero": 100 * (x == 0).mean(), "leituras_acima_1000": int((x > 1000).sum())})
    d_ds = real.groupby("ds")["n_ovos"].apply(desc).unstack().reindex(ORDEM_DS)
    d_all = desc(real["n_ovos"]).to_frame("Todos").T
    T["T08_descritiva_ovos"] = pd.concat([d_all, d_ds]).rename_axis("ds").reset_index()

    # T09 situação da coleta por ciclo (códigos OBS) ----------------------------------
    c = (fato.assign(codigo=fato["codigo_obs"].fillna("sem código"))
         .pivot_table(index="ciclo", columns="codigo", values="id_ovt", aggfunc="count", fill_value=0))
    for k in ["F", "E", "R", "D", "REC", "sem código"]:
        if k not in c:
            c[k] = 0
    c = c[["sem código", "REC", "F", "E", "R", "D"]].rename(columns={"REC": "REC (recuperada)", "F": "F (fechado)",
                                                                  "E": "E (extraviado)", "R": "R (recusado)", "D": "D (desocupado)"})
    c["leituras"] = c.sum(axis=1)
    c["pct_sem_resultado"] = 100 * (c["F (fechado)"] + c["E (extraviado)"] + c["R (recusado)"] + c["D (desocupado)"]) / c["leituras"]
    c["preenchidas_pela_media"] = fato.groupby("ciclo")["n_ovos_imputado"].sum()
    T["T09_situacao_coleta"] = c.reset_index()

    # T10 associação entre distância à EDL e IDV de cada OVT ---------------------------
    po = indicadores(ok, ["ds", "id_ovt"]).merge(dim_ovt[["id_ovt", "dist_m"]], on="id_ovt")
    po = po[po["A"] > 0]
    def assoc(b: pd.DataFrame, nome: str) -> dict:
        rho, p = stats.spearmanr(b["dist_m"], b["IDV"])
        forca = "desprezível" if abs(rho) < .1 else "fraca" if abs(rho) < .3 else "moderada" if abs(rho) < .5 else "forte"
        return {"escopo": nome, "n_ovts": len(b), "rho_spearman": rho, "p_valor": p, "intensidade": forca,
                "sentido": "IDV cai com a distância" if rho < 0 else "IDV sobe com a distância"}
    T["T10_associacao_dist_IDV"] = pd.DataFrame([assoc(po, "Todos")] + [assoc(po[po["ds"] == d], d) for d in ORDEM_DS])

    # T11 qualidade da posição e da data das EDL, por DS --------------------------------
    q = dim_edl.assign(
        pos_planilha=(dim_edl["fonte_coord"] == "planilha").astype(int),
        pos_endereco=(dim_edl["fonte_coord"] == "endereco").astype(int),
        sem_posicao=(dim_edl["fonte_coord"] == "sem posição").astype(int),
        data_dia=(dim_edl["precisao_data"] == "dia").astype(int),
        data_so_mes=(dim_edl["precisao_data"] == "mes").astype(int),
        sem_data=dim_edl["dt_instalacao"].isna().astype(int))
    q = q.groupby(["ds_num"]).agg(locais_edl=("id_edl", "size"), estacoes_edl=("qtd_edl", "sum"),
                                  pos_planilha=("pos_planilha", "sum"), pos_endereco=("pos_endereco", "sum"),
                                  sem_posicao=("sem_posicao", "sum"), data_dia=("data_dia", "sum"),
                                  data_so_mes=("data_so_mes", "sum"), sem_data=("sem_data", "sum")).reset_index()
    q.insert(1, "ds", q["ds_num"].map(lambda i: ORDEM_DS[i - 1]))
    tot = q.drop(columns=["ds"]).sum(numeric_only=True)
    tot["ds_num"], tot["ds"] = 0, "Todos"
    T["T11_qualidade_edl"] = pd.concat([pd.DataFrame([tot])[q.columns], q], ignore_index=True).drop(columns="ds_num")

    # T12 antes × depois da instalação da EDL mais próxima -------------------------------
    linhas = []
    b0 = fato[fato["dt_instalacao_edl"].notna() & fato["data_ciclo"].notna() & fato["dist_m"].notna()]
    for r in RAIOS:
        b = b0.assign(grupo=grupo_raio(b0["dist_m"], r),
                      periodo=np.where(b0["data_ciclo"] >= b0["dt_instalacao_edl"], "depois", "antes"))
        t = indicadores(b, ["grupo", "periodo"])
        n = b.groupby("grupo")["id_ovt"].nunique()
        for g in t["grupo"].unique():
            x = t[t["grupo"] == g].set_index("periodo")
            if {"antes", "depois"} <= set(x.index):
                linhas.append({"raio_m": r, "grupo": g, "n_ovts": n[g], "A_antes": x.loc["antes", "A"],
                               "A_depois": x.loc["depois", "A"], "IDV_antes": x.loc["antes", "IDV"],
                               "IDV_depois": x.loc["depois", "IDV"],
                               "variacao_IDV": x.loc["depois", "IDV"] - x.loc["antes", "IDV"],
                               "variacao_IDV_pct": 100 * (x.loc["depois", "IDV"] / x.loc["antes", "IDV"] - 1)})
    T["T12_antes_depois"] = pd.DataFrame(linhas)

    # T13 DS × faixa · T14 ciclo × faixa · T15 bairro × ciclo (base dos mapas de calor) -----------
    def com_amostra(t: pd.DataFrame, minimo: int) -> pd.DataFrame:
        t = t.copy()
        t["amostra"] = np.where(t["A"] < minimo, f"pequena (< {minimo} armadilhas)", "ok")
        return t

    def faixa_cat(t: pd.DataFrame) -> pd.DataFrame:
        t["faixa_dist"] = pd.Categorical(t["faixa_dist"], FAIXAS, ordered=True)
        return t

    t = faixa_cat(indicadores(ok, ["ds_num", "ds", "faixa_dist"]))
    T["T13_ds_x_faixa"] = com_amostra(t.sort_values(["ds_num", "faixa_dist"]), AMOSTRA_CELULA)
    t = faixa_cat(indicadores(ok, ["ciclo", "faixa_dist"]))
    T["T14_ciclo_x_faixa"] = com_amostra(t.sort_values(["ciclo", "faixa_dist"]), AMOSTRA_CELULA)
    t = indicadores(fato, ["ds", "bairro", "ciclo"])
    total_bairro = t.groupby("bairro")["A"].transform("sum")
    t["amostra_bairro"] = np.where(total_bairro < AMOSTRA_MIN, "pequena (< 300 armadilhas no ano)", "ok")
    T["T15_bairro_x_ciclo"] = t.sort_values(["ds", "bairro", "ciclo"])

    # T00 conferências internas (todas devem dar OK) ---------------------------------------
    chk = []
    def ok_(nome, cond, det=""):
        chk.append({"conferência": nome, "resultado": "OK" if cond else "FALHOU", "detalhe": det})
    ok_("fato_leitura tem 1 linha por OVT e ciclo", not fato.duplicated(["id_ovt", "ciclo"]).any(), f"{len(fato)} linhas")
    ok_("toda leitura tem OVT no cadastro", fato["id_ovt"].isin(dim_ovt["id_ovt"]).all())
    ok_("A + leituras sem resultado = total de leituras", int(fato["A"].sum() + (fato["A"] == 0).sum()) == len(fato))
    ok_("soma de ovos por DS = soma geral", int(T["T03_por_ds"]["O"].sum()) == int(fato["O"].sum()), f"{int(fato['O'].sum()):,}".replace(",", "."))
    ok_("soma de ovos por ciclo = soma geral", int(T["T02_por_ciclo"]["O"].sum()) == int(fato["O"].sum()))
    ok_("soma de ovos por bairro = soma geral", int(T["T05_por_bairro"]["O"].sum()) == int(fato["O"].sum()))
    ok_("soma de ovos por faixa = soma geral", int(T["T06_por_faixa_dist"]["O"].sum()) == int(ok["O"].sum()))
    ok_("dentro + fora do raio cobrem todas as leituras (400 m)",
        int(T["T07_dentro_fora_raio"].query("raio_m==400 and ds=='Todos'")[["A_dentro", "A_fora"]].sum(axis=1).iloc[0]) == int(ok["A"].sum()))
    ok_("nenhuma proximidade tem distância negativa", bool((dim_ovt["dist_m"].dropna() >= 0).all()))
    ok_("A, P, O por DS das observações somam o total", int(indicadores(fato, ["ds"])["A"].sum()) == int(fato["A"].sum()))
    ok_("soma de ovos DS × faixa = ovos das OVTs com coordenada", int(T["T13_ds_x_faixa"]["O"].sum()) == int(ok["O"].sum()))
    ok_("soma de ovos ciclo × faixa = ovos das OVTs com coordenada", int(T["T14_ciclo_x_faixa"]["O"].sum()) == int(ok["O"].sum()))
    ok_("soma de ovos bairro × ciclo = soma geral", int(T["T15_bairro_x_ciclo"]["O"].sum()) == int(fato["O"].sum()))

    def soma_faixa(t: pd.DataFrame) -> dict:
        g = t.assign(faixa_dist=t["faixa_dist"].astype(str)).groupby("faixa_dist")[["A", "O"]].sum()
        return {k: (int(r.A), int(r.O)) for k, r in g.iterrows()}
    ok_("T13 e T14 somadas por faixa = T06",
        soma_faixa(T["T13_ds_x_faixa"]) == soma_faixa(T["T14_ciclo_x_faixa"]) == soma_faixa(T["T06_por_faixa_dist"]))
    chk.append({"conferência": "OVTs com DS diferente no cadastro e nas observações", "resultado": "AVISO",
                "detalhe": f"{n_ds_dif} OVTs (SJS1005, MGR5013): contagem de OVTs por DS usa o cadastro; A, P, O usam as observações"})
    chk.append({"conferência": "OVTs sem nenhuma leitura válida", "resultado": "AVISO",
                "detalhe": f"{int((fato.groupby('id_ovt')['A'].sum() == 0).sum())} OVTs ficam de fora de T10 (associação distância × IDV)"})
    T["T00_conferencias"] = pd.DataFrame(chk)
    return T


def _edl_por_bairro(dim_ovt, dim_edl):
    """Liga cada local de EDL a um bairro das OVTs pelo texto do bairro (sem número de área)."""
    bairros = pd.DataFrame({"bairro": dim_ovt["bairro"].dropna().unique()})
    bairros["chave"] = bairros["bairro"].map(chave_bairro)
    unico = bairros.groupby("chave")["bairro"].agg(lambda s: s.iloc[0] if s.nunique() == 1 else None).dropna()
    e = dim_edl.copy()
    e["bairro_ovt"] = e["bairro"].map(chave_bairro).map(unico)
    lig = e.dropna(subset=["bairro_ovt"])
    tab = (lig.groupby("bairro_ovt").agg(locais_edl_por_nome=("id_edl", "size"), estacoes_edl_por_nome=("qtd_edl", "sum"))
           .reset_index().rename(columns={"bairro_ovt": "bairro"}))
    return tab, len(lig), len(e), lig["bairro_ovt"].nunique()


# ----------------------------------------------------------------------------
# 3. saídas: CSV, Excel
# ----------------------------------------------------------------------------
def salvar_csv(fato, dim_ovt, dim_edl, dim_ciclo, T):
    TAB.mkdir(exist_ok=True)
    for nome, df in {"fato_leitura": fato, "dim_ovt": dim_ovt, "dim_edl": dim_edl, "dim_ciclo": dim_ciclo}.items():
        df.to_csv(TAB / f"{nome}.csv", index=False, date_format="%Y-%m-%d")
    for nome, df in T.items():
        df.to_csv(TAB / f"{nome.lower()}.csv", index=False, date_format="%Y-%m-%d")


LEIA_ME = [
    ("ARGOS GeoVigilância · Grupo 4 · tabelas de análise", ""),
    ("Fonte", "Banco limpo do pipeline do grupo (dados/argos.db): 31.455 leituras de OVT, 2.871 OVTs, 378 locais de EDL, ciclos 1 a 12 de 2026 (Recife)."),
    ("A, P, O", "A = armadilha examinada (com ovos preenchidos); P = positiva (ovos > 0); O = ovos. Leituras F, E, R, D ficam fora."),
    ("IPO, IDO, IDV", "IPO = P/A×100 · IDO = O/P · IDV = O/A (Nota Técnica nº 3/2025). Soma A, P, O no grupo e só depois divide."),
    ("Dentro do raio", "OVT com pelo menos um local de EDL a até 300 m (ou 400 m). Distância = Haversine até a EDL mais próxima."),
    ("Atenção · IPO", "O IPO fica em ~98% em quase todo recorte (quase toda armadilha tem ovos). Use IDV e IDO para comparar."),
    ("Atenção · associação", "Diferença entre perto e longe da EDL é associação exploratória, não eficácia: não controla chuva, sazonalidade nem outras ações."),
    ("Atenção · EDL", "180 locais de EDL não tinham coordenada: 174 foram posicionados pelo endereço (estimativa) e 6 ficaram sem posição."),
    ("Atenção · datas", "176 de 378 locais de EDL não têm data de instalação: o antes × depois (T12) cobre só os que têm."),
    ("Atenção · composição", "333 OVTs (todos do DS V) só entram a partir do ciclo 10 (veja ovts_com_leitura em T02): a amostra muda; compare ciclos com cuidado, de preferência dentro de cada DS."),
    ("Atenção · DS", "2 OVTs (SJS1005, MGR5013) têm DS diferente no cadastro e nas observações. Os indicadores usam o DS das observações; a contagem de OVTs e a cobertura por raio (T03) usam o do cadastro, como no relatório do grupo."),
    ("Atenção · bairro das EDL", "O bairro das EDL é texto livre; T05 liga ao bairro das OVTs pelo nome normalizado (ver T01 para a taxa de ligação)."),
    ("", ""),
    ("Aba", "Conteúdo"),
    ("T00_conferencias", "Conferências internas: somas por grupo = soma geral, 1 linha por OVT e ciclo etc."),
    ("T01_visao_geral", "Números gerais da base e do Recife."),
    ("T02_por_ciclo", "A, P, O, IPO, IDO, IDV por ciclo (com a data do ciclo)."),
    ("T03_por_ds", "Indicadores por distrito sanitário, estações de EDL e % de OVTs a até 300/400 m."),
    ("T04_ds_x_ciclo", "DS × ciclo em formato longo (96 linhas), ideal para gráficos."),
    ("T04b_matriz_IDV", "Matriz DS × ciclo do IDV, com escala de cor."),
    ("T05_por_bairro", "86 bairros: primeiro os de amostra adequada (IDV decrescente), depois os de amostra pequena (< 300 armadilhas); EDL ligadas pelo nome."),
    ("T06_por_faixa_dist", "Indicadores por faixa de distância até a EDL mais próxima (0–100 m … acima de 1.000 m)."),
    ("T07_dentro_fora_raio", "Dentro × fora de 300 m e de 400 m, Recife e cada DS, com a diferença do IDV."),
    ("T08_descritiva_ovos", "Estatística descritiva dos ovos por leitura (só leituras reais), por DS."),
    ("T09_situacao_coleta", "Códigos de coleta (F, E, R, D, REC) e ovos preenchidos pela média, por ciclo."),
    ("T10_associacao_dist_IDV", "Correlação de Spearman entre a distância à EDL e o IDV de cada OVT (Recife e por DS; só OVTs com ao menos uma leitura válida)."),
    ("T11_qualidade_edl", "Origem da posição e da data de instalação das EDL, por DS."),
    ("T12_antes_depois", "IDV antes × depois da instalação da EDL mais próxima, dentro × fora do raio."),
    ("T13_ds_x_faixa", "Indicadores por DS × faixa de distância (base do mapa de calor g10)."),
    ("T14_ciclo_x_faixa", "Indicadores por ciclo × faixa de distância (base do mapa de calor g11)."),
    ("T15_bairro_x_ciclo", "Indicadores por bairro × ciclo (base do mapa de calor g12); células pequenas, use para ver padrões."),
    ("D_ovt, D_edl, D_ciclo", "Dimensões do modelo (OVT, local de EDL, ciclo). A tabela fato_leitura fica em tabelas/fato_leitura.csv."),
    ("Gráficos", "Pasta graficos/: 12 PNGs (g1 a g12, barras e mapas de calor) e todos_os_graficos.pdf."),
]


def salvar_excel(T, dim_ovt, dim_edl, dim_ciclo):
    from openpyxl.formatting.rule import ColorScaleRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    ordem = ["T00_conferencias"] + [k for k in sorted(T) if k != "T00_conferencias"]
    fmt = {"IPO": "0.0", "IDO": "0.0", "IDV": "0.0", "IDV_dentro": "0.0", "IDV_fora": "0.0", "IDV_dif": "+0.0;-0.0;0.0",
           "IDV_dif_pct": "+0.0;-0.0;0.0", "IDV_dif_recife": "+0.0;-0.0;0.0", "IPO_dentro": "0.0", "IPO_fora": "0.0",
           "IDV_antes": "0.0", "IDV_depois": "0.0", "variacao_IDV": "+0.0;-0.0;0.0", "variacao_IDV_pct": "+0.0;-0.0;0.0",
           "pct_ovts_ate_300m": "0.0", "pct_ovts_ate_400m": "0.0", "pct_sem_resultado": "0.0", "pct_zero": "0.0",
           "media": "0.0", "desvio_padrao": "0.0", "p25": "0", "mediana": "0", "p75": "0", "p90": "0", "p99": "0",
           "rho_spearman": "0.000", "p_valor": "0.0000", "data_ciclo": "dd/mm/yyyy"}
    cab = PatternFill("solid", fgColor="1F3A5F")
    with pd.ExcelWriter(XLSX, engine="openpyxl", datetime_format="DD/MM/YYYY") as xw:
        pd.DataFrame(LEIA_ME, columns=["", " "]).to_excel(xw, sheet_name="LEIA-ME", index=False, header=False)
        for nome in ordem:
            T[nome].to_excel(xw, sheet_name=nome, index=False)
        for nome, df in (("D_ovt", dim_ovt), ("D_edl", dim_edl), ("D_ciclo", dim_ciclo)):
            df.to_excel(xw, sheet_name=nome, index=False)

        # LEIA-ME
        ws = xw.sheets["LEIA-ME"]
        ws.column_dimensions["A"].width = 30
        ws.column_dimensions["B"].width = 120
        for row in ws.iter_rows():
            row[0].font = Font(bold=True)
            row[1].alignment = Alignment(wrap_text=True, vertical="top")
        ws["A1"].font = Font(bold=True, size=14)
        for r in ws.iter_rows(min_row=1):
            if r[0].value == "Aba":
                for c in r[:2]:
                    c.fill, c.font = cab, Font(bold=True, color="FFFFFF")

        # demais abas
        for nome, ws in xw.sheets.items():
            if nome == "LEIA-ME":
                continue
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for c in ws[1]:
                c.fill, c.font = cab, Font(bold=True, color="FFFFFF")
                c.alignment = Alignment(wrap_text=True, vertical="center")
            for j, c in enumerate(ws[1], start=1):
                nome_col = str(c.value)
                larg = max([len(str(nome_col))] + [len(str(x.value)) for x in ws[get_column_letter(j)][1:60] if x.value is not None])
                ws.column_dimensions[get_column_letter(j)].width = min(max(10, larg + 2), 46)
                f = fmt.get(nome_col) or ("#,##0" if nome_col in ("A", "P", "O", "leituras", "n_ovts") else None)
                if f:
                    for x in ws[get_column_letter(j)][1:]:
                        x.number_format = f
        ws = xw.sheets["T04b_matriz_IDV"]
        ws.conditional_formatting.add(f"B2:{get_column_letter(ws.max_column)}{ws.max_row}",
                                      ColorScaleRule(start_type="min", start_color="FFF7E0", mid_type="percentile", mid_value=50,
                                                     mid_color="F6B26B", end_type="max", end_color="B7410E"))
        for row in ws.iter_rows(min_row=2, min_col=2):           # matriz: colunas se chamam "1".."12", sem formato por nome
            for c in row:
                c.number_format = "0"
        ws = xw.sheets["T01_visao_geral"]
        ws.column_dimensions["A"].width, ws.column_dimensions["B"].width, ws.column_dimensions["C"].width = 54, 14, 84
        for row in ws.iter_rows(min_row=2):
            row[1].alignment = Alignment(horizontal="right")
            row[2].alignment = Alignment(indent=1)
            if isinstance(row[1].value, int):
                row[1].number_format = "#,##0"
            elif isinstance(row[1].value, float):
                row[1].number_format = "0.00"
        ws = xw.sheets["T00_conferencias"]
        for row in ws.iter_rows(min_row=2):
            row[1].font = Font(bold=True, color={"OK": "1B7F3B", "AVISO": "B7791F"}.get(row[1].value, "C0392B"))
        ws.column_dimensions["A"].width = 62

        # impressão: paisagem, ajustada à largura da página
        from openpyxl.worksheet.properties import PageSetupProperties
        for w in xw.sheets.values():
            w.page_setup.orientation = "landscape"
            w.page_setup.fitToWidth, w.page_setup.fitToHeight = 1, 0
            w.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)


# ----------------------------------------------------------------------------
# 4. MongoDB (JSON Lines no formato Extended JSON: datas viram {"$date": ...})
# ----------------------------------------------------------------------------
def _limpo(v):
    """Tira vazios (None/NaN) para o documento não carregar campos nulos."""
    if isinstance(v, dict):
        d = {k: _limpo(x) for k, x in v.items()}
        return {k: x for k, x in d.items() if x is not None and x != {} and x != []}
    if isinstance(v, list):
        return [_limpo(x) for x in v]
    if isinstance(v, (float, np.floating)):
        return None if np.isnan(v) else (int(v) if float(v).is_integer() and abs(v) < 1e15 else float(v))
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if v is pd.NaT:
        return None
    if isinstance(v, pd.Timestamp):
        return {"$date": v.strftime("%Y-%m-%dT00:00:00Z")}
    return v


def _ponto(lat, lon, valido=True):
    if not valido or pd.isna(lat) or pd.isna(lon):
        return None
    return {"type": "Point", "coordinates": [round(float(lon), 6), round(float(lat), 6)]}


def gerar_mongo(fato, dim_ovt, dim_edl, T):
    MONGO.mkdir(exist_ok=True)
    f = fato.sort_values(["id_ovt", "ciclo"])
    leituras = {}
    for r in f.itertuples(index=False):
        leituras.setdefault(r.id_ovt, []).append({
            "ciclo": int(r.ciclo), "dt_coleta": r.dt_coleta, "situacao": r.situacao_coleta, "codigo_obs": r.codigo_obs,
            "n_ovos": r.n_ovos, "preenchido_pela_media": bool(r.n_ovos_imputado), "A": int(r.A), "P": int(r.P), "O": int(r.O)})
    edl_idx = dim_edl.set_index("id_edl")
    docs = []
    for r in dim_ovt.itertuples(index=False):
        e = edl_idx.loc[r.id_edl_proxima] if r.id_edl_proxima in edl_idx.index else None
        docs.append(_limpo({
            "_id": r.id_ovt, "ds": r.ds_observacao, "ds_cadastro": r.ds_cadastro, "bairro": r.bairro, "endereco": r.endereco,
            "localizacao": _ponto(r.lat, r.lon), "fonte_coord": r.fonte_coord, "dt_instalacao": pd.to_datetime(r.dt_instalacao_ovt, errors="coerce"),
            "edl_mais_proxima": {"id_edl": r.id_edl_proxima, "dist_m": r.dist_m, "faixa_dist": r.faixa_dist,
                                 "dentro_300m": bool(r.dentro_300m), "dentro_400m": bool(r.dentro_400m),
                                 "n_locais_ate_400m": r.n_locais_ate_400m,
                                 "nome": None if e is None else e["nome"],
                                 "dt_instalacao": None if e is None else pd.to_datetime(e["dt_instalacao"], errors="coerce")},
            "leituras": leituras.get(r.id_ovt, [])}))
    _jsonl(MONGO / "ovitrampas.jsonl", docs)

    docs = [_limpo({"_id": r.id_edl, "ds": r.ds, "nome": r.nome, "tipo": r.tipo, "logradouro": r.logradouro, "bairro": r.bairro,
                    "localizacao": _ponto(r.lat, r.lon, r.fonte_coord != "sem posição"), "fonte_coord": r.fonte_coord,
                    "precisao_local": r.precisao_local, "qtd_edl": r.qtd_edl,
                    "dt_instalacao": pd.to_datetime(r.dt_instalacao, errors="coerce"), "precisao_data": r.precisao_data})
            for r in dim_edl.itertuples(index=False)]
    _jsonl(MONGO / "edl_locais.jsonl", docs)

    t = T["T04_ds_x_ciclo"]
    docs = [_limpo({"_id": f"{r.ds}-{int(r.ciclo)}", "ds": r.ds, "ciclo": int(r.ciclo), "A": int(r.A), "P": int(r.P), "O": int(r.O),
                    "IPO": r.IPO, "IDO": r.IDO, "IDV": r.IDV}) for r in t.itertuples(index=False)]
    _jsonl(MONGO / "indicadores_ds_ciclo.jsonl", docs)


def _jsonl(caminho: Path, docs: list[dict]):
    with open(caminho, "w", encoding="utf-8") as fh:
        for d in docs:
            fh.write(json.dumps(d, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------------------
# 5. gráficos
# ----------------------------------------------------------------------------
def graficos(T):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    GRAF.mkdir(exist_ok=True)
    AZ, LA, CZ = "#1F3A5F", "#D9822B", "#6B7280"
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 130})

    # 1. IDV por ciclo, Recife
    t = T["T02_por_ciclo"]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    ax.plot(t["ciclo"], t["IDV"], marker="o", color=AZ)
    ax.set_ylim(t["IDV"].min() - 22, t["IDV"].max() + 14)   # folga para os rótulos
    ax.set_xticks(t["ciclo"]); ax.set_xlabel("ciclo (15 dias) · 2026"); ax.set_ylabel("IDV (ovos por armadilha)")
    ax.set_title("IDV por ciclo, Recife", loc="left", fontweight="bold")
    ys = t["IDV"].tolist()
    for i, (x, y) in enumerate(zip(t["ciclo"], ys)):
        esq = ys[i - 1] if i > 0 else None
        dir_ = ys[i + 1] if i < len(ys) - 1 else None
        viz = [v for v in (esq, dir_) if v is not None]
        if all(v > y for v in viz):                      # mínimo local: rótulo embaixo
            off, ha = (0, -13), "center"
        elif all(v < y for v in viz):                    # máximo local: rótulo em cima
            off, ha = (0, 7), "center"
        elif esq is not None and dir_ is not None and esq < y < dir_:   # subindo: livre no alto à esquerda
            off, ha = (-6, 6), "right"
        else:                                            # descendo: livre no alto à direita
            off, ha = (6, 6), "left"
        ax.annotate(f"{y:.0f}", (x, y), textcoords="offset points", xytext=off, ha=ha, fontsize=8, color=CZ)
    fig.tight_layout(); fig.savefig(GRAF / "g1_idv_por_ciclo.png"); plt.close(fig)

    # 2. IDV por faixa de distância
    t = T["T06_por_faixa_dist"]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    cores = [LA if a < AMOSTRA_MIN else AZ for a in t["A"]]
    ax.bar(t["faixa_dist"].astype(str), t["IDV"], color=cores)
    ax.axhline(indicadores(pd.DataFrame({"A": [t["A"].sum()], "P": [t["P"].sum()], "O": [t["O"].sum()]})).loc[0, "IDV"],
               color=CZ, ls="--", lw=1)
    ax.axvline(3.5, color=CZ, lw=.8)
    for i, (v, a) in enumerate(zip(t["IDV"], t["A"])):
        ax.text(i, v - 18, f"{v:.0f}", ha="center", va="top", fontsize=9, color="white", fontweight="bold")
    ax.set_ylim(0, t["IDV"].max() * 1.12); ax.set_ylabel("IDV (ovos por armadilha)")   # eixo em zero: barras comparáveis
    ax.set_title("IDV por distância até a EDL mais próxima", loc="left", fontweight="bold")
    ax.tick_params(axis="x", labelrotation=20)
    nota = "linha tracejada = IDV do conjunto · linha vertical = limite de 400 m"
    if (t["A"] < AMOSTRA_MIN).any():
        nota += " · laranja = amostra pequena (< 300 armadilhas)"
    fig.text(.01, .01, nota, fontsize=8, color=CZ)
    fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / "g2_idv_por_faixa.png"); plt.close(fig)

    # 3. mapa de calor DS × ciclo
    m = T["T04b_matriz_IDV"].set_index("ds")
    fig, ax = plt.subplots(figsize=(8, 3.9))
    im = ax.imshow(m.values, aspect="auto", cmap="YlOrBr")
    ax.set_xticks(range(m.shape[1]), [str(c) for c in m.columns]); ax.set_yticks(range(m.shape[0]), m.index)
    ax.set_xlabel("ciclo"); ax.set_ylabel("distrito sanitário")
    for i in range(m.shape[0]):
        for j in range(m.shape[1]):
            v = m.values[i, j]
            ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=7, color="white" if v > np.nanmedian(m.values) * 1.25 else "#222")
    ax.set_title("IDV por distrito sanitário e ciclo", loc="left", fontweight="bold")
    fig.colorbar(im, ax=ax, shrink=.85, label="IDV")
    fig.tight_layout(); fig.savefig(GRAF / "g3_idv_ds_x_ciclo.png"); plt.close(fig)

    # 4. dentro × fora de 400 m, por DS
    t = T["T07_dentro_fora_raio"].query("raio_m == 400")
    t = t.set_index("ds").reindex(["Todos"] + ORDEM_DS)
    x = np.arange(len(t))
    fig, ax = plt.subplots(figsize=(8, 3.8))
    ax.bar(x - .2, t["IDV_dentro"], .4, color=AZ, label="dentro de 400 m")
    ax.bar(x + .2, t["IDV_fora"], .4, color=LA, label="fora de 400 m")
    pequena = t["amostra"] != "ok"
    ax.set_xticks(x, [f"{d}*" if p else d for d, p in zip(t.index, pequena)])
    ax.set_ylabel("IDV"); ax.legend(frameon=False, ncol=2, loc="upper center", bbox_to_anchor=(.5, 1.0))
    ax.set_ylim(0, t[["IDV_dentro", "IDV_fora"]].max().max() * 1.2)
    ax.set_title("IDV dentro × fora do raio de 400 m (associação, não eficácia)", loc="left", fontweight="bold", pad=14)
    if pequena.any():
        fig.text(.01, .01, "* um dos lados com menos de 300 armadilhas examinadas: leia com cautela", fontsize=8, color=CZ)
    fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / "g4_dentro_fora_por_ds.png"); plt.close(fig)

    # ---------------- gráficos 5 a 12: mais barras e mapas de calor ----------------
    t02 = T["T02_por_ciclo"]
    idv_geral = t02["O"].sum() / t02["A"].sum()
    PERIGO = "#B7410E"

    def rodape(fig, texto):
        fig.text(.01, .01, texto, fontsize=8, color=CZ)

    # 5. IDV por distrito sanitário
    t = T["T03_por_ds"].set_index("ds").reindex(ORDEM_DS)
    fig, ax = plt.subplots(figsize=(8, 3.8))
    ax.bar(t.index, t["IDV"], color=AZ)
    ax.axhline(idv_geral, color=CZ, ls="--", lw=1)
    for i, v in enumerate(t["IDV"]):
        ax.text(i, v - 10, f"{v:.0f}", ha="center", va="top", fontsize=9, color="white", fontweight="bold")   # dentro da barra: não colide com a linha tracejada
    ax.set_ylim(0, t["IDV"].max() * 1.12); ax.set_ylabel("IDV (ovos por armadilha)"); ax.set_xlabel("distrito sanitário")
    ax.set_title("IDV por distrito sanitário, ciclos 1 a 12", loc="left", fontweight="bold")
    rodape(fig, f"linha tracejada = IDV do Recife ({idv_geral:.0f})")
    fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / "g5_idv_por_ds.png"); plt.close(fig)

    # 6. bairros com maior e menor IDV (amostra adequada)
    t = T["T05_por_bairro"].query("amostra == 'ok'").sort_values("IDV", ascending=False)
    topo = pd.concat([t.head(10), t.tail(10)]).drop_duplicates("bairro")
    topo = topo.iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 6.2))
    cores = [AZ if v >= idv_geral else LA for v in topo["IDV"]]
    ax.barh([f"{b.title()} ({d})" for b, d in zip(topo["bairro"], topo["ds"])], topo["IDV"], color=cores)
    ax.axvline(idv_geral, color=CZ, ls="--", lw=1)
    for i, (v, a) in enumerate(zip(topo["IDV"], topo["A"])):
        ax.text(v + 3, i, f"{v:.0f}", va="center", fontsize=8, color="#222")
    ax.set_xlim(0, topo["IDV"].max() * 1.1); ax.set_xlabel("IDV (ovos por armadilha)")
    ax.set_title(f"Bairros com maior e menor IDV (só os {len(t)} com ≥ 300 armadilhas)", loc="left", fontweight="bold")
    rodape(fig, f"azul = acima do IDV do Recife ({idv_geral:.0f}), laranja = abaixo · (DS) ao lado do bairro · 10 maiores e 10 menores")
    fig.tight_layout(rect=(0, .03, 1, 1)); fig.savefig(GRAF / "g6_bairros_maior_menor_idv.png"); plt.close(fig)

    # 7. diferença de IDV dentro − fora de 400 m, por DS
    t = T["T07_dentro_fora_raio"].query("raio_m == 400").set_index("ds").reindex(["Todos"] + ORDEM_DS)
    pequena = t["amostra"] != "ok"
    fig, ax = plt.subplots(figsize=(8, 3.8))
    cores = [AZ if v >= 0 else LA for v in t["IDV_dif"]]
    ax.bar(range(len(t)), t["IDV_dif"], color=cores)
    ax.axhline(0, color=CZ, lw=1)
    ax.set_xticks(range(len(t)), [f"{d}*" if p else d for d, p in zip(t.index, pequena)])
    amp = t["IDV_dif"].abs().max()
    for i, v in enumerate(t["IDV_dif"]):
        ax.text(i, v + (amp * .03 if v >= 0 else -amp * .03), f"{v:+.0f}", ha="center",
                va="bottom" if v >= 0 else "top", fontsize=9, color="#222")
    ax.set_ylim(-amp * 1.25, amp * 1.25); ax.set_ylabel("IDV dentro − IDV fora")
    ax.set_title("Diferença de IDV, dentro − fora de 400 m (associação, não eficácia)", loc="left", fontweight="bold")
    rodape(fig, "azul = maior dentro do raio · laranja = menor dentro do raio · * um dos lados com < 300 armadilhas")
    fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / "g7_diferenca_dentro_fora_ds.png"); plt.close(fig)

    # 8. antes × depois da instalação da EDL mais próxima
    t = T["T12_antes_depois"].copy()
    x = np.arange(len(t)); fig, ax = plt.subplots(figsize=(8, 3.8))
    ax.bar(x - .2, t["IDV_antes"], .4, color=CZ, label="antes da instalação")
    ax.bar(x + .2, t["IDV_depois"], .4, color=AZ, label="depois da instalação")
    for i, (a, d) in enumerate(zip(t["IDV_antes"], t["IDV_depois"])):
        ax.text(i - .2, a + 3, f"{a:.0f}", ha="center", fontsize=8); ax.text(i + .2, d + 3, f"{d:.0f}", ha="center", fontsize=8)
    ax.set_xticks(x, [f"{g}\n(n = {int(n)} OVTs)" for g, n in zip(t["grupo"], t["n_ovts"])], fontsize=8)
    ax.set_ylim(0, max(t["IDV_antes"].max(), t["IDV_depois"].max()) * 1.25); ax.set_ylabel("IDV")
    ax.legend(frameon=False, ncol=2, loc="upper center")
    ax.set_title("IDV antes × depois da instalação da EDL mais próxima", loc="left", fontweight="bold", pad=12)
    rodape(fig, "só locais com data de instalação · a diferença é pequena e não separa efeito da EDL de sazonalidade")
    fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / "g8_antes_depois.png"); plt.close(fig)

    # 9. % de leituras sem resultado por ciclo
    t = T["T09_situacao_coleta"]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    ax.bar(t["ciclo"], t["pct_sem_resultado"], color=AZ)
    for c, v in zip(t["ciclo"], t["pct_sem_resultado"]):
        ax.text(c, v + .12, f"{v:.1f}", ha="center", fontsize=8, color="#222")
    ax.set_xticks(t["ciclo"]); ax.set_xlabel("ciclo (15 dias) · 2026"); ax.set_ylabel("% de leituras sem resultado")
    ax.set_ylim(0, t["pct_sem_resultado"].max() * 1.2)
    ax.set_title("Leituras sem resultado por ciclo (F, E, R, D e REC)", loc="left", fontweight="bold")
    fig.tight_layout(); fig.savefig(GRAF / "g9_sem_resultado_por_ciclo.png"); plt.close(fig)

    # ---- mapas de calor ----
    def calor(matriz, amostras, titulo, arq, xlabel, ylabel, figsize, minimo, nota, cmap="YlOrBr", fmt="{:.0f}", fs=8):
        vals = np.ma.masked_invalid(matriz.values.astype(float))
        fig, ax = plt.subplots(figsize=figsize)
        im = ax.imshow(vals, aspect="auto", cmap=cmap)
        ax.set_xticks(range(matriz.shape[1]), [str(c).replace("acima de ", ">") for c in matriz.columns]); ax.set_yticks(range(matriz.shape[0]), matriz.index)
        ax.set_xlabel(xlabel); ax.set_ylabel(ylabel)
        lim = np.nanmedian(matriz.values.astype(float)) * 1.2
        for i in range(matriz.shape[0]):
            for j in range(matriz.shape[1]):
                v = matriz.values[i, j]
                if pd.isna(v):
                    continue
                pouca = amostras.values[i, j] < minimo
                txt = fmt.format(v) + ("*" if pouca else "")
                ax.text(j, i, txt, ha="center", va="center", fontsize=fs, color="white" if v > lim else "#222",
                        fontstyle="italic" if pouca else "normal")
        ax.set_title(titulo, loc="left", fontweight="bold")
        fig.colorbar(im, ax=ax, shrink=.85, label="IDV")
        fig.text(.01, .01, nota, fontsize=8, color=CZ)
        fig.tight_layout(rect=(0, .04, 1, 1)); fig.savefig(GRAF / arq); plt.close(fig)

    nota_cel = f"* itálico com asterisco = célula com menos de {AMOSTRA_CELULA} armadilhas examinadas: leia com cautela"
    t13 = T["T13_ds_x_faixa"].assign(faixa_dist=lambda d: d["faixa_dist"].astype(str))
    calor(t13.pivot(index="ds", columns="faixa_dist", values="IDV").reindex(index=ORDEM_DS, columns=[str(f) for f in FAIXAS]),
          t13.pivot(index="ds", columns="faixa_dist", values="A").reindex(index=ORDEM_DS, columns=[str(f) for f in FAIXAS]),
          "IDV por distrito sanitário e distância até a EDL mais próxima", "g10_heatmap_ds_x_faixa.png",
          "distância até a EDL mais próxima", "distrito sanitário", (8.6, 4.2), AMOSTRA_CELULA, nota_cel, fs=8)
    t14 = T["T14_ciclo_x_faixa"].assign(faixa_dist=lambda d: d["faixa_dist"].astype(str))
    calor(t14.pivot(index="ciclo", columns="faixa_dist", values="IDV").reindex(columns=[str(f) for f in FAIXAS]),
          t14.pivot(index="ciclo", columns="faixa_dist", values="A").reindex(columns=[str(f) for f in FAIXAS]),
          "IDV por ciclo e distância até a EDL mais próxima", "g11_heatmap_ciclo_x_faixa.png",
          "distância até a EDL mais próxima", "ciclo", (8.6, 5.4), AMOSTRA_CELULA, nota_cel, fs=8)

    # 12. bairro × ciclo (bairros com ≥ 300 armadilhas no ano; ordenados pelo IDV do ano)
    b = T["T15_bairro_x_ciclo"].query("amostra_bairro == 'ok'")
    ordem = (b.groupby("bairro")[["O", "A"]].sum().assign(IDV=lambda d: d["O"] / d["A"]).sort_values("IDV", ascending=False).index)
    mi = b.pivot(index="bairro", columns="ciclo", values="IDV").reindex(ordem)
    ma = b.pivot(index="bairro", columns="ciclo", values="A").reindex(ordem)
    mi.index = [x.title() for x in mi.index]; ma.index = mi.index
    calor(mi, ma, f"IDV por bairro e ciclo ({len(mi)} bairros com ≥ 300 armadilhas no ano)", "g12_heatmap_bairro_x_ciclo.png",
          "ciclo", "bairro (do maior para o menor IDV no ano)", (9, 8.6), 30,
          "exploratório: cada célula tem poucas armadilhas (mediana ≈ 50) · * = menos de 30 armadilhas", fs=7)

    # PDF com todos os gráficos
    from PIL import Image
    imgs = [Image.open(p).convert("RGB") for p in sorted(GRAF.glob("g*.png"), key=lambda p: int(re.match(r"g(\d+)_", p.name).group(1)))]
    imgs[0].save(GRAF / "todos_os_graficos.pdf", save_all=True, append_images=imgs[1:], resolution=130)


def main():
    obs, cad, prox, edl = carregar()
    fato, dim_ovt, dim_edl, dim_ciclo = modelar(obs, cad, prox, edl)
    T = tabelas_analise(fato, dim_ovt, dim_edl, dim_ciclo)
    salvar_csv(fato, dim_ovt, dim_edl, dim_ciclo, T)
    salvar_excel(T, dim_ovt, dim_edl, dim_ciclo)
    gerar_mongo(fato, dim_ovt, dim_edl, T)
    graficos(T)
    falhas = T["T00_conferencias"].query("resultado == 'FALHOU'")
    print(f"{len(T)} tabelas de análise, fato_leitura com {len(fato)} linhas.")
    print("conferências internas:", "todas OK" if falhas.empty else f"FALHARAM:\n{falhas}")


if __name__ == "__main__":
    main()
