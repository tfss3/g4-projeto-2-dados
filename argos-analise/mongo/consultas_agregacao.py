#!/usr/bin/env python3
"""Consultas do ARGOS no MongoDB: pipelines de agregação e uma consulta geoespacial.

Os indicadores seguem as mesmas regras das tabelas T02..T07 (soma A, P, O no grupo e só depois divide):
  IPO = P/A*100    IDO = O/P    IDV = O/A

Uso:
  export MONGODB_URI="mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/"
  python consultas_agregacao.py                   # roda as 6 consultas no Atlas / servidor
  python consultas_agregacao.py --consulta 3      # só a consulta 3
  python consultas_agregacao.py --simulado        # mongomock: carrega os .jsonl em memória (sem servidor)

A consulta 6 (geoespacial, $geoWithin) precisa de um servidor MongoDB de verdade; no modo simulado ela é pulada.
"""
from __future__ import annotations

import argparse
import json

from carregar_atlas import carregar, conectar

R_TERRA_M = 6378100  # raio da Terra em metros, para $centerSphere (distância em radianos)


def razao(num: str, den: str, fator: float = 1):
    """num/den, ou null se o denominador for 0 (o $divide do MongoDB dá erro com divisão por zero)."""
    conta = {"$divide": [num, den]} if fator == 1 else {"$multiply": [fator, {"$divide": [num, den]}]}
    return {"$cond": [{"$gt": [den, 0]}, conta, None]}


# Depois de um $group com A, P, O, este $project calcula os três indicadores
CALCULA_INDICADORES = {"A": 1, "P": 1, "O": 1,
                       "IPO": razao("$P", "$A", 100), "IDO": razao("$O", "$P"), "IDV": razao("$O", "$A")}
SOMA_APO = {"A": {"$sum": "$leituras.A"}, "P": {"$sum": "$leituras.P"}, "O": {"$sum": "$leituras.O"}}


def c1_por_ciclo():
    """Indicadores por ciclo, Recife (T02)."""
    return "ovitrampas", [
        {"$unwind": "$leituras"},
        {"$group": {"_id": "$leituras.ciclo", **SOMA_APO}},
        {"$project": {"_id": 0, "ciclo": "$_id", **CALCULA_INDICADORES}},
        {"$sort": {"ciclo": 1}}]


def c2_por_ds():
    """Indicadores por distrito sanitário (T03)."""
    return "ovitrampas", [
        {"$unwind": "$leituras"},
        {"$group": {"_id": "$ds", **SOMA_APO}},
        {"$project": {"_id": 0, "ds": "$_id", **CALCULA_INDICADORES}},
        {"$sort": {"ds": 1}}]


def c3_dentro_fora_400m():
    """Dentro × fora do raio de 400 m (T07): campo embutido edl_mais_proxima.dentro_400m."""
    return "ovitrampas", [
        {"$unwind": "$leituras"},
        {"$group": {"_id": "$edl_mais_proxima.dentro_400m", "ovts": {"$addToSet": "$_id"}, **SOMA_APO}},
        {"$project": {"_id": 0, "grupo": {"$cond": ["$_id", "dentro de 400 m", "fora de 400 m"]},
                      "n_ovts": {"$size": "$ovts"}, **CALCULA_INDICADORES}},
        {"$sort": {"grupo": 1}}]


def c4_top_bairros():
    """Dez bairros de maior IDV entre os de amostra adequada (>= 300 armadilhas examinadas) (T05)."""
    return "ovitrampas", [
        {"$unwind": "$leituras"},
        {"$group": {"_id": {"ds": "$ds", "bairro": "$bairro"}, "ovts": {"$addToSet": "$_id"}, **SOMA_APO}},
        {"$match": {"A": {"$gte": 300}}},
        {"$project": {"_id": 0, "ds": "$_id.ds", "bairro": "$_id.bairro", "n_ovts": {"$size": "$ovts"}, **CALCULA_INDICADORES}},
        {"$sort": {"IDV": -1}}, {"$limit": 10}]


def c5_locais_edl():
    """Locais de EDL com maior IDV nas OVTs que os têm como mais próximo ($lookup OVT -> EDL; descritivo, não mede o desempenho da EDL)."""
    return "ovitrampas", [
        {"$unwind": "$leituras"},
        {"$group": {"_id": "$edl_mais_proxima.id_edl", "ovts": {"$addToSet": "$_id"}, **SOMA_APO}},
        {"$match": {"A": {"$gte": 300}}},
        {"$lookup": {"from": "edl_locais", "localField": "_id", "foreignField": "_id", "as": "edl"}},
        {"$unwind": "$edl"},
        {"$project": {"_id": 0, "id_edl": "$_id", "nome": "$edl.nome", "bairro": "$edl.bairro",
                      "n_ovts": {"$size": "$ovts"}, "A": 1, "IDV": razao("$O", "$A")}},
        {"$sort": {"IDV": -1}}, {"$limit": 10}]


def c6_ovts_perto_de_uma_edl(db, id_edl="DS2-L067", raio_m=400):
    """Geoespacial: OVTs a até raio_m do local de EDL escolhido ($geoWithin + $centerSphere, índice 2dsphere)."""
    edl = db.edl_locais.find_one({"_id": id_edl})
    lon, lat = edl["localizacao"]["coordinates"]
    filtro = {"localizacao": {"$geoWithin": {"$centerSphere": [[lon, lat], raio_m / R_TERRA_M]}}}
    docs = list(db.ovitrampas.find(filtro, {"_id": 1, "bairro": 1, "edl_mais_proxima.dist_m": 1}))
    return f"OVTs a até {raio_m} m de {id_edl} ({edl['nome']})", docs


CONSULTAS = {1: c1_por_ciclo, 2: c2_por_ds, 3: c3_dentro_fora_400m, 4: c4_top_bairros, 5: c5_locais_edl}


def mostrar(titulo: str, docs: list[dict]):
    print(f"\n=== {titulo} ({len(docs)} linhas)")
    for d in docs[:20]:
        print("  " + json.dumps({k: round(v, 2) if isinstance(v, float) else v for k, v in d.items()}, ensure_ascii=False, default=str))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--banco", default="argos")
    ap.add_argument("--consulta", type=int, choices=range(1, 7))
    ap.add_argument("--simulado", action="store_true")
    a = ap.parse_args()
    db = conectar(a.banco, a.simulado)
    if a.simulado:
        carregar(db, recriar=True, simulado=True)
    for n in ([a.consulta] if a.consulta else range(1, 7)):
        if n == 6:
            if a.simulado:
                print("\n=== consulta 6 (geoespacial) pulada: o mongomock não tem $geoWithin; rode contra o Atlas ou um mongod")
                continue
            titulo, docs = c6_ovts_perto_de_uma_edl(db)
            mostrar(titulo, docs)
        else:
            colecao, pipeline = CONSULTAS[n]()
            mostrar(f"consulta {n}: {CONSULTAS[n].__doc__}", list(db[colecao].aggregate(pipeline)))


if __name__ == "__main__":
    main()
