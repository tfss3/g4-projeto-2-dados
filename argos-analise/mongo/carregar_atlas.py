#!/usr/bin/env python3
"""Carrega as coleções do ARGOS no MongoDB (Atlas ou servidor local).

Coleções (arquivos .jsonl desta pasta, gerados por ../gerar_tabelas.py):
  ovitrampas             1 documento por OVT; as 12 leituras (ciclos) ficam EMBUTIDAS em `leituras`,
                         a EDL mais próxima em `edl_mais_proxima`, e a posição em GeoJSON (`localizacao`)
  edl_locais             1 documento por local de EDL (posição em GeoJSON)
  indicadores_ds_ciclo   indicadores já calculados por DS × ciclo (padrão "valores computados")

Uso:
  export MONGODB_URI="mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/"   # a senha fica só na variável de ambiente
  python carregar_atlas.py                 # carrega (pula coleção que já tem documentos)
  python carregar_atlas.py --recriar       # APAGA as 3 coleções e carrega de novo
  python carregar_atlas.py --banco argos   # nome do banco (padrão: argos)
  python carregar_atlas.py --simulado      # usa mongomock (em memória, sem servidor), só para testar

Alternativa sem Python (mongoimport, das ferramentas de banco do MongoDB):
  mongoimport --uri "$MONGODB_URI" --db argos --collection ovitrampas --file ovitrampas.jsonl
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from bson import json_util  # vem com o pymongo: entende {"$date": ...}

AQUI = Path(__file__).resolve().parent
COLECOES = ["ovitrampas", "edl_locais", "indicadores_ds_ciclo"]


def ler_jsonl(caminho: Path) -> list[dict]:
    with open(caminho, encoding="utf-8") as fh:
        return [json_util.loads(linha) for linha in fh if linha.strip()]


def conectar(banco: str = "argos", simulado: bool = False):
    if simulado:
        import mongomock
        return mongomock.MongoClient()[banco]
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("Defina a variável de ambiente MONGODB_URI com a string de conexão do Atlas (ou mongodb://localhost:27017).")
    from pymongo import MongoClient
    from pymongo.server_api import ServerApi
    cliente = MongoClient(uri, server_api=ServerApi("1"), serverSelectionTimeoutMS=15000)
    cliente.admin.command("ping")
    return cliente[banco]


def criar_indices(db, simulado: bool = False):
    try:
        db.ovitrampas.create_index([("localizacao", "2dsphere")])
        db.edl_locais.create_index([("localizacao", "2dsphere")])
    except Exception as e:  # mongomock não tem índice geoespacial
        if not simulado:
            raise
        print("  (índice 2dsphere ignorado no modo simulado)", type(e).__name__)
    db.ovitrampas.create_index([("ds", 1), ("bairro", 1)])
    db.ovitrampas.create_index([("edl_mais_proxima.id_edl", 1)])
    db.ovitrampas.create_index([("leituras.ciclo", 1)])
    db.edl_locais.create_index([("ds", 1)])


def carregar(db, recriar: bool = False, simulado: bool = False):
    for nome in COLECOES:
        col = db[nome]
        if recriar:
            col.drop()
        if col.estimated_document_count() > 0:
            print(f"  {nome}: já tem {col.estimated_document_count()} documentos; pulando (use --recriar para refazer)")
            continue
        docs = ler_jsonl(AQUI / f"{nome}.jsonl")
        col.insert_many(docs)
        print(f"  {nome}: {len(docs)} documentos inseridos")
    criar_indices(db, simulado)
    print("  índices criados")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--banco", default="argos")
    ap.add_argument("--recriar", action="store_true", help="apaga as coleções antes de carregar")
    ap.add_argument("--simulado", action="store_true", help="mongomock em memória (teste)")
    a = ap.parse_args()
    db = conectar(a.banco, a.simulado)
    print(f"Banco '{a.banco}':")
    carregar(db, a.recriar, a.simulado)


if __name__ == "__main__":
    main()
