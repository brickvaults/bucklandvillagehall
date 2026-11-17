// Buckland Memorial Hall — events admin (admin.bucklandvillage.com)

(function () {
  "use strict";

  const DAYS = [null, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const $ = (id) => document.getElementById(id);

  const loginView = $("login-view");
  const appView = $("app-view");
  const editor = $("editor");
  const form = $("event-form");
  let events = [];
  let editingId = null;

  // The public site lives on the same domain without "admin."
  const publicOrigin = location.origin.replace("//admin.", "//");
  $("view-site").href = publicOrigin + "/whats-on";

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.status === 401 && !path.endsWith("/login")) { showLogin(); throw new Error(data.error || "Please log in."); }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    (children || []).forEach((c) => c && n.append(c));
    return n;
  }

  function fmtTime(t) {
    if (!t) return "";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return m ? `${h}.${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
  }

  let flashTimer;
  function flash(msg) {
    const f = $("flash");
    f.textContent = msg;
    f.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (f.hidden = true), 4000);
  }

  /* --------------------------------------------------------- views */

  function showLogin() {
    appView.hidden = true;
    loginView.hidden = false;
    if (editor.open) editor.close();
    $("password").focus();
  }

  async function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    await refresh();
  }

  async function refresh() {
    const data = await api("/api/admin/events");
    events = data.events;
    render();
  }

  function render() {
    const shown = events.filter((e) => e.is_published).length;
    const hidden = events.length - shown;
    $("summary").textContent = events.length
      ? `${shown} shown on the website${hidden ? `, ${hidden} hidden` : ""}.`
      : "No events yet. Add the first one.";

    const table = $("event-table");
    if (!events.length) {
      table.replaceChildren(el("div", { class: "empty" }, [
        el("strong", { text: "Nothing listed yet" }),
        document.createTextNode("Use “Add an event” to put your first regular event on the What's On page."),
      ]));
      return;
    }

    const groups = new Map();
    for (const e of events) {
      const k = e.day_of_week || 0;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    table.replaceChildren(
      ...[1, 2, 3, 4, 5, 6, 7, 0].filter((k) => groups.has(k)).map((k) =>
        el("section", { class: "admin-day" }, [
          el("h2", { text: k ? DAYS[k] : "Day varies" }),
          el("div", { class: "rows" }, groups.get(k).map(row)),
        ])
      )
    );
  }

  function row(e) {
    const time = e.start_time ? fmtTime(e.start_time) + (e.end_time ? " – " + fmtTime(e.end_time) : "") : "Times vary";
    const title = el("div", { class: "title" }, [document.createTextNode(e.title)]);
    if (!e.is_published) title.append(el("span", { class: "status", text: "Hidden" }));
    return el("div", { class: "row" + (e.is_published ? "" : " hidden-event") }, [
      el("div", { class: "time", text: time }),
      el("div", {}, [
        title,
        el("div", { class: "sub", text: [e.frequency, e.venue, e.category].filter(Boolean).join(" · ") }),
      ]),
      el("div", { class: "actions" }, [
        el("button", { type: "button", "data-action": "edit", "data-id": e.id, text: "Edit" }),
        el("button", { type: "button", "data-action": "toggle", "data-id": e.id, text: e.is_published ? "Hide" : "Show" }),
        el("button", { type: "button", class: "danger", "data-action": "delete", "data-id": e.id, text: "Delete", "aria-label": `Delete ${e.title}` }),
      ]),
    ]);
  }

  /* -------------------------------------------------------- editor */

  function openEditor(e) {
    editingId = e ? e.id : null;
    $("editor-title").textContent = e ? "Edit event" : "Add an event";
    $("save-btn").textContent = e ? "Save changes" : "Add event";
    $("form-error").hidden = true;
    form.reset();
    const v = e || { day_of_week: 1, frequency: "Every week", venue: "Main hall", category: "", is_published: 1 };
    form.title.value = v.title || "";
    form.day_of_week.value = v.day_of_week == null ? "" : String(v.day_of_week);
    form.frequency.value = v.frequency || "";
    form.start_time.value = v.start_time || "";
    form.end_time.value = v.end_time || "";
    form.venue.value = v.venue || "Main hall";
    form.category.value = v.category || "";
    form.description.value = v.description || "";
    form.cost.value = v.cost || "";
    form.contact_name.value = v.contact_name || "";
    form.contact_info.value = v.contact_info || "";
    form.is_published.checked = !!v.is_published;
    editor.showModal();
    form.title.focus();
  }

  function formData() {
    return {
      title: form.title.value,
      day_of_week: form.day_of_week.value,
      frequency: form.frequency.value,
      start_time: form.start_time.value,
      end_time: form.end_time.value,
      venue: form.venue.value,
      category: form.category.value,
      description: form.description.value,
      cost: form.cost.value,
      contact_name: form.contact_name.value,
      contact_info: form.contact_info.value,
      is_published: form.is_published.checked,
    };
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("form-error");
    err.hidden = true;
    if (!form.title.value.trim()) {
      err.textContent = "Please give the event a name.";
      err.hidden = false;
      form.title.focus();
      return;
    }
    const btn = $("save-btn");
    btn.disabled = true;
    try {
      const body = JSON.stringify(formData());
      if (editingId) await api(`/api/admin/events/${editingId}`, { method: "PUT", body });
      else await api("/api/admin/events", { method: "POST", body });
      editor.close();
      flash(editingId ? "Changes saved." : "Event added.");
      await refresh();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  editor.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => editor.close()));

  /* ------------------------------------------------------- actions */

  $("add-event").addEventListener("click", () => openEditor(null));

  $("event-table").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-action]");
    if (!b) return;
    const e = events.find((x) => String(x.id) === b.dataset.id);
    if (!e) return;
    try {
      if (b.dataset.action === "edit") return openEditor(e);
      if (b.dataset.action === "toggle") {
        await api(`/api/admin/events/${e.id}`, { method: "PUT", body: JSON.stringify({ ...e, is_published: !e.is_published }) });
        flash(e.is_published ? `“${e.title}” is now hidden from the website.` : `“${e.title}” is now shown on the website.`);
        await refresh();
      }
      if (b.dataset.action === "delete") {
        if (!confirm(`Delete “${e.title}”? This can't be undone. Tip: use Hide instead if it's only taking a break.`)) return;
        await api(`/api/admin/events/${e.id}`, { method: "DELETE" });
        flash(`“${e.title}” deleted.`);
        await refresh();
      }
    } catch (err) {
      flash(err.message);
    }
  });

  $("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("login-error");
    err.hidden = true;
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("password").value }) });
      $("password").value = "";
      await showApp();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  $("logout").addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
    showLogin();
  });

  /* ---------------------------------------------------------- start */
  api("/api/session")
    .then((s) => (s.authenticated ? showApp() : showLogin()))
    .catch(showLogin);
})();
