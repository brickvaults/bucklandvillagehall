-- Regular events shown on the What's On page.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'Community',   -- e.g. Fitness, Social, Children, Clubs, Arts
  day_of_week   INTEGER,                                -- 1 = Monday … 7 = Sunday; NULL = varies
  frequency     TEXT    NOT NULL DEFAULT 'Every week',  -- free text: "Every week", "Fortnightly", "1st Wednesday of the month"
  start_time    TEXT,                                   -- "HH:MM" (24h)
  end_time      TEXT,                                   -- "HH:MM" (24h)
  venue         TEXT    NOT NULL DEFAULT 'Main hall',   -- Main hall / Small hall / Garden / Whole hall
  description   TEXT    NOT NULL DEFAULT '',
  cost          TEXT    NOT NULL DEFAULT '',            -- e.g. "£5 per session", "Free"
  contact_name  TEXT    NOT NULL DEFAULT '',
  contact_info  TEXT    NOT NULL DEFAULT '',            -- phone, email or website, as the organiser wants it shown
  is_published  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_day ON events (is_published, day_of_week, start_time);

-- Failed admin logins, used to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip         TEXT NOT NULL,
  attempted  INTEGER NOT NULL  -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (ip, attempted);
