-- Gallery photos, managed from the admin.
-- Photos shipped with the site (public/img/…) have no r2_key; uploads live in the R2 bucket.
CREATE TABLE IF NOT EXISTS photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  album         TEXT    NOT NULL,
  caption       TEXT    NOT NULL DEFAULT '',   -- also used as the image's alt text
  src           TEXT    NOT NULL,              -- full-size URL
  thumb_src     TEXT    NOT NULL,              -- grid-size URL
  r2_key        TEXT,                          -- set for uploaded photos
  r2_thumb_key  TEXT,
  width         INTEGER,
  height        INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_published  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_order ON photos (is_published, sort_order);

-- The photos carried over from the old site.
INSERT INTO photos (album, caption, src, thumb_src, width, height, sort_order) VALUES
  ('Wedding reception', 'The main hall laid out for a wedding reception, with long tables, flowers and candles', '/img/hall/HallDecked3_2.jpeg', '/img/hall/HallDecked3_2.jpeg', 1600, 1172, 10),
  ('Wedding reception', 'The main hall with draped ceiling, fairy lights and a mirror ball, set for a wedding breakfast', '/img/hall/HallDecked14.jpeg', '/img/hall/HallDecked14.jpeg', 1600, 1200, 20),
  ('Wedding reception', 'Looking down the hall towards the stage, draped in white for a wedding', '/img/hall/HallDecked6.jpeg', '/img/hall/HallDecked6.jpeg', 1200, 1600, 30),
  ('Wedding reception', 'Long tables dressed in white beneath draped ceiling fabric', '/img/hall/HallDecked13.jpeg', '/img/hall/HallDecked13.jpeg', 1600, 1200, 40),
  ('Wedding reception', 'The top table with white roses, and the wedding cake behind', '/img/hall/HallDecked4_2.jpeg', '/img/hall/HallDecked4_2.jpeg', 1200, 1449, 50),
  ('Wedding reception', 'Rows of tables with flowers and wine, looking towards the arched windows', '/img/hall/HallDecked16.jpeg', '/img/hall/HallDecked16.jpeg', 1600, 1200, 60),
  ('Wedding reception', 'A long table with a log-slice centrepiece and greenery', '/img/hall/HallDecked15.jpeg', '/img/hall/HallDecked15.jpeg', 1200, 1600, 70),
  ('Wedding reception', 'Tables with white cloths and flower centrepieces running the length of the hall', '/img/hall/HallDecked2.jpeg', '/img/hall/HallDecked2.jpeg', 1200, 1600, 80),
  ('Wedding reception', 'A place setting with napkins, glasses and a flower centrepiece', '/img/hall/HallDecked20-rotated.jpeg', '/img/hall/HallDecked20-rotated.jpeg', 480, 640, 90),
  ('Wedding reception', 'The servery lined with glasses ready for the reception', '/img/hall/HallDecked12.jpeg', '/img/hall/HallDecked12.jpeg', 1200, 1600, 100),
  ('Wedding reception', 'A side room set up as a bar, with poser tables, a sofa and bunting', '/img/hall/HallDecked11.jpeg', '/img/hall/HallDecked11.jpeg', 1600, 1200, 110),
  ('Wedding reception', 'The hall''s arched front door standing open, with bunting above', '/img/hall/HallDecked17.jpeg', '/img/hall/HallDecked17.jpeg', 1200, 1600, 120),
  ('Wedding reception', 'The front of the hall decorated with bunting and festoon lights', '/img/hall/HallDecked18.jpeg', '/img/hall/HallDecked18.jpeg', 640, 480, 130),
  ('Wedding reception', 'The hall and war memorial at dusk, decorated with bunting', '/img/hall/HallDecked23.jpeg', '/img/hall/HallDecked23.jpeg', 640, 480, 140),
  ('The hall, garden & village', 'The front of Buckland Memorial Hall, with the village war memorial', '/img/hall/front.jpg', '/img/hall/front.jpg', 1600, 1066, 150),
  ('The hall, garden & village', 'The empty main hall, with wooden floor and stage', '/img/hall/Inside_empty.jpg', '/img/hall/Inside_empty.jpg', 1600, 1066, 160),
  ('The hall, garden & village', 'The garden behind the hall, with picnic benches and lawn', '/img/gallery/Garden-BBQ.jpg', '/img/gallery/Garden-BBQ.jpg', 1200, 788, 170),
  ('The hall, garden & village', 'Villagers gathered on the lawn behind the hall', '/img/gallery/Garden-visitors.jpg', '/img/gallery/Garden-visitors.jpg', 1200, 800, 180),
  ('The hall, garden & village', 'The hall set up with tea, cakes and tables for a garden opening day', '/img/gallery/Garden-opening-hall-set-up.jpg', '/img/gallery/Garden-opening-hall-set-up.jpg', 640, 480, 190),
  ('The hall, garden & village', 'Visitors enjoying tea and cake in the hall on a garden opening day', '/img/gallery/Garden-opening-visitors.jpg', '/img/gallery/Garden-opening-visitors.jpg', 1200, 800, 200),
  ('The hall, garden & village', 'Visitors chatting over tea on a garden opening day', '/img/gallery/Garden-opening-visitors-2.jpg', '/img/gallery/Garden-opening-visitors-2.jpg', 1200, 800, 210),
  ('The hall, garden & village', 'Villagers at a Jubilee party outside the hall', '/img/gallery/Jubilee.jpg', '/img/gallery/Jubilee.jpg', 1200, 900, 220),
  ('The hall, garden & village', 'A Christmas tree lit up outside the hall', '/img/gallery/IMG_3568.jpg', '/img/gallery/IMG_3568.jpg', 768, 1024, 230),
  ('The hall, garden & village', 'A mosaic panel celebrating Buckland School, dated 2007', '/img/gallery/IMG_2325.jpg', '/img/gallery/IMG_2325.jpg', 768, 1024, 240),
  ('The hall, garden & village', 'A mosaic panel celebrating Buckland School, dated 1857', '/img/gallery/IMG_2326.jpg', '/img/gallery/IMG_2326.jpg', 768, 1024, 250),
  ('The hall, garden & village', 'A pond surrounded by trees in Buckland', '/img/gallery/IMG_3937.jpg', '/img/gallery/IMG_3937.jpg', 768, 1024, 260),
  ('The hall, garden & village', 'A stone and flint archway in the village', '/img/gallery/IMG_3944.jpg', '/img/gallery/IMG_3944.jpg', 768, 1024, 270),
  ('The hall, garden & village', 'A commemorative plaque on a wooden fence', '/img/gallery/IMG_5774.jpg', '/img/gallery/IMG_5774.jpg', 768, 1024, 280),
  ('The hall, garden & village', 'A thatched cottage roof in the village', '/img/gallery/Thatchedroof.jpg', '/img/gallery/Thatchedroof.jpg', 1200, 642, 290),
  ('The hall, garden & village', 'An old iron hook set into a stone wall', '/img/gallery/Wallhook.jpg', '/img/gallery/Wallhook.jpg', 1024, 1024, 300),
  ('The hall, garden & village', 'Pots of flowers outside a red front door in the village', '/img/gallery/streetflowers.jpg', '/img/gallery/streetflowers.jpg', 1024, 1024, 310);
