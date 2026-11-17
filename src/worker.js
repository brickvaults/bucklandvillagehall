/**
 * Buckland Memorial Hall — Cloudflare Worker
 *
 * One Worker serves two hostnames:
 *
 *   bucklandvillage.com (and www.)   the public site, static pages from ./public
 *     GET    /api/events              published regular events
 *
 *   admin.bucklandvillage.com        the events admin app (public/admin.html at "/")
 *     POST   /api/login               { password } -> session cookie
 *     POST   /api/logout
 *     GET    /api/session             { authenticated }
 *     GET    /api/admin/events        all events, incl. hidden
 *     POST   /api/admin/events        create
 *     PUT    /api/admin/events/:id    update
 *     DELETE /api/admin/events/:id    delete
 *
 * The admin app and admin API answer only on the admin. hostname; on the public
 * hostname they return the normal 404 page. Locally, use http://admin.localhost:8787.
 *
 * Secrets (set with `wrangler secret put`, or .dev.vars locally):
 *   ADMIN_PASSWORD   the shared password for the admin area
 *   SESSION_SECRET   long random string used to sign session cookies
 */

import { json } from "./util.js";
import {
  isPhotoPath, servePhoto, listPublicPhotos, listAllPhotos,
  uploadPhoto, replacePhotoImage, updatePhoto, movePhoto, deletePhoto,
} from "./photos.js";

const COOKIE = "bh_session";
const SESSION_HOURS = 8;
const MAX_FAILED_LOGINS = 8;       // per IP …
const LOCKOUT_WINDOW_SECS = 15 * 60; // … per 15 minutes


// Files that belong to the admin app and are never served on the public hostname.
const ADMIN_ONLY_ASSETS = /^\/(admin(\.html)?|js\/admin\.js|css\/admin\.css)$/;
// What the admin hostname is allowed to serve from ./public besides the app itself.
const SHARED_ASSETS = /^\/(css|js|fonts|img)\//;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return isAdminHost(url) ? await adminHost(request, env, url) : await publicHost(request, env, url);
    } catch (err) {
      console.error(err);
      return withSecurityHeaders(json({ error: "Something went wrong. Please try again." }, 500));
    }
  },
};

function isAdminHost(url) {
  return url.hostname.startsWith("admin.");
}

async function publicHost(request, env, url) {
  if (url.hostname.startsWith("www.")) {
    const apex = new URL(url);
    apex.hostname = url.hostname.slice(4);
    return Response.redirect(apex.toString(), 301);
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/events" && request.method === "GET") {
    return withSecurityHeaders(await listPublicEvents(env));
  }
  if (path === "/api/photos" && request.method === "GET") {
    return withSecurityHeaders(await listPublicPhotos(env));
  }
  if (isPhotoPath(url.pathname) && (request.method === "GET" || request.method === "HEAD")) {
    return (await servePhoto(request, env, url)) || notFound(request, env, url);
  }
  if (path.startsWith("/api/") || ADMIN_ONLY_ASSETS.test(path)) return notFound(request, env, url);
  return env.ASSETS.fetch(request);
}

async function adminHost(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/api/")) return withSecurityHeaders(await handleAdminApi(request, env, url, path));
  if (path === "/") {
    const res = await env.ASSETS.fetch(new Request(new URL("/admin", url), request));
    const r = new Response(res.body, res);
    r.headers.set("Cache-Control", "no-store");
    r.headers.set("X-Robots-Tag", "noindex, nofollow");
    return r;
  }
  if (isPhotoPath(url.pathname) && (request.method === "GET" || request.method === "HEAD")) {
    return (await servePhoto(request, env, url)) || new Response("Not found", { status: 404 });
  }
  if (SHARED_ASSETS.test(url.pathname) || url.pathname === "/favicon.ico") return env.ASSETS.fetch(request);
  if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
  // Any public page requested on the admin hostname goes back to the main site.
  const publicUrl = new URL(url);
  publicUrl.hostname = url.hostname.replace(/^admin\./, "");
  return Response.redirect(publicUrl.toString(), 302);
}

