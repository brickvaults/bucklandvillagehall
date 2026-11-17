/**
 * Gallery photos.
 *
 * Metadata lives in the D1 `photos` table; uploaded image files live in the R2
 * bucket bound as PHOTOS and are served at /photos/gallery/<uuid>.jpg (and
 * <uuid>-thumb.jpg). Photos that shipped with the site point at /img/… instead.
 *
 * The admin resizes every upload in the browser to a JPEG (max 1600px, plus a
 * ~600px thumbnail) before sending it, which also strips EXIF/GPS data. The
 * Worker only accepts JPEG files and checks the file signature itself.
 */

import { json } from "./util.js";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_THUMB_BYTES = 1.5 * 1024 * 1024;
const PHOTO_PATH = /^\/photos\/(gallery\/[0-9a-f-]{36}(?:-thumb)?\.jpg)$/;

// Albums are listed in the order of their earliest photo.
const ORDER = (publishedOnly) => `
  ORDER BY (SELECT MIN(p2.sort_order) FROM photos p2
             WHERE p2.album = photos.album ${publishedOnly ? "AND p2.is_published = 1" : ""}),
           sort_order, id`;

/* ------------------------------------------------------------- serving */

export function isPhotoPath(pathname) {
  return PHOTO_PATH.test(pathname);
}

export async function servePhoto(request, env, url) {
  const key = url.pathname.match(PHOTO_PATH)[1];
  const obj = await env.PHOTOS.get(key, { onlyIf: request.headers });
  if (obj === null) return null;
  const headers = new Headers({
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ETag: obj.httpEtag,
  });
  // onlyIf matched an If-None-Match: no body to send.
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : obj.body, { headers });
}

/* ---------------------------------------------------------------- read */

export async function listPublicPhotos(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, album, caption, src, thumb_src, width, height
       FROM photos WHERE is_published = 1 ${ORDER(true)}`
  ).all();
  return json({ photos: results }, 200, { "Cache-Control": "public, max-age=60" });
}

export async function listAllPhotos(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, album, caption, src, thumb_src, width, height, sort_order, is_published,
            r2_key IS NOT NULL AS uploaded
       FROM photos ${ORDER(false)}`
  ).all();
  return json({ photos: results }, 200, { "Cache-Control": "no-store" });
}

/* --------------------------------------------------------------- write */

export async function uploadPhoto(request, env) {
  const form = await readForm(request);
  if (form.error) return json({ error: form.error }, 400);
  const files = await readImages(form.data);
  if (files.error) return json({ error: files.error }, 400);
  const meta = readMeta(form.data, { requireAll: true });
  if (meta.error) return json({ error: meta.error }, 400);

  const keys = await storeImages(env, files);
  const { next } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM photos").first();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO photos (album, caption, src, thumb_src, r2_key, r2_thumb_key, width, height, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(meta.album, meta.caption, "/photos/" + keys.image, "/photos/" + keys.thumb,
           keys.image, keys.thumb, files.width, files.height, next).first();
    return json({ photo: row }, 201);
  } catch (err) {
    await env.PHOTOS.delete([keys.image, keys.thumb]);
    throw err;
  }
}

/** Swap the picture for a new one, keeping caption, album and position. */
export async function replacePhotoImage(request, env, id) {
  const existing = await env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "That photo no longer exists." }, 404);
  const form = await readForm(request);
  if (form.error) return json({ error: form.error }, 400);
  const files = await readImages(form.data);
  if (files.error) return json({ error: files.error }, 400);

  const keys = await storeImages(env, files);
  const row = await env.DB.prepare(
    `UPDATE photos SET src = ?, thumb_src = ?, r2_key = ?, r2_thumb_key = ?, width = ?, height = ?,
            updated_at = datetime('now')
      WHERE id = ? RETURNING *`
  ).bind("/photos/" + keys.image, "/photos/" + keys.thumb, keys.image, keys.thumb, files.width, files.height, id).first();
  await deleteObjects(env, existing);
  return json({ photo: row });
}

export async function updatePhoto(request, env, id) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
  const existing = await env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "That photo no longer exists." }, 404);

  const meta = readMeta(new Map(Object.entries({
    caption: body.caption ?? existing.caption,
    album: body.album ?? existing.album,
  })), { requireAll: true });
  if (meta.error) return json({ error: meta.error }, 400);
  const published = body.is_published === undefined ? existing.is_published : (body.is_published ? 1 : 0);

  // Moving to another album puts the photo at the end of it.
  let sort = existing.sort_order;
  if (meta.album !== existing.album) {
    sort = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM photos").first()).n;
  }
  const row = await env.DB.prepare(
    `UPDATE photos SET caption = ?, album = ?, is_published = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ? RETURNING *`
  ).bind(meta.caption, meta.album, published, sort, id).first();
  return json({ photo: row });
}

