let csrf = "";
export function setCsrf(value) {
  csrf = value;
}

export async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrf;
  }
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !["/api/me", "/api/login"].includes(path)) {
      window.dispatchEvent(new Event("argos-session-expired"));
    }
    const error = new Error(
      data.message || "Não foi possível concluir a operação.",
    );
    error.status = response.status;
    error.errors = data.errors;
    throw error;
  }
  return data;
}
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const number = (value, digits = 0) =>
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
export const displayDate = (value) =>
  value ? String(value).slice(0, 10).split("-").reverse().join("/") : "—";