function notFound(request, env, url) {
  return env.ASSETS.fetch(new Request(new URL("/__not-found__", url), { method: "GET", headers: request.headers }));
}

async function handleAdminApi(request, env, url, path) {
  const method = request.method;

  if (path === "/api/session" && method === "GET") {
    return json({ authenticated: await isAuthenticated(request, env) }, 200, { "Cache-Control": "no-store" });
  }

  // Everything below changes state or reveals unpublished data.
  if (method !== "GET" && !sameOrigin(request, url)) return json({ error: "Bad origin" }, 403);

  if (path === "/api/login" && method === "POST") return login(request, env);
  if (path === "/api/logout" && method === "POST") return logout();

  if (path.startsWith("/api/admin/")) {
    if (!(await isAuthenticated(request, env))) return json({ error: "Please log in." }, 401);

    if (path === "/api/admin/events") {
      if (method === "GET") return listAllEvents(env);
      if (method === "POST") return createEvent(request, env);
    }
    const m = path.match(/^\/api\/admin\/events\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      if (method === "PUT") return updateEvent(request, env, id);
      if (method === "DELETE") return deleteEvent(env, id);
    }

    if (path === "/api/admin/photos") {
      if (method === "GET") return listAllPhotos(env);
      if (method === "POST") return uploadPhoto(request, env);
    }
    const p = path.match(/^\/api\/admin\/photos\/(\d+)(\/image|\/move)?$/);
    if (p) {
      const id = Number(p[1]);
      if (!p[2] && method === "PUT") return updatePhoto(request, env, id);
      if (!p[2] && method === "DELETE") return deletePhoto(env, id);
      if (p[2] === "/image" && method === "POST") return replacePhotoImage(request, env, id);
      if (p[2] === "/move" && method === "POST") return movePhoto(request, env, id);
    }
  }

  return json({ error: "Not found" }, 404);
}

/* ---------------------------------------------------------------- events */

const ORDER = "ORDER BY day_of_week IS NULL, day_of_week, start_time IS NULL, start_time, title";

async function listPublicEvents(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, category, day_of_week, frequency, recurrence, week_of_month, start_time,
            end_time, venue, description, cost, contact_name, contact_info
       FROM events WHERE is_published = 1 ${ORDER}`
  ).all();
  return json({ events: results }, 200, { "Cache-Control": "public, max-age=60" });
}

async function listAllEvents(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM events ${ORDER}`).all();
  return json({ events: results }, 200, { "Cache-Control": "no-store" });
}

