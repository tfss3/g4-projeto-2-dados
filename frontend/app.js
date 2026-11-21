import { api, setCsrf, escapeHtml } from "./ui/api.mjs";
import { hydrate } from "./ui/icons.mjs";
import {
  initializeOperations,
  updateOperationData,
  getOperationState,
  showOperationView,
  handleOperationAction,
} from "./ui/operations.mjs";
import { renderWorkspace } from "./ui/workspace.mjs";
import { destroyMap } from "./ui/map.mjs";

const $ = (selector) => document.querySelector(selector);
let currentUser;
let currentView = "dashboard";
let areas = [];
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
async function refresh() {
  const data = await api("/api/state");
  areas = data.areas;
  updateOperationData(data);
}
function workspaceContext() {
  return {
    user: currentUser,
    areas,
    getState: getOperationState,
    refresh,
    notify,
    navigate,
    logout,
  };
}
function navigate(view) {
  if (!currentUser.views.includes(view)) {
    notify("Esta área está disponível para outro perfil.");
    return;
  }
  currentView = view;
  $("#main-navigation").classList.remove("expanded");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  const operational = ["ovt", "edl", "collection", "reading"].includes(view);
  const calendar = view === "calendar";
  const analytic = !operational && !calendar;
  $(".entry-layout").hidden = !operational;
  $("#collection-calendar").hidden = !calendar;
  $("#workspace-panel").hidden = !analytic;
  $(".records").hidden = analytic;
  $("#catalog-section").hidden = !["ovt", "edl"].includes(view);
  for (const button of document.querySelectorAll(".nav-item")) {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  destroyMap();
  if (analytic) renderWorkspace(view, workspaceContext());
  else showOperationView(view);
  window.scrollTo(0, 0);
}
async function authenticate(session) {
  currentUser = session.user;
  setCsrf(session.csrf);
  const data = await api("/api/state");
  areas = data.areas;
  initializeOperations({ user: currentUser, data, refresh, notify, navigate });
  $("#user-name").textContent = currentUser.demo
    ? "Acesso de demonstração"
    : currentUser.name;
  $("#user-role").textContent =
    currentUser.roleLabel + (currentUser.demo ? " · demonstração local" : "");
  for (const button of document.querySelectorAll(".nav-item"))
    button.hidden = !currentUser.views.includes(button.dataset.view);
  $("#login-screen").hidden = true;
  $("#application").hidden = false;
  navigate("dashboard");
}
async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: {} });
  } catch {}
  window.location.reload();
}
function loginError(error) {
  $("#login-error").textContent = error.message;
  $("#login-error").hidden = false;
}
async function boot() {
  hydrate();
  try {
    const configuration = await api("/api/config");
    $("#demo-access").hidden = !configuration.demoEnabled;
    try {
      await authenticate(await api("/api/me"));
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  } catch (error) {
    loginError(error);
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  $("#login-error").hidden = true;
  try {
    await authenticate(
      await api("/api/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      }),
    );
    form.reset();
  } catch (error) {
    loginError(error);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener("click", async (event) => {
  const demo = event.target.closest("[data-demo]");
  if (demo) {
    for (const button of document.querySelectorAll("[data-demo]"))
      button.disabled = true;
    try {
      await authenticate(
        await api("/api/demo", {
          method: "POST",
          body: { role: demo.dataset.demo },
        }),
      );
    } catch (error) {
      loginError(error);
    } finally {
      for (const button of document.querySelectorAll("[data-demo]"))
        button.disabled = false;
    }
    return;
  }
  if (!currentUser) return;
  const navigation = event.target.closest("[data-view]");
  if (navigation) {
    navigate(navigation.dataset.view);
    return;
  }
  await handleOperationAction(event.target);
});
$("#menu-toggle").onclick = () => {
  const open = $("#main-navigation").classList.toggle("expanded");
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
};
$("#logout").onclick = logout;
$("#refresh-data").onclick = async () => {
  try {
    await refresh();
    navigate(currentView);
    notify("Dados atualizados do servidor.");
  } catch (error) {
    notify(error.message);
  }
};
window.addEventListener("argos-session-expired", () => {
  $("#application").hidden = true;
  $("#login-screen").hidden = false;
  loginError(new Error("Sua sessão expirou. Entre novamente para continuar."));
});
boot();
