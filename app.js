/* ============================================================
   Progreso Fit — lógica de la app
   ============================================================ */

const CATEGORIES = [
  { key: "tren_inferior", label: "Tren Inferior" },
  { key: "espalda", label: "Espalda" },
  { key: "pectoral_hombros", label: "Pectoral y Hombros" },
  { key: "brazos", label: "Brazos" },
  { key: "funcional", label: "Funcional" },
];

const CONFIG_KEY = "pf_config_v1";
const CACHE_PREFIX = "pf_cache_";

const state = {
  sb: null,
  user: null,
  clients: [],
  clientFilter: "active",
  clientSearch: "",
  currentClientId: null,
  activeCategory: CATEGORIES[0].key,
  exercisesByCategory: {}, // { category: [exercise,...] }
  logsByExercise: {}, // { exerciseId: [log,...] sorted desc by date }
  editingClientId: null,
  logSheetExerciseId: null,
};

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}
function formatDate(d) {
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function cacheSet(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); } catch (e) {}
}
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* ---------------- config (setup screen) ---------------- */
function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch (e) { return null; }
}
function saveConfig(url, key) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
}

function initSupabase() {
  const cfg = getConfig();
  if (!cfg || !cfg.url || !cfg.key) {
    showScreen("screen-setup");
    return false;
  }
  try {
    state.sb = supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return true;
  } catch (e) {
    showScreen("screen-setup");
    return false;
  }
}

$("form-setup").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $("setup-url").value.trim().replace(/\/+$/, "");
  const key = $("setup-key").value.trim();
  const err = $("setup-error");
  err.classList.remove("show");
  if (!/^https:\/\/.+\.supabase\.co$/.test(url)) {
    err.textContent = "Revisa la URL, debe tener el formato https://xxxx.supabase.co";
    err.classList.add("show");
    return;
  }
  if (key.length < 20) {
    err.textContent = "La clave anon no parece completa, cópiala de nuevo.";
    err.classList.add("show");
    return;
  }
  saveConfig(url, key);
  location.reload();
});

$("btn-change-config").addEventListener("click", () => {
  if (confirm("¿Quieres cambiar la configuración de Supabase de este dispositivo?")) {
    localStorage.removeItem(CONFIG_KEY);
    location.reload();
  }
});

/* ---------------- auth ---------------- */
let authMode = "login";
$("tab-login").addEventListener("click", () => setAuthMode("login"));
$("tab-signup").addEventListener("click", () => setAuthMode("signup"));
function setAuthMode(mode) {
  authMode = mode;
  $("tab-login").classList.toggle("active", mode === "login");
  $("tab-signup").classList.toggle("active", mode === "signup");
  $("auth-submit-label").textContent = mode === "login" ? "Entrar" : "Crear cuenta";
  $("auth-error").classList.remove("show");
}

$("form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const err = $("auth-error");
  err.classList.remove("show");
  const btn = $("auth-submit");
  btn.disabled = true;
  try {
    if (authMode === "login") {
      const { error } = await state.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await afterLogin();
    } else {
      const { data, error } = await state.sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        await afterLogin();
      } else {
        toast("Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.");
        setAuthMode("login");
      }
    }
  } catch (e2) {
    err.textContent = translateAuthError(e2.message);
    err.classList.add("show");
  } finally {
    btn.disabled = false;
  }
});