async function createEvent(request, env) {
  const parsed = await readEvent(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const e = parsed.value;
  const row = await env.DB.prepare(
    `INSERT INTO events (title, category, day_of_week, frequency, start_time, end_time, venue,
                         description, cost, contact_name, contact_info, is_published,
                         recurrence, week_of_month)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(...eventParams(e)).first();
  return json({ event: row }, 201);
}

async function updateEvent(request, env, id) {
  const parsed = await readEvent(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const e = parsed.value;
  const row = await env.DB.prepare(
    `UPDATE events SET title = ?, category = ?, day_of_week = ?, frequency = ?, start_time = ?,
            end_time = ?, venue = ?, description = ?, cost = ?, contact_name = ?, contact_info = ?,
            is_published = ?, recurrence = ?, week_of_month = ?, updated_at = datetime('now')
      WHERE id = ? RETURNING *`
  ).bind(...eventParams(e), id).first();
  if (!row) return json({ error: "That event no longer exists." }, 404);
  return json({ event: row });
}

async function deleteEvent(env, id) {
  const res = await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
  if (!res.meta.changes) return json({ error: "That event no longer exists." }, 404);
  return json({ ok: true });
}

function eventParams(e) {
  return [e.title, e.category, e.day_of_week, e.frequency, e.start_time, e.end_time, e.venue,
          e.description, e.cost, e.contact_name, e.contact_info, e.is_published,
          e.recurrence, e.week_of_month];
}

const DAY_NAMES = [null, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEK_NAMES = [null, "1st", "2nd", "3rd", "4th", "Last"];

/** "Every week", "2nd Thursday of the month" or "Dates vary". */
function frequencyLabel(day, recurrence, week) {
  if (day === null) return "Dates vary";
  if (recurrence === "monthly") return `${WEEK_NAMES[week]} ${DAY_NAMES[day]} of the month`;
  return "Every week";
}

/** Validate and normalise an event payload from the admin form. */
async function readEvent(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: "Expected JSON." };
  }
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const time = (v) => {
    const s = str(v, 5);
    if (!s) return null;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : undefined;
  };

  const title = str(body.title, 120);
  if (!title) return { error: "Please give the event a name." };

  let day = body.day_of_week;
  day = day === "" || day === null || day === undefined ? null : Number(day);
  if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 7)) return { error: "Pick a day of the week." };

  // Weekly, or monthly on the 1st-4th or last (5) of that weekday.
  const recurrence = day === null ? "weekly" : body.recurrence === "monthly" ? "monthly" : "weekly";
  let week_of_month = null;
  if (recurrence === "monthly") {
    week_of_month = Number(body.week_of_month);
    if (!(Number.isInteger(week_of_month) && week_of_month >= 1 && week_of_month <= 5)) {
      return { error: "Pick which week of the month it's on." };
    }
  }

  const start_time = time(body.start_time);
  const end_time = time(body.end_time);
  if (start_time === undefined || end_time === undefined) return { error: "Times should look like 10:30." };
  if (start_time && end_time && end_time <= start_time) return { error: "The finish time should be after the start time." };

  return {
    value: {
      title,
      category: str(body.category, 40) || "Community",
      day_of_week: day,
      frequency: frequencyLabel(day, recurrence, week_of_month),
      recurrence,
      week_of_month,
      start_time,
      end_time,
      venue: str(body.venue, 40) || "Main hall",
      description: str(body.description, 1200),
      cost: str(body.cost, 80),
      contact_name: str(body.contact_name, 80),
      contact_info: str(body.contact_info, 160),
      is_published: body.is_published === false || body.is_published === 0 ? 0 : 1,
    },
  };
}

/* ------------------------------------------------------------------ auth */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "The admin area hasn't been set up yet (missing secrets)." }, 503);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare("DELETE FROM login_attempts WHERE attempted < ?").bind(now - LOCKOUT_WINDOW_SECS).run();
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (n >= MAX_FAILED_LOGINS) {
    return json({ error: "Too many attempts. Please wait 15 minutes and try again." }, 429);
  }

  let password = "";
  try {
    password = String((await request.json()).password || "");
  } catch { /* fall through as wrong password */ }

  if (!(await passwordMatches(password, env))) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, attempted) VALUES (?, ?)").bind(ip, now).run();
    return json({ error: "That password isn't right." }, 401);
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  const expires = now + SESSION_HOURS * 3600;
  const token = `${expires}.${await sign(`admin:${expires}`, env.SESSION_SECRET)}`;
  return json({ ok: true }, 200, {
    // No Domain attribute: the cookie stays on admin.bucklandvillage.com and is never sent to the public site.
    "Set-Cookie": `${COOKIE}=${token}; Path=/api; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict`,
  });
}

function logout() {
  return json({ ok: true }, 200, {
    "Set-Cookie": `${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [expStr, sig] = match[1].split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  const expected = await sign(`admin:${exp}`, env.SESSION_SECRET);
  return timingSafeEqual(sig, expected);
}

/** Compare via HMAC digests so the check takes the same time whatever the input. */
async function passwordMatches(candidate, env) {
  const [a, b] = await Promise.all([
    sign(`pw:${candidate}`, env.SESSION_SECRET),
    sign(`pw:${env.ADMIN_PASSWORD}`, env.SESSION_SECRET),
  ]);
  return timingSafeEqual(a, b);
}

async function sign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

/** Reject cross-site form posts: the Origin header, when sent, must match this site. */
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

/* --------------------------------------------------------------- helpers */

function withSecurityHeaders(res) {
  const r = new Response(res.body, res);
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!r.headers.has("Cache-Control")) r.headers.set("Cache-Control", "no-store");
  return r;
}
