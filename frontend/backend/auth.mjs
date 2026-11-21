import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

export const ROLE_LABELS = {
  gestao: "Gestão",
  laboratorio: "Laboratório",
  campo: "Agente de Campo",
  diretoria: "Diretoria",
};
export const ROLE_VIEWS = {
  gestao: [
    "dashboard",
    "ovt",
    "edl",
    "collection",
    "calendar",
    "reading",
    "map",
    "reports",
    "analysis",
    "priority",
    "alerts",
    "settings",
  ],
  laboratorio: ["dashboard", "reading", "reports", "alerts", "settings"],
  campo: ["dashboard", "collection", "calendar", "alerts", "settings"],
  diretoria: [
    "dashboard",
    "map",
    "reports",
    "analysis",
    "priority",
    "alerts",
    "settings",
  ],
};
export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password, encoded) {
  if (!encoded || password.length > 256) return false;
  const [salt, hash] = encoded.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    demo: !!user.demo,
    roleLabel: ROLE_LABELS[user.role],
    views: ROLE_VIEWS[user.role],
  };
}
export function requireRole(user, roles) {
  if (!roles.includes(user.role))
    throw new HttpError(403, "Seu perfil não permite esta operação.");
}
export function requireView(user, view) {
  if (!ROLE_VIEWS[user.role].includes(view))
    throw new HttpError(403, "Seu perfil não possui acesso a esta área.");
}
export function sessionUser(db, request) {
  const token = (request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("argos_session="))
    ?.slice(14);
  if (!token) return null;
  return (
    db
      .prepare(
        "SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(digest(token), Date.now()) || null
  );
}
export function createSession(db, user, secure = false) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)",
  ).run(digest(token), user.id, csrf, Date.now() + 8 * 60 * 60 * 1000);
  return {
    csrf,
    cookie:
      "argos_session=" +
      token +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800" +
      (secure ? "; Secure" : ""),
  };
}
export function validateNewUser(data) {
  if (
    typeof data.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
    data.email.length > 120
  ) {
    throw new HttpError(400, "Informe um e-mail válido.");
  }
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 100
  )
    throw new HttpError(400, "Informe o nome do usuário.");
  if (!Object.hasOwn(ROLE_LABELS, data.role))
    throw new HttpError(400, "Selecione um perfil válido.");
  if (
    typeof data.password !== "string" ||
    data.password.length < 12 ||
    data.password.length > 128
  ) {
    throw new HttpError(400, "Use uma senha entre 12 e 128 caracteres.");
  }
}