function translateAuthError(msg) {
  if (!msg) return "Ha ocurrido un error, inténtalo de nuevo.";
  if (/invalid login credentials/i.test(msg)) return "Email o contraseña incorrectos.";
  if (/already registered|already exists/i.test(msg)) return "Ya existe una cuenta con ese email, inicia sesión.";
  if (/password/i.test(msg) && /least/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres.";
  return msg;
}

$("btn-logout").addEventListener("click", async () => {
  if (!confirm("¿Cerrar sesión?")) return;
  await state.sb.auth.signOut();
  state.user = null;
  showScreen("screen-auth");
});

async function afterLogin() {
  const { data } = await state.sb.auth.getUser();
  state.user = data.user;
  showScreen("screen-clients");
  await loadClients();
}

/* ---------------- clients list ---------------- */
async function loadClients() {
  try {
    const { data, error } = await state.sb
      .from("clients")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    state.clients = data || [];
    cacheSet("clients", state.clients);
  } catch (e) {
    const cached = cacheGet("clients");
    if (cached) {
      state.clients = cached;
      toast("Sin conexión: mostrando datos guardados.");
    } else {
      toast("No se pudieron cargar las clientas.");
    }
  }
  renderClientsList();
}

function renderClientsList() {
  const list = $("clients-list");
  const empty = $("clients-empty");
  let items = state.clients.filter((c) => {
    if (state.clientFilter === "active" && !c.active) return false;
    if (state.clientFilter === "inactive" && c.active) return false;
    if (state.clientSearch && !c.name.toLowerCase().includes(state.clientSearch.toLowerCase())) return false;
    return true;
  });

  list.innerHTML = "";
  if (items.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    items.forEach((c) => {
      const el = document.createElement("div");
      el.className = "client-card";
      el.innerHTML = `
        <div class="avatar">${escapeHtml(initials(c.name))}</div>
        <div class="info">
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="meta">${escapeHtml(c.training_type || "Sin tipo de entrenamiento")}</div>
        </div>
        ${!c.active ? '<span class="badge-inactive">Inactiva</span>' : ""}
        <span class="chev">›</span>
      `;
      el.addEventListener("click", () => openClient(c.id));
      list.appendChild(el);
    });
  }
}

$("search-clients").addEventListener("input", (e) => {
  state.clientSearch = e.target.value;
  renderClientsList();
});
document.querySelectorAll("#screen-clients .segment button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#screen-clients .segment button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.clientFilter = btn.dataset.filter;
    renderClientsList();
  });
});

/* ---------------- add / edit client ---------------- */
$("btn-add-client").addEventListener("click", () => openClientSheet(null));
$("btn-edit-client").addEventListener("click", () => openClientSheet(state.currentClientId));
$("btn-cancel-client").addEventListener("click", () => closeSheet("sheet-client-backdrop"));

function openClientSheet(clientId) {
  state.editingClientId = clientId;
  const c = clientId ? state.clients.find((x) => x.id === clientId) : null;
  $("sheet-client-title").textContent = c ? "Editar ficha" : "Nueva clienta/cliente";
  $("f-name").value = c?.name || "";
  $("f-age").value = c?.age ?? "";
  $("f-type").value = c?.training_type || "";
  $("f-objectives").value = c?.objectives || "";
  $("f-pathologies").value = c?.pathologies || "";
  openSheet("sheet-client-backdrop");
  setTimeout(() => $("f-name").focus(), 150);
}

$("form-client").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: $("f-name").value.trim(),
    age: $("f-age").value ? Number($("f-age").value) : null,
    training_type: $("f-type").value.trim() || null,
    objectives: $("f-objectives").value.trim() || null,
    pathologies: $("f-pathologies").value.trim() || null,
  };
  if (!payload.name) return;
  try {
    if (state.editingClientId) {
      const { error } = await state.sb.from("clients").update(payload).eq("id", state.editingClientId);
      if (error) throw error;
      toast("Ficha actualizada.");
    } else {
      payload.active = true;
      const { data, error } = await state.sb.from("clients").insert(payload).select().single();
      if (error) throw error;
      toast("Clienta/cliente añadida.");
      state.currentClientId = data.id;
    }
    closeSheet("sheet-client-backdrop");
    await loadClients();
    if (state.currentClientId && $("screen-client").classList.contains("active")) {
      renderClientHeader();
    }
    if (state.editingClientId === null && $("screen-clients").classList.contains("active")) {
      openClient(state.currentClientId);
    }
  } catch (e2) {
    toast("Error al guardar: " + e2.message);
  }
});

/* ---------------- client detail ---------------- */
$("btn-back-clients").addEventListener("click", () => {
  showScreen("screen-clients");
  loadClients();
});

async function openClient(id) {
  state.currentClientId = id;
  state.activeCategory = CATEGORIES[0].key;
  showScreen("screen-client");
  renderClientHeader();
  renderCategoryTabs();
  $("client-notes").value = "";
  await loadExercisesAndLogs(id);
  renderExercises();
}

