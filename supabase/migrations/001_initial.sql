-- Enable realtime for relevant tables
-- Run: supabase db push

create extension if not exists "uuid-ossp";

-- ─── ROOMS ────────────────────────────────────────────────────────────────────
create table rooms (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,           -- 6-char join code
  host_id     text not null,                  -- Spotify user ID
  status      text not null default 'lobby'   -- lobby | shield_pick | playing | finished
                check (status in ('lobby','shield_pick','playing','finished')),
  total_rounds int not null default 7,
  current_round int not null default 0,
  created_at  timestamptz default now()
);

-- ─── PLAYERS ──────────────────────────────────────────────────────────────────
create table players (
  id              uuid primary key default uuid_generate_v4(),
  room_id         uuid references rooms(id) on delete cascade,
  spotify_id      text not null,
  display_name    text not null,
  avatar_url      text,
  score           int not null default 0,
  shield_track_id text,                       -- null until shield_pick phase
  shield_used     boolean not null default false,
  is_connected    boolean not null default true,
  joined_at       timestamptz default now(),
  unique (room_id, spotify_id)
);

-- ─── TRACKS ───────────────────────────────────────────────────────────────────
-- Cached snapshot of each player's library for the session
create table tracks (
  id              uuid primary key default uuid_generate_v4(),
  room_id         uuid references rooms(id) on delete cascade,
  player_id       uuid references players(id) on delete cascade,
  spotify_track_id text not null,
  title           text not null,
  artist          text not null,
  album           text,
  genre           text[],                     -- from artist data
  release_year    int,
  preview_url     text,                       -- Spotify 30s preview
  start_offset_ms int not null default 0,     -- where to start the clip
  unique (room_id, spotify_track_id)
);

-- ─── ROUNDS ───────────────────────────────────────────────────────────────────
create table rounds (
  id              uuid primary key default uuid_generate_v4(),
  room_id         uuid references rooms(id) on delete cascade,
  round_number    int not null,
  track_id        uuid references tracks(id),
  owner_id        uuid references players(id),-- who owns the track
  is_finale       boolean not null default false,
  status          text not null default 'playing'
                  check (status in ('playing','revealing','done')),
  decoy_ids       uuid[],                     -- 3 track IDs for wrong song options
  started_at      timestamptz default now(),
  revealed_at     timestamptz,
  unique (room_id, round_number)
);

-- ─── GUESSES ──────────────────────────────────────────────────────────────────
create table guesses (
  id              uuid primary key default uuid_generate_v4(),
  round_id        uuid references rounds(id) on delete cascade,
  player_id       uuid references players(id) on delete cascade,
  guessed_owner_id uuid references players(id),  -- who they think owns it
  guessed_track_id uuid references tracks(id),   -- which track they picked
  is_force_locked  boolean not null default false,-- host forced lock
  locked_at       timestamptz default now(),
  unique (round_id, player_id)
);

-- ─── ROOM EVENTS (broadcast log) ──────────────────────────────────────────────
-- Used by host control actions; Realtime broadcast handles live events
create table room_events (
  id          uuid primary key default uuid_generate_v4(),
  room_id     uuid references rooms(id) on delete cascade,
  type        text not null,  -- 'replay' | 'skip_player' | 'shield_notice'
  payload     jsonb,
  created_at  timestamptz default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table rooms    enable row level security;
alter table players  enable row level security;
alter table tracks   enable row level security;
alter table rounds   enable row level security;
alter table guesses  enable row level security;
alter table room_events enable row level security;

-- All reads are open for room participants (enforced app-side via room code)
-- Writes go through API routes (service role key), not direct client writes

create policy "rooms_read"   on rooms    for select using (true);
create policy "players_read" on players  for select using (true);
create policy "tracks_read"  on tracks   for select using (true);
create policy "rounds_read"  on rounds   for select using (true);
create policy "guesses_read" on guesses  for select using (true);
create policy "events_read"  on room_events for select using (true);

-- ─── REALTIME ─────────────────────────────────────────────────────────────────
-- Enable realtime publication for these tables
-- In Supabase dashboard: Database → Replication → add tables below
-- Or via CLI: supabase db push will handle it if supabase/config.toml is set

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
create index on players (room_id);
create index on tracks  (room_id);
create index on rounds  (room_id);
create index on guesses (round_id);
create index on room_events (room_id);
