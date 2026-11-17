// Buckland Memorial Hall — public site behaviour.
// Mobile menu, the footer year, event listings (home + What's On) and the gallery lightbox.

(function () {
  "use strict";

  /* ---------------------------------------------------------- menu */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  document.querySelectorAll("[data-year]").forEach((n) => (n.textContent = String(new Date().getFullYear())));

  /* ------------------------------------------------------- helpers */
  const DAYS = [null, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const SHORT = [null, "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const now = new Date();
  const todayIso = now.getDay() || 7; // 1 = Monday … 7 = Sunday
  const nowHHMM = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

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

  // "10:00" -> "10am", "19:30" -> "7.30pm" (British style)
  function fmtTime(t) {
    if (!t) return "";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return m ? `${h}.${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
  }
  function fmtRange(e) {
    if (e.start_time && e.end_time) return `${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}`;
    if (e.start_time) return `From ${fmtTime(e.start_time)}`;
    return "Times vary";
  }

  // Phone, email or website shown as a link; anything else as plain text.
  function contactNode(info) {
    const s = info.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return el("a", { href: "mailto:" + s, text: s });
    if (/^https?:\/\/\S+$/i.test(s)) return el("a", { href: s, rel: "noopener", target: "_blank", text: s.replace(/^https?:\/\//, "") });
    if (/^www\.\S+$/i.test(s)) return el("a", { href: "https://" + s, rel: "noopener", target: "_blank", text: s });
    if (/^\+?[\d\s()-]{7,}$/.test(s)) return el("a", { href: "tel:" + s.replace(/[^\d+]/g, ""), text: s });
    return document.createTextNode(s);
  }

  function dayLabel(day) {
    if (day === todayIso) return "Today";
    if (day === (todayIso % 7) + 1) return "Tomorrow";
    return DAYS[day];
  }

  // Date of the nth (1-4) or last (5) given weekday (1 = Mon … 7 = Sun) in a month.
  function nthWeekday(year, month, iso, week) {
    if (week === 5) {
      const last = new Date(year, month + 1, 0);
      return new Date(year, month, last.getDate() - (((last.getDay() || 7) - iso + 7) % 7));
    }
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((iso - (first.getDay() || 7) + 7) % 7) + (week - 1) * 7);
  }

  // Next time an event happens (today counts until it has finished), or null if dates vary.
  function nextDate(e) {
    if (!e.day_of_week) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const finishedToday = (e.end_time || e.start_time || "23:59") < nowHHMM;
    const notPast = (d) => d > today || (+d === +today && !finishedToday);
    if (e.recurrence === "monthly" && e.week_of_month) {
      for (let k = 0; k < 3; k++) {
        const d = nthWeekday(today.getFullYear(), today.getMonth() + k, e.day_of_week, e.week_of_month);
        if (notPast(d)) return d;
      }
      return null;
    }
    let ahead = (e.day_of_week - todayIso + 7) % 7;
    if (ahead === 0 && finishedToday) ahead = 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead);
  }
  const daysAhead = (d) => Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const fmtDate = (d) => `${DAYS[d.getDay() || 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

  async function loadEvents() {
    const res = await fetch("/api/events", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Could not load events");
    return (await res.json()).events || [];
  }

  function showError(container) {
    container.replaceChildren(
      el("div", { class: "empty" }, [
        el("strong", { text: "We couldn't load the events just now." }),
        document.createTextNode("Please refresh the page, or call the hall on 01367 870886."),
      ])
    );
  }

  /* ------------------------------------------- home: coming up soon */
  const upcoming = document.getElementById("upcoming-events");
  if (upcoming) {
    loadEvents()
      .then((events) => {
        // Everything on in the next 7 days, weekly and monthly alike.
        const dated = events
          .map((e) => ({ e, date: nextDate(e) }))
          .filter((x) => x.date && daysAhead(x.date) <= 7)
          .map((x) => ({ ...x, ahead: daysAhead(x.date) }))
          .sort((a, b) => a.ahead - b.ahead || (a.e.start_time || "").localeCompare(b.e.start_time || ""))
          .slice(0, 6);

        if (!dated.length) {
          upcoming.closest("section")?.setAttribute("hidden", "");
          return;
        }
        upcoming.replaceChildren(
          ...dated.map(({ e, ahead }) => {
            const weekly = e.recurrence !== "monthly";
            const label = !weekly && ahead > 1 ? fmtDate(dated.find((x) => x.e === e).date)
              : ahead === 7 ? `Next ${DAYS[e.day_of_week]}` : dayLabel(e.day_of_week);
            return el("article", { class: "item" }, [
              el("p", { class: "when" }, [
                ahead === 0 ? el("span", { class: "today-badge", text: "Today" }) : el("span", { text: label }),
                el("span", { text: "· " + fmtRange(e) }),
              ]),
              el("h3", { text: e.title }),
              el("p", { class: "where", text: [e.venue, weekly ? "" : e.frequency].filter(Boolean).join(" · ") }),
            ]);
          })
        );
      })
      .catch(() => upcoming.closest("section")?.setAttribute("hidden", ""));
  }

  /* --------------------------------------------- What's On timetable */
  const timetable = document.getElementById("timetable");
  if (timetable) {
    const todayPill = document.getElementById("today-date");
    if (todayPill) todayPill.textContent = `Today is ${DAYS[todayIso]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

    const filter = document.getElementById("day-filter");
    let all = [];
    let selected = "all";

    function eventCard(e) {
      const meta = [e.category && el("li", { class: "cat", text: e.category }), e.venue && el("li", { text: e.venue })];
      if (e.frequency && e.recurrence === "monthly") meta.push(el("li", { class: "monthly", text: e.frequency }));
      if (e.cost) meta.push(el("li", { text: e.cost }));

      const contact = e.contact_name || e.contact_info
        ? el("p", { class: "contact" }, [
            el("strong", { text: "Contact: " }),
            document.createTextNode(e.contact_name ? e.contact_name + (e.contact_info ? " · " : "") : ""),
            e.contact_info ? contactNode(e.contact_info) : null,
          ])
        : null;

      return el("article", { class: "event" }, [
        el("div", { class: "event-time" }, [
          document.createTextNode(e.start_time ? fmtTime(e.start_time) : "Times vary"),
          e.end_time ? el("small", { text: "until " + fmtTime(e.end_time) }) : null,
        ]),
        el("div", {}, [
          el("h3", { text: e.title }),
          el("ul", { class: "event-meta" }, meta),
          e.recurrence === "monthly" && nextDate(e) ? el("p", { class: "next-date", text: "Next one: " + fmtDate(nextDate(e)) }) : null,
          e.description ? el("p", { text: e.description }) : null,
          contact,
        ]),
      ]);
    }

    function render() {
      const groups = new Map();
      for (const e of all) {
        const key = e.day_of_week || 0;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      }
      const keys = [1, 2, 3, 4, 5, 6, 7, 0].filter((k) => groups.has(k) && (selected === "all" || String(k) === selected));

      if (!all.length) {
        timetable.replaceChildren(
          el("div", { class: "empty" }, [
            el("strong", { text: "No regular events are listed yet." }),
            document.createTextNode("Check back soon, or get in touch to find out what's happening at the hall."),
          ])
        );
        return;
      }

      timetable.replaceChildren(
        ...keys.map((k) => {
          const heading = el("h2", { id: "day-" + k }, [document.createTextNode(k ? DAYS[k] + "s" : "Other regular events")]);
          if (k === todayIso) heading.append(el("span", { class: "today-badge", text: "Today" }));
          return el("section", { class: "day-group", "aria-labelledby": "day-" + k }, [
            heading,
            el("div", { class: "event-list" }, groups.get(k).map(eventCard)),
          ]);
        })
      );
    }

    function buildFilter() {
      const present = new Set(all.map((e) => e.day_of_week || 0));
      const options = [["all", "All days"]]
        .concat([1, 2, 3, 4, 5, 6, 7].filter((d) => present.has(d)).map((d) => [String(d), SHORT[d]]))
        .concat(present.has(0) ? [["0", "Other"]] : []);
      if (options.length <= 2) { filter.hidden = true; return; }
      filter.replaceChildren(
        ...options.map(([value, label]) => {
          const b = el("button", { type: "button", "aria-pressed": String(value === selected), "data-day": value, text: label });
          if (value === String(todayIso)) b.setAttribute("aria-label", `${DAYS[todayIso]} (today)`);
          return b;
        })
      );
      filter.hidden = false;
    }

    filter?.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-day]");
      if (!b) return;
      selected = b.dataset.day;
      filter.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    });

    loadEvents()
      .then((events) => { all = events; buildFilter(); render(); })
      .catch(() => showError(timetable));
  }

  /* ------------------------------------------------------- gallery */
  const albumsEl = document.getElementById("albums");
  if (albumsEl) {
    fetch("/api/photos", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ photos }) => {
        const albums = new Map();
        for (const p of photos) {
          if (!albums.has(p.album)) albums.set(p.album, []);
          albums.get(p.album).push(p);
        }
        if (!albums.size) {
          albumsEl.replaceChildren(el("section", { class: "section" }, [el("div", { class: "wrap" }, [
            el("div", { class: "empty" }, [el("strong", { text: "No photos yet." }), document.createTextNode("Check back soon.")]),
          ])]));
          return;
        }
        let i = 0;
        albumsEl.replaceChildren(...[...albums].map(([name, list]) => {
          const id = "album-" + i;
          return el("section", { class: "section" + (i++ % 2 ? " paper" : ""), "aria-labelledby": id }, [
            el("div", { class: "wrap" }, [
              el("div", { class: "section-head" }, [el("h2", { id, text: name })]),
              el("div", { class: "gallery" }, list.map((p) =>
                el("button", { type: "button", "data-full": p.src, "aria-label": "View larger: " + p.caption }, [
                  el("img", { src: p.thumb_src, alt: p.caption, width: p.width, height: p.height, loading: "lazy" }),
                ])
              )),
            ]),
          ]);
        }));
      })
      .catch(() => {
        albumsEl.replaceChildren(el("section", { class: "section" }, [el("div", { class: "wrap" }, [
          el("div", { class: "empty" }, [el("strong", { text: "We couldn't load the photos just now." }), document.createTextNode("Please refresh the page.")]),
        ])]));
      });
  }

  /* ------------------------------------------------------ lightbox */
  // Gallery thumbnails and the content photos on other pages (cards, side photos,
  // call-to-action photos) open full size in one shared viewer.
  const ZOOM_SELECTOR = ".gallery button, button.zoom";
  document.querySelectorAll(".card > img, .rounded-photo > img, .cta-band .photo > img").forEach((im) => {
    const b = el("button", { type: "button", class: "zoom", "aria-label": "View larger: " + im.alt });
    im.replaceWith(b);
    b.append(im);
  });

  let box = document.getElementById("lightbox");
  if (!box && document.querySelector(ZOOM_SELECTOR)) {
    box = el("dialog", { id: "lightbox", class: "lightbox", "aria-label": "Photo viewer" }, [
      el("img", { src: "", alt: "" }),
      el("div", { class: "bar" }, [
        el("p", { class: "caption" }),
        el("div", { class: "pill-row" }, [
          el("button", { class: "pill small", type: "button", "data-prev": "", "aria-label": "Previous photo", text: "‹" }),
          el("button", { class: "pill small", type: "button", "data-next": "", "aria-label": "Next photo", text: "›" }),
          el("button", { class: "pill small ink", type: "button", "data-close": "", text: "Close" }),
        ]),
      ]),
    ]);
    document.body.append(box);
  }

  if (box && typeof box.showModal === "function") {
    const buttons = () => Array.from(document.querySelectorAll(ZOOM_SELECTOR));
    const img = box.querySelector("img");
    const caption = box.querySelector(".caption");
    let index = 0;

    function show(i) {
      const list = buttons();
      index = (i + list.length) % list.length;
      const thumb = list[index].querySelector("img");
      img.src = list[index].dataset.full || thumb.currentSrc || thumb.src;
      img.alt = thumb.alt;
      caption.textContent = thumb.alt;
      // Only offer previous/next when there's more than one photo.
      box.querySelector("[data-prev]").hidden = box.querySelector("[data-next]").hidden = list.length < 2;
    }
    document.addEventListener("click", (e) => {
      const b = e.target.closest(ZOOM_SELECTOR);
      if (!b) return;
      show(buttons().indexOf(b));
      box.showModal();
    });
    box.querySelector("[data-prev]").addEventListener("click", () => show(index - 1));
    box.querySelector("[data-next]").addEventListener("click", () => show(index + 1));
    box.querySelector("[data-close]").addEventListener("click", () => box.close());
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
  }
})();