function renderClientHeader() {
  const c = state.clients.find((x) => x.id === state.currentClientId);
  if (!c) return;
  $("client-title").textContent = c.name;
  $("client-name").textContent = c.name;
  $("client-age").textContent = c.age ?? "—";
  $("client-age").classList.toggle("empty", !c.age);
  $("client-type").textContent = c.training_type || "Sin especificar";
  $("client-type").classList.toggle("empty", !c.training_type);
  $("client-objectives").textContent = c.objectives || "Sin especificar";
  $("client-objectives").classList.toggle("empty", !c.objectives);
  $("client-pathologies").textContent = c.pathologies || "Ninguna registrada";
  $("client-pathologies").classList.toggle("empty", !c.pathologies);
  $("client-tags").innerHTML = c.active
    ? '<span class="tag">Activa</span>'
    : '<span class="badge-inactive">Inactiva</span>';
  $("client-notes").value = c.notes || "";
  $("btn-toggle-active").textContent = c.active ? "Desactivar clienta/cliente" : "Reactivar clienta/cliente";
}

$("btn-toggle-active").addEventListener("click", async () => {
  const c = state.clients.find((x) => x.id === state.currentClientId);
  if (!c) return;
  const newActive = !c.active;
  const msg = newActive
    ? "¿Reactivar a esta clienta/cliente?"
    : "¿Desactivar a esta clienta/cliente? Sus datos no se borran, solo se ocultan de la lista de activas.";
  if (!confirm(msg)) return;
  try {
    const { error } = await state.sb.from("clients").update({ active: newActive }).eq("id", c.id);
    if (error) throw error;
    c.active = newActive;
    renderClientHeader();
    toast(newActive ? "Reactivada." : "Desactivada.");
  } catch (e) {
    toast("Error: " + e.message);
  }
});

$("btn-save-notes").addEventListener("click", async () => {
  try {
    const notes = $("client-notes").value;
    const { error } = await state.sb.from("clients").update({ notes }).eq("id", state.currentClientId);
    if (error) throw error;
    const c = state.clients.find((x) => x.id === state.currentClientId);
    if (c) c.notes = notes;
    toast("Anotaciones guardadas.");
  } catch (e) {
    toast("Error al guardar anotaciones: " + e.message);
  }
});

/* ---------------- categories ---------------- */
function renderCategoryTabs() {
  const wrap = $("cat-tabs");
  wrap.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const b = document.createElement("button");
    b.className = "cat-pill" + (cat.key === state.activeCategory ? " active" : "");
    b.textContent = cat.label;
    b.addEventListener("click", () => {
      state.activeCategory = cat.key;
      renderCategoryTabs();
      renderExercises();
    });
    wrap.appendChild(b);
  });
}

/* ---------------- exercises + logs ---------------- */
async function loadExercisesAndLogs(clientId) {
  state.exercisesByCategory = {};
  state.logsByExercise = {};
  try {
    const { data: exercises, error: exErr } = await state.sb
      .from("exercises")
      .select("*")
      .eq("client_id", clientId)
      .order("order_index", { ascending: true });
    if (exErr) throw exErr;

    CATEGORIES.forEach((c) => (state.exercisesByCategory[c.key] = []));
    (exercises || []).forEach((ex) => {
      if (!state.exercisesByCategory[ex.category]) state.exercisesByCategory[ex.category] = [];
      state.exercisesByCategory[ex.category].push(ex);
    });

    const ids = (exercises || []).map((e) => e.id);
    if (ids.length) {
      const { data: logs, error: logErr } = await state.sb
        .from("exercise_logs")
        .select("*")
        .in("exercise_id", ids)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (logErr) throw logErr;
      (logs || []).forEach((log) => {
        if (!state.logsByExercise[log.exercise_id]) state.logsByExercise[log.exercise_id] = [];
        state.logsByExercise[log.exercise_id].push(log);
      });
    }
    cacheSet("client_" + clientId, {
      exercisesByCategory: state.exercisesByCategory,
      logsByExercise: state.logsByExercise,
    });
  } catch (e) {
    const cached = cacheGet("client_" + clientId);
    if (cached) {
      state.exercisesByCategory = cached.exercisesByCategory;
      state.logsByExercise = cached.logsByExercise;
      toast("Sin conexión: mostrando el último histórico guardado.");
    } else {
      toast("No se pudieron cargar los ejercicios.");
    }
  }
}

