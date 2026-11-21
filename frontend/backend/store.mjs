import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { makeRecord, emptyState, parseState } from "../model.mjs";
import { hashPassword, HttpError, requireRole, ROLE_LABELS } from "./auth.mjs";

export function openStore(path, catalog = [], adminPassword) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  let initialPassword;
  if (
    !db.prepare("SELECT id FROM users WHERE demo=0 AND role='gestao'").get()
  ) {
    initialPassword = adminPassword || randomBytes(16).toString("base64url");
    if (initialPassword.length < 12)
      throw new Error("ARGOS_ADMIN_PASSWORD exige ao menos 12 caracteres.");
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,0)").run(
      randomUUID(),
      "Administrador ARGOS",
      "admin@argos.local",
      "gestao",
      hashPassword(initialPassword),
    );
  }
  for (const [role, name] of Object.entries(ROLE_LABELS)) {
    db.prepare("INSERT OR IGNORE INTO users VALUES (?,?,?,?,NULL,1)").run(
      "demo-" + role,
      name + " · demonstração",
      role + "@demo.argos.local",
      role,
    );
  }
  transaction(db, () => {
    const insert = db.prepare("INSERT OR IGNORE INTO traps VALUES (?,?,?,?,?)");
    for (const item of catalog)
      insert.run(
        item.id,
        item.kind,
        item.code,
        "historical",
        JSON.stringify(item),
      );
  });
  return { db, initialPassword };
}
export function transaction(db, action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function audit(db, user, action, id) {
  db.prepare(
    "INSERT INTO audit(user_id,action,record_id,at) VALUES (?,?,?,?)",
  ).run(user.id, action, id, new Date().toISOString());
}
export function getState(db, user) {
  const state = emptyState();
  for (const row of db
    .prepare("SELECT kind,payload FROM traps ORDER BY source,code")
    .all())
    state[row.kind].push({ ...JSON.parse(row.payload), kind: row.kind });
  const collections = db
    .prepare("SELECT payload FROM collections ORDER BY rowid DESC")
    .all()
    .map((r) => JSON.parse(r.payload));
  state.collection =
    user.role === "campo"
      ? collections.filter((r) => r.createdBy === user.id)
      : collections;
  const ids = new Set(state.collection.map((row) => row.id));
  state.reading = db
    .prepare("SELECT payload FROM readings ORDER BY rowid DESC")
    .all()
    .map((r) => JSON.parse(r.payload))
    .filter((r) => ids.has(r.collection_id));
  return state;
}
function persist(db, type, record, user) {
  if (type === "ovt" || type === "edl") {
    db.prepare("INSERT INTO traps VALUES (?,?,?,?,?)").run(
      record.id,
      type,
      record.code,
      "operational",
      JSON.stringify(record),
    );
  } else if (type === "collection") {
    db.prepare("INSERT INTO collections VALUES (?,?,?,?,?,?,?)").run(
      record.id,
      record.ovt_id,
      record.sample_code,
      record.cycle,
      Number(record.collected_on.slice(0, 4)),
      user.id,
      JSON.stringify(record),
    );
  } else {
    db.prepare("INSERT INTO readings VALUES (?,?,?,?)").run(
      record.id,
      record.collection_id,
      user.id,
      JSON.stringify(record),
    );
  }
  audit(db, user, "create:" + type, record.id);
}
function cleanInput(data) {
  if (!data || Array.isArray(data) || typeof data !== "object")
    throw new HttpError(400, "Registro inválido.");
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      !["string", "number", "boolean"].includes(typeof value)
    )
      throw new HttpError(400, "Campo inválido: " + key);
    if (typeof value === "string" && value.length > 500)
      throw new HttpError(400, "O campo " + key + " excede 500 caracteres.");
  }
  for (const key of ["latitude", "longitude"]) {
    if (typeof data[key] === "string") data[key] = data[key].replace(",", ".");
  }
  return data;
}
export function createRecord(db, user, type, input, areas, fixedId) {
  const allowed = {
    ovt: ["gestao"],
    edl: ["gestao"],
    collection: ["gestao", "campo"],
    reading: ["gestao", "laboratorio"],
  };
  if (!Object.hasOwn(allowed, type))
    throw new HttpError(404, "Tipo de registro não encontrado.");
  requireRole(user, allowed[type]);
  return transaction(db, () => {
    const fullState = getState(db, { ...user, role: "gestao" });
    const data = cleanInput({ ...input });
    if (type === "collection" && user.role === "campo")
      data.responsible = user.name;
    const id = fixedId || randomUUID();
    const result = makeRecord(
      type,
      data,
      fullState,
      areas,
      id,
      new Date().toISOString(),
    );
    if (result.errors)
      throw new HttpError(422, Object.values(result.errors)[0], result.errors);
    const record = {
      ...result.record,
      source: "operational",
      createdBy: user.id,
    };
    if (type === "reading") record.review_status = "Pendente";
    persist(db, type, record, user);
    if (type === "edl" && record.maintenance_on) {
      db.prepare("INSERT INTO maintenance VALUES (?,?,?,?,?)").run(
        record.id,
        record.maintenance_on,
        record.notes,
        user.id,
        record.createdAt,
      );
    }
    return record;
  });
}
export function reviewReading(db, user, id, status, note) {
  requireRole(user, ["gestao", "laboratorio"]);
  if (!["Validado", "Em revisão"].includes(status))
    throw new HttpError(400, "Situação inválida.");
  if (
    status === "Em revisão" &&
    (typeof note !== "string" || !note.trim() || note.length > 500)
  ) {
    throw new HttpError(
      400,
      "Informe o motivo da revisão em até 500 caracteres.",
    );
  }
  return transaction(db, () => {
    const row = db.prepare("SELECT payload FROM readings WHERE id=?").get(id);
    if (!row) throw new HttpError(404, "Leitura não encontrada.");
    const record = {
      ...JSON.parse(row.payload),
      review_status: status,
      review_note: String(note || "").slice(0, 500),
      reviewedBy: user.name,
      reviewedAt: new Date().toISOString(),
    };
    db.prepare("UPDATE readings SET payload=? WHERE id=?").run(
      JSON.stringify(record),
      id,
    );
    audit(db, user, "review:" + status, id);
    return record;
  });
}
export function correctReading(db, user, id, input, areas) {
  requireRole(user, ["gestao", "laboratorio"]);
  return transaction(db, () => {
    const old = db.prepare("SELECT payload FROM readings WHERE id=?").get(id);
    if (!old) throw new HttpError(404, "Leitura não encontrada.");
    const previous = JSON.parse(old.payload);
    const state = getState(db, { ...user, role: "gestao" });
    state.reading = state.reading.filter((row) => row.id !== id);
    const result = makeRecord(
      "reading",
      { ...cleanInput({ ...input }), collection_id: previous.collection_id },
      state,
      areas,
      id,
      previous.createdAt,
    );
    if (result.errors)
      throw new HttpError(422, Object.values(result.errors)[0], result.errors);
    const record = {
      ...result.record,
      source: "operational",
      createdBy: previous.createdBy,
      review_status: "Pendente",
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    };
    db.prepare("UPDATE readings SET payload=? WHERE id=?").run(
      JSON.stringify(record),
      id,
    );
    audit(db, user, "correct:reading", id);
    return record;
  });
}
export function importLegacy(db, user, input, areas) {
  requireRole(user, ["gestao"]);
  let legacy;
  try {
    legacy = parseState(JSON.stringify(input));
  } catch {
    throw new HttpError(
      400,
      "Os registros deste navegador estão em formato inválido.",
    );
  }
  let imported = 0;
  transaction(db, () => {
    for (const type of ["ovt", "edl", "collection", "reading"]) {
      const table = {
        ovt: "traps",
        edl: "traps",
        collection: "collections",
        reading: "readings",
      }[type];
      for (const data of legacy[type]) {
        if (db.prepare("SELECT id FROM " + table + " WHERE id=?").get(data.id))
          continue;
        const state = getState(db, { ...user, role: "gestao" });
        const result = makeRecord(
          type,
          data,
          state,
          areas,
          data.id,
          data.createdAt,
        );
        if (result.errors)
          throw new HttpError(
            422,
            "Importação interrompida: " + Object.values(result.errors)[0],
          );
        persist(
          db,
          type,
          {
            ...result.record,
            source: "operational",
            createdBy: user.id,
            ...(type === "reading" ? { review_status: "Pendente" } : {}),
          },
          user,
        );
        imported++;
      }
    }
  });
  return imported;
}
