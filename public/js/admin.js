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
      // JSON bodies are strings; photo uploads are FormData and set their own Content-Type.
      headers: { Accept: "application/json", ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}) },
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
    showTab();
    await Promise.all([refresh(), refreshPhotos()]);
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
    const v = e || { day_of_week: 1, recurrence: "weekly", week_of_month: 1, venue: "Main hall", category: "", is_published: 1 };
    form.title.value = v.title || "";
    form.day_of_week.value = v.day_of_week == null ? "" : String(v.day_of_week);
    form.recurrence.value = v.recurrence === "monthly" ? "monthly" : "weekly";
    form.week_of_month.value = String(v.week_of_month || 1);
    form.start_time.value = v.start_time || "";
    form.end_time.value = v.end_time || "";
    form.venue.value = v.venue || "Main hall";
    form.category.value = v.category || "";
    form.description.value = v.description || "";
    form.cost.value = v.cost || "";
    form.contact_name.value = v.contact_name || "";
    form.contact_info.value = v.contact_info || "";
    form.is_published.checked = !!v.is_published;
    syncRecurrence();
    editor.showModal();
    form.title.focus();
  }

  function formData() {
    return {
      title: form.title.value,
      day_of_week: form.day_of_week.value,
      recurrence: form.recurrence.value,
      week_of_month: form.week_of_month.value,
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

  // "How often" only applies when there's a fixed day; "Which week" only for monthly events.
  const WEEKS = [null, "1st", "2nd", "3rd", "4th", "Last"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function syncRecurrence() {
    const day = form.day_of_week.value;
    const monthly = form.recurrence.value === "monthly";
    $("recurrence-field").hidden = day === "";
    $("week-field").hidden = day === "" || !monthly;
    if (day && monthly) {
      const w = Number(form.week_of_month.value);
      const next = nextMonthly(Number(day), w);
      $("week-hint").textContent = `${WEEKS[w]} ${DAYS[day]} of the month. Next one: ${DAYS[day]} ${next.getDate()} ${MONTHS[next.getMonth()]}.`;
    }
  }
  ["day_of_week", "recurrence", "week_of_month"].forEach((n) => form[n].addEventListener("change", syncRecurrence));

  // Date of the nth (1-4) or last (5) given weekday (1 = Mon … 7 = Sun) in a month.
  function nthWeekday(year, month, iso, week) {
    if (week === 5) {
      const last = new Date(year, month + 1, 0);
      return new Date(year, month, last.getDate() - (((last.getDay() || 7) - iso + 7) % 7));
    }
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((iso - (first.getDay() || 7) + 7) % 7) + (week - 1) * 7);
  }
  function nextMonthly(iso, week) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const d = nthWeekday(today.getFullYear(), today.getMonth() + k, iso, week);
      if (d >= today) return d;
    }
  }

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

  /* ---------------------------------------------------------- tabs */

  function showTab() {
    const tab = location.hash === "#gallery" ? "gallery" : "events";
    $("events-view").hidden = tab !== "events";
    $("gallery-view").hidden = tab !== "gallery";
    document.querySelectorAll("[data-tab]").forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    $("view-site").href = publicOrigin + (tab === "gallery" ? "/gallery" : "/whats-on");
    $("view-site").textContent = tab === "gallery" ? "View Gallery" : "View What's On";
  }
  window.addEventListener("hashchange", showTab);

  /* ------------------------------------------------------- gallery */

  let photos = [];
  const NEW_ALBUM = "__new__";

  async function refreshPhotos() {
    photos = (await api("/api/admin/photos")).photos;
    renderPhotos();
  }

  function albumNames() {
    return [...new Set(photos.map((p) => p.album))];
  }

  // Fill an album <select> with the existing albums plus "New album…".
  function fillAlbumSelect(select, newInput, current) {
    const names = albumNames();
    if (current && !names.includes(current)) names.push(current);
    select.replaceChildren(
      ...names.map((n) => el("option", { value: n, text: n })),
      el("option", { value: NEW_ALBUM, text: "New album…" })
    );
    select.value = current || names[0] || NEW_ALBUM;
    const sync = () => { newInput.hidden = select.value !== NEW_ALBUM; if (!newInput.hidden) newInput.focus(); };
    select.onchange = sync;
    newInput.hidden = select.value !== NEW_ALBUM;
    newInput.value = "";
  }
  const chosenAlbum = (select, newInput) => (select.value === NEW_ALBUM ? newInput.value.trim() : select.value);

  function renderPhotos() {
    const shown = photos.filter((p) => p.is_published).length;
    const hidden = photos.length - shown;
    $("photo-summary").textContent = photos.length
      ? `${shown} on the website${hidden ? `, ${hidden} hidden` : ""}, in ${albumNames().length} album${albumNames().length === 1 ? "" : "s"}.`
      : "No photos yet. Upload the first ones.";

    const groups = new Map();
    for (const p of photos) {
      if (!groups.has(p.album)) groups.set(p.album, []);
      groups.get(p.album).push(p);
    }
    $("photo-albums").replaceChildren(...[...groups].map(([name, list]) =>
      el("section", { class: "photo-album" }, [
        el("h2", {}, [document.createTextNode(name + " "), el("small", { text: `(${list.length})` })]),
        el("div", { class: "photo-grid" }, list.map((p, i) => photoCard(p, i === 0, i === list.length - 1))),
      ])
    ));
  }

  function photoCard(p, first, last) {
    const cap = el("p", { class: "cap" });
    if (!p.is_published) cap.append(el("span", { class: "status", text: "Hidden" }));
    cap.append(document.createTextNode(p.caption || "(no description)"));
    const btn = (action, text, extra = {}) =>
      el("button", { type: "button", "data-photo": p.id, "data-action": action, text, ...extra });
    return el("article", { class: "photo-card" + (p.is_published ? "" : " is-hidden") }, [
      el("img", { src: p.thumb_src, alt: p.caption, loading: "lazy" }),
      cap,
      el("div", { class: "actions" }, [
        btn("earlier", "←", { "aria-label": `Move “${p.caption}” earlier`, title: "Move earlier", disabled: first ? "" : null }),
        btn("later", "→", { "aria-label": `Move “${p.caption}” later`, title: "Move later", disabled: last ? "" : null }),
        btn("edit", "Edit"),
        btn("toggle", p.is_published ? "Hide" : "Show"),
        btn("delete", "Delete", { class: "danger", "aria-label": `Delete “${p.caption}”` }),
      ]),
    ]);
  }

  $("photo-albums").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-photo]");
    if (!b || b.disabled) return;
    const p = photos.find((x) => String(x.id) === b.dataset.photo);
    if (!p) return;
    try {
      const a = b.dataset.action;
      if (a === "edit") return openPhotoEditor(p);
      if (a === "earlier" || a === "later") {
        await api(`/api/admin/photos/${p.id}/move`, { method: "POST", body: JSON.stringify({ direction: a }) });
      }
      if (a === "toggle") {
        await api(`/api/admin/photos/${p.id}`, { method: "PUT", body: JSON.stringify({ is_published: !p.is_published }) });
        flash(p.is_published ? "Photo hidden from the website." : "Photo shown on the website.");
      }
      if (a === "delete") {
        if (!confirm(`Delete this photo?\n\n“${p.caption}”\n\nThis can't be undone. Tip: use Hide instead if you might want it back.`)) return;
        await api(`/api/admin/photos/${p.id}`, { method: "DELETE" });
        flash("Photo deleted.");
      }
      await refreshPhotos();
      // Keep keyboard focus on the same control after a move.
      if (a === "earlier" || a === "later") {
        document.querySelector(`button[data-photo="${p.id}"][data-action="${a}"]:not(:disabled)`)?.focus();
      }
    } catch (err) {
      flash(err.message);
    }
  });

  /* Resize in the browser: max 1600px full size + 640px thumbnail, as JPEG.
     Re-encoding through a canvas also drops EXIF data such as GPS location. */
  async function prepareImage(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      throw new Error("This browser can't read that file. Please use a JPEG or PNG photo. On an iPhone, AirDrop or email it to yourself as JPEG, or use Safari.");
    }
    const encode = (max, quality) => {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // transparent PNGs get a white background
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("Couldn't process that photo."))), "image/jpeg", quality)
      );
    };
    const [full, thumb] = [await encode(1600, 0.82), await encode(640, 0.78)];
    bitmap.close?.();
    return { image: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
  }

  function photoForm(prepared, extra) {
    const fd = new FormData();
    fd.append("image", prepared.image, "photo.jpg");
    fd.append("thumb", prepared.thumb, "thumb.jpg");
    fd.append("width", String(prepared.width));
    fd.append("height", String(prepared.height));
    for (const [k, v] of Object.entries(extra || {})) fd.append(k, v);
    return fd;
  }

  // Captions default to the file name made readable ("garden-bbq_2.jpg" -> "Garden bbq 2").
  const guessCaption = (name) => {
    const s = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return /^(img|dsc|pxl|photo|image)\s*\d+/i.test(s) ? "" : s.charAt(0).toUpperCase() + s.slice(1);
  };

  let queue = [];
  $("photo-files").addEventListener("change", (ev) => {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length) return;
    queue.forEach((q) => URL.revokeObjectURL(q.url));
    queue = files.map((file) => ({ file, url: URL.createObjectURL(file), caption: guessCaption(file.name), status: "" }));
    fillAlbumSelect($("upload-album"), $("upload-album-new"));
    $("upload-error").hidden = true;
    $("upload-panel").hidden = false;
    renderQueue();
    $("upload-panel").querySelector("input[data-q]")?.focus();
  });

  function renderQueue() {
    $("upload-go").textContent = queue.length === 1 ? "Upload 1 photo" : `Upload ${queue.length} photos`;
    $("upload-queue").replaceChildren(...queue.map((q, i) => {
      const input = el("input", { "data-q": i, maxlength: "200", placeholder: "Describe this photo", "aria-label": `Description for ${q.file.name}` });
      input.value = q.caption;
      input.addEventListener("input", () => (q.caption = input.value));
      return el("li", {}, [
        el("img", { src: q.url, alt: "" }),
        el("div", {}, [input, q.status ? el("p", { class: "status " + (q.state || ""), text: q.status }) : null]),
        q.state === "ok" ? null : el("button", { type: "button", "data-remove": i, text: "Remove", "aria-label": `Remove ${q.file.name}` }),
      ]);
    }));
  }

  $("upload-queue").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-remove]");
    if (!b) return;
    const [gone] = queue.splice(Number(b.dataset.remove), 1);
    URL.revokeObjectURL(gone.url);
    if (!queue.length) return closeUpload();
    renderQueue();
  });

  function closeUpload() {
    queue.forEach((q) => URL.revokeObjectURL(q.url));
    queue = [];
    $("upload-panel").hidden = true;
  }
  $("upload-cancel").addEventListener("click", closeUpload);

  $("upload-go").addEventListener("click", async () => {
    const err = $("upload-error");
    err.hidden = true;
    const album = chosenAlbum($("upload-album"), $("upload-album-new"));
    if (!album) { err.textContent = "Please name the new album."; err.hidden = false; return; }
    const missing = queue.findIndex((q) => q.state !== "ok" && !q.caption.trim());
    if (missing >= 0) {
      err.textContent = "Please add a description for every photo.";
      err.hidden = false;
      $("upload-queue").querySelector(`input[data-q="${missing}"]`)?.focus();
      return;
    }
    const go = $("upload-go");
    go.disabled = true;
    let done = 0;
    for (const q of queue) {
      if (q.state === "ok") continue;
      q.state = ""; q.status = "Uploading…"; renderQueue();
      try {
        const prepared = await prepareImage(q.file);
        await api("/api/admin/photos", { method: "POST", body: photoForm(prepared, { album, caption: q.caption.trim() }) });
        q.state = "ok"; q.status = "Uploaded"; done++;
      } catch (e) {
        q.state = "err"; q.status = e.message;
      }
      renderQueue();
    }
    go.disabled = false;
    await refreshPhotos();
    if (queue.every((q) => q.state === "ok")) {
      closeUpload();
      flash(done === 1 ? "Photo uploaded." : `${done} photos uploaded.`);
    } else {
      err.textContent = "Some photos didn't upload. See the messages above, then try again or remove them.";
      err.hidden = false;
    }
  });

  /* edit dialog */
  const photoEditor = $("photo-editor");
  const photoFormEl = $("photo-form");
  let editingPhoto = null;

  function openPhotoEditor(p) {
    editingPhoto = p;
    $("photo-preview").src = p.thumb_src;
    $("photo-preview").alt = p.caption;
    photoFormEl.caption.value = p.caption;
    fillAlbumSelect($("p-album"), $("p-album-new"), p.album);
    $("p-replace").value = "";
    $("p-published").checked = !!p.is_published;
    $("photo-form-error").hidden = true;
    photoEditor.showModal();
    photoFormEl.caption.focus();
  }

  $("p-replace").addEventListener("change", (ev) => {
    const f = ev.target.files?.[0];
    if (f) $("photo-preview").src = URL.createObjectURL(f);
  });

  photoFormEl.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("photo-form-error");
    err.hidden = true;
    const caption = photoFormEl.caption.value.trim();
    const album = chosenAlbum($("p-album"), $("p-album-new"));
    if (!caption) { err.textContent = "Please describe the photo."; err.hidden = false; return; }
    if (!album) { err.textContent = "Please name the new album."; err.hidden = false; return; }
    const save = $("photo-save");
    save.disabled = true;
    try {
      const file = $("p-replace").files?.[0];
      if (file) {
        save.textContent = "Uploading…";
        await api(`/api/admin/photos/${editingPhoto.id}/image`, { method: "POST", body: photoForm(await prepareImage(file)) });
      }
      await api(`/api/admin/photos/${editingPhoto.id}`, {
        method: "PUT",
        body: JSON.stringify({ caption, album, is_published: $("p-published").checked }),
      });
      photoEditor.close();
      flash(file ? "Photo replaced and saved." : "Changes saved.");
      await refreshPhotos();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      save.disabled = false;
      save.textContent = "Save changes";
    }
  });
  photoEditor.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => photoEditor.close()));

  /* ---------------------------------------------------------- start */
  api("/api/session")
    .then((s) => (s.authenticated ? showApp() : showLogin()))
    .catch(showLogin);
})();