function renderExercises() {
  const wrap = $("exercises-list");
  wrap.innerHTML = "";
  const list = state.exercisesByCategory[state.activeCategory] || [];

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<div class="glyph">💪</div><div>Sin ejercicios todavía en esta categoría.<br/>Añade el primero abajo.</div>`;
    wrap.appendChild(empty);
    return;
  }

  list.forEach((ex) => {
    const logs = state.logsByExercise[ex.id] || [];
    const latest = logs[0];
    const card = document.createElement("div");
    card.className = "exercise-card";

    const historyId = "hist-" + ex.id;
    card.innerHTML = `
      <div class="exercise-top">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="exercise-actions">
          <button class="mini-btn" data-action="log">+</button>
          <button class="mini-btn" data-action="rename">✎</button>
          <button class="mini-btn" data-action="delete">🗑</button>
        </div>
      </div>
      <div class="latest-row">
        ${
          latest
            ? `
          <div class="stat"><span class="val">${latest.weight_kg ?? "—"}kg</span><span class="lbl">Peso</span></div>
          <div class="stat"><span class="val">${latest.reps ?? "—"}</span><span class="lbl">Reps</span></div>
          <div class="stat"><span class="val">${latest.rir ?? "—"}</span><span class="lbl">RIR</span></div>
          <svg class="sparkline" data-spark="${ex.id}"></svg>
        `
            : `<div class="no-logs">Sin registros todavía</div>`
        }
      </div>
      ${logs.length ? `<div class="history-toggle" data-toggle="${historyId}">Ver histórico (${logs.length})</div>` : ""}
      <div class="history-list" id="${historyId}">
        ${logs
          .map(
            (l) => `
          <div class="history-row" data-log-id="${l.id}">
            <span class="d">${formatDate(l.log_date)}</span>
            <span class="vals">${l.weight_kg ?? "—"}kg · ${l.reps ?? "—"}reps · RIR ${l.rir ?? "—"}${l.note ? " · " + escapeHtml(l.note) : ""}</span>
            <button data-del-log="${l.id}">✕</button>
          </div>`
          )
          .join("")}
      </div>
    `;

    card.querySelector('[data-action="log"]').addEventListener("click", () => openLogSheet(ex.id, ex.name));
    card.querySelector('[data-action="rename"]').addEventListener("click", () => renameExercise(ex));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteExercise(ex));
    const toggle = card.querySelector("[data-toggle]");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const hist = card.querySelector("#" + historyId);
        hist.classList.toggle("show");
        toggle.textContent = hist.classList.contains("show") ? "Ocultar histórico" : `Ver histórico (${logs.length})`;
      });
    }
    card.querySelectorAll("[data-del-log]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteLog(btn.dataset.delLog, ex.id);
      });
    });

    wrap.appendChild(card);

    if (latest) {
      const svg = card.querySelector("[data-spark]");
      drawSparkline(svg, logs.slice(0, 8).reverse());
    }
  });
}

function drawSparkline(svg, logs) {
  const vals = logs.map((l) => Number(l.weight_kg)).filter((v) => !isNaN(v));
  if (vals.length < 2) {
    svg.remove();
    return;
  }
  const w = 60, h = 30, pad = 3;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const step = (w - pad * 2) / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#17b399";
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = `<polyline points="${pts.join(" ")}" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* add exercise */
$("btn-add-exercise").addEventListener("click", addExerciseFromInput);
$("new-exercise-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addExerciseFromInput(); }
});
async function addExerciseFromInput() {
  const input = $("new-exercise-name");
  const name = input.value.trim();
  if (!name) return;
  try {
    const order = (state.exercisesByCategory[state.activeCategory] || []).length;
    const { data, error } = await state.sb
      .from("exercises")
      .insert({
        client_id: state.currentClientId,
        category: state.activeCategory,
        name,
        order_index: order,
      })
      .select()
      .single();
    if (error) throw error;
    state.exercisesByCategory[state.activeCategory].push(data);
    input.value = "";
    renderExercises();
  } catch (e) {
    toast("Error al añadir ejercicio: " + e.message);
  }
}

