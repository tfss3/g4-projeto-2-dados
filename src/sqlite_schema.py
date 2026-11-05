def criar_tabela():
    SCHEMA = """
    CREATE TABLE IF NOT EXISTS ovt (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ano                 INTEGER NOT NULL,
    ciclos              INTEGER NOT NULL,
    ds                  TEXT NOT NULL,
    bairro              TEXT NOT NULL,
    bairro_area         TEXT NOT NULL,
    agente              TEXT NOT NULL,
    matricula           TEXT,
    qt                  INTEGER NOT NULL,
    id_ovt              TEXT NOT NULL,
    dt_coleta           TEXT,
    dt_entrega_apoio    TEXT,
    dt_entrega_lab      TEXT,
    dt_leitura          TEXT,
    nm_tec_lab          TEXT,
    dt_dig              TEXT,
    dt_envio_ds         TEXT,
    n_ovos              INTEGER,
    obs                 TEXT,
    UNIQUE (ds, id_ovt, ciclos, dt_coleta)
    );
    CREATE INDEX IF NOT EXISTS idx_dt_coleta ON ovt (dt_coleta);
    CREATE INDEX IF NOT EXISTS idx_ds ON ovt (ds);
    CREATE INDEX IF NOT EXISTS idx_bairro_area ON ovt (bairro_area);
    """

    return SCHEMA


def criar_tabela_edl(tabela):
    SCHEMA = f"""
    CREATE TABLE IF NOT EXISTS {tabela} (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    ds                    TEXT NOT NULL,
    categoria             TEXT,
    situacao              TEXT NOT NULL CHECK (situacao IN ('ATIVA', 'RETIRADA')),
    numero                INTEGER,
    qt                    INTEGER,
    resp_pe               TEXT,
    tipo_pe               TEXT,
    nome                  TEXT,
    logradouro            TEXT,
    bairro                TEXT,
    latitude              REAL,
    longitude             REAL,
    coordenadas_original  TEXT,
    tamanho               TEXT,
    tamanho_m2            REAL,
    qt_edl_ideal          INTEGER,
    qt_edl_real           INTEGER NOT NULL,
    dt_instalacao         TEXT,
    obs                   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_{tabela}_categoria ON {tabela} (categoria);
    CREATE INDEX IF NOT EXISTS idx_{tabela}_bairro ON {tabela} (bairro);
    """

    return SCHEMA


def criar_tabela_resumo_ds(tabela):
    SCHEMA = f"""
    CREATE TABLE IF NOT EXISTS {tabela} (
    ds                    TEXT PRIMARY KEY,
    pe_com_edl            INTEGER,
    edl_em_pe             INTEGER,
    outros_equipamentos   INTEGER,
    edl_em_outros         INTEGER,
    us_pa_com_edl         INTEGER,
    edl_em_us_pa          INTEGER,
    demais_us_com_edl     INTEGER,
    edl_demais_us         INTEGER,
    total_de_edl          INTEGER
    );
    """

    return SCHEMA


def criar_tabela_resumo_bairro(tabela):
    SCHEMA = f"""
    CREATE TABLE IF NOT EXISTS {tabela} (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ds                  TEXT NOT NULL,
    bairro              TEXT NOT NULL,
    locais              INTEGER,
    edls                INTEGER,
    UNIQUE (ds, bairro)
    );
    """

    return SCHEMA


def criar_tabela_georef(tabela):
    SCHEMA = f"""
    CREATE TABLE IF NOT EXISTS {tabela} (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    ds                    TEXT NOT NULL,
    bairro                TEXT NOT NULL,
    id_ovt                TEXT NOT NULL UNIQUE,
    latitude              REAL,
    longitude             REAL,
    coordenadas_original  TEXT,
    endereco              TEXT,
    qt                    INTEGER,
    agente                TEXT,
    matricula             TEXT,
    data                  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_{tabela}_bairro ON {tabela} (bairro);
    """

    return SCHEMA