/** Move a photo one place earlier or later within its album. */
export async function movePhoto(request, env, id) {
  let direction;
  try { direction = (await request.json()).direction; } catch { /* handled below */ }
  if (direction !== "earlier" && direction !== "later") return json({ error: "Bad direction." }, 400);

  const p = await env.DB.prepare("SELECT id, album, sort_order FROM photos WHERE id = ?").bind(id).first();
  if (!p) return json({ error: "That photo no longer exists." }, 404);
  const neighbour = await env.DB.prepare(
    direction === "earlier"
      ? "SELECT id, sort_order FROM photos WHERE album = ? AND (sort_order < ? OR (sort_order = ? AND id < ?)) ORDER BY sort_order DESC, id DESC LIMIT 1"
      : "SELECT id, sort_order FROM photos WHERE album = ? AND (sort_order > ? OR (sort_order = ? AND id > ?)) ORDER BY sort_order, id LIMIT 1"
  ).bind(p.album, p.sort_order, p.sort_order, p.id).first();
  if (!neighbour) return json({ ok: true });

  // If they share a sort_order, nudge so the swap is visible.
  const [a, b] = neighbour.sort_order === p.sort_order
    ? [direction === "earlier" ? p.sort_order - 1 : p.sort_order + 1, p.sort_order]
    : [neighbour.sort_order, p.sort_order];
  await env.DB.batch([
    env.DB.prepare("UPDATE photos SET sort_order = ? WHERE id = ?").bind(a, p.id),
    env.DB.prepare("UPDATE photos SET sort_order = ? WHERE id = ?").bind(b, neighbour.id),
  ]);
  return json({ ok: true });
}

export async function deletePhoto(env, id) {
  const existing = await env.DB.prepare("DELETE FROM photos WHERE id = ? RETURNING *").bind(id).first();
  if (!existing) return json({ error: "That photo no longer exists." }, 404);
  await deleteObjects(env, existing);
  return json({ ok: true });
}

/* ------------------------------------------------------------- helpers */

async function readForm(request) {
  try {
    return { data: await request.formData() };
  } catch {
    return { error: "Expected a photo upload." };
  }
}

async function readImages(form) {
  const image = form.get("image");
  const thumb = form.get("thumb");
  if (!(image instanceof File) || !(thumb instanceof File)) return { error: "No photo was attached." };
  if (image.size > MAX_IMAGE_BYTES || thumb.size > MAX_THUMB_BYTES) return { error: "That photo is too large." };
  const [imageBuf, thumbBuf] = await Promise.all([image.arrayBuffer(), thumb.arrayBuffer()]);
  if (!isJpeg(imageBuf) || !isJpeg(thumbBuf)) return { error: "Photos must be JPEG images." };
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const ok = (n) => Number.isInteger(n) && n > 0 && n <= 6000;
  if (!ok(width) || !ok(height)) return { error: "Missing photo dimensions." };
  return { imageBuf, thumbBuf, width, height };
}

function readMeta(form, { requireAll }) {
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const caption = str(form.get("caption"), 200);
  const album = str(form.get("album"), 60);
  if (requireAll && !caption) return { error: "Please describe the photo. It's read out to people using screen readers." };
  if (requireAll && !album) return { error: "Please choose an album." };
  return { caption, album };
}

function isJpeg(buf) {
  const b = new Uint8Array(buf, 0, Math.min(3, buf.byteLength));
  return b.length === 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

async function storeImages(env, files) {
  const id = crypto.randomUUID();
  const keys = { image: `gallery/${id}.jpg`, thumb: `gallery/${id}-thumb.jpg` };
  const httpMetadata = { contentType: "image/jpeg" };
  await Promise.all([
    env.PHOTOS.put(keys.image, files.imageBuf, { httpMetadata }),
    env.PHOTOS.put(keys.thumb, files.thumbBuf, { httpMetadata }),
  ]);
  return keys;
}

async function deleteObjects(env, row) {
  const keys = [row.r2_key, row.r2_thumb_key].filter(Boolean);
  if (keys.length) await env.PHOTOS.delete(keys);
}