async function renameExercise(ex) {
  const name = prompt("Nuevo nombre del ejercicio:", ex.name);
  if (!name || !name.trim() || name.trim() === ex.name) return;
  try {
    const { error } = await state.sb.from("exercises").update({ name: name.trim() }).eq("id", ex.id);
    if (error) throw error;
    ex.name = name.trim();
    renderExercises();
  } catch (e) {
    toast("Error: " + e.message);
  }
}

async function deleteExercise(ex) {
  if (!confirm(`¿Eliminar "${ex.name}" y todo su histórico? Esta acción no se puede deshacer.`)) return;
  try {
    const { error } = await state.sb.from("exercises").delete().eq("id", ex.id);
    if (error) throw error;
    state.exercisesByCategory[ex.category] = state.exercisesByCategory[ex.category].filter((e) => e.id !== ex.id);
    delete state.logsByExercise[ex.id];
    renderExercises();
    toast("Ejercicio eliminado.");
  } catch (e) {
    toast("Error: " + e.message);
  }
}

/* ---------------- log entries ---------------- */
$("btn-cancel-log").addEventListener("click", () => closeSheet("sheet-log-backdrop"));

function openLogSheet(exerciseId, exerciseName) {
  state.logSheetExerciseId = exerciseId;
  $("sheet-log-title").textContent = "Registrar: " + exerciseName;
  $("log-date").value = todayISO();
  $("log-weight").value = "";
  $("log-reps").value = "";
  $("log-rir").value = "";
  $("log-note").value = "";
  const logs = state.logsByExercise[exerciseId];
  if (logs && logs[0]) {
    $("log-weight").value = logs[0].weight_kg ?? "";
    $("log-reps").value = logs[0].reps ?? "";
  }
  openSheet("sheet-log-backdrop");
}

$("form-log").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    exercise_id: state.logSheetExerciseId,
    log_date: $("log-date").value || todayISO(),
    weight_kg: $("log-weight").value !== "" ? Number($("log-weight").value) : null,
    reps: $("log-reps").value !== "" ? Number($("log-reps").value) : null,
    rir: $("log-rir").value !== "" ? Number($("log-rir").value) : null,
    note: $("log-note").value.trim() || null,
  };
  try {
    const { data, error } = await state.sb.from("exercise_logs").insert(payload).select().single();
    if (error) throw error;
    const exId = payload.exercise_id;
    if (!state.logsByExercise[exId]) state.logsByExercise[exId] = [];
    state.logsByExercise[exId].unshift(data);
    state.logsByExercise[exId].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
    closeSheet("sheet-log-backdrop");
    renderExercises();
    toast("Registro guardado.");
  } catch (e2) {
    toast("Error al guardar registro: " + e2.message);
  }
});

async function deleteLog(logId, exerciseId) {
  if (!confirm("¿Eliminar este registro?")) return;
  try {
    const { error } = await state.sb.from("exercise_logs").delete().eq("id", logId);
    if (error) throw error;
    state.logsByExercise[exerciseId] = (state.logsByExercise[exerciseId] || []).filter((l) => l.id !== logId);
    renderExercises();
  } catch (e) {
    toast("Error: " + e.message);
  }
}

/* ---------------- sheets ---------------- */
function openSheet(id) {
  $(id).classList.add("show");
}
function closeSheet(id) {
  $(id).classList.remove("show");
}
document.querySelectorAll(".sheet-backdrop").forEach((bd) => {
  bd.addEventListener("click", (e) => {
    if (e.target === bd) bd.classList.remove("show");
  });
});

/* ---------------- boot ---------------- */
(async function boot() {
  if (!initSupabase()) return;
  const { data } = await state.sb.auth.getSession();
  if (data.session) {
    state.user = data.session.user;
    showScreen("screen-clients");
    await loadClients();
  } else {
    showScreen("screen-auth");
  }
  state.sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showScreen("screen-auth");
  });
})();

/* ---------------- service worker ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
