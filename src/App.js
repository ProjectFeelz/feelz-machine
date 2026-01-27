-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Samples table
create table public.samples (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  artist text,
  bpm integer not null,
  key text not null,
  genre text,
  mood text,
  file_url text not null,
  thumbnail_url text,
  duration numeric,
  likes integer default 0,
  plays integer default 0,
  featured boolean default false,
  has_stems boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sample stems table (NEW!)
create table public.sample_stems (
  id uuid default uuid_generate_v4() primary key,
  sample_id uuid references public.samples(id) on delete cascade not null,
  name text not null,
  file_url text not null,
  order_index integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User likes tracking
create table public.sample_likes (
  id uuid default uuid_generate_v4() primary key,
  sample_id uuid references public.samples(id) on delete cascade,
  user_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(sample_id, user_id)
);

-- Indexes for performance
create index samples_bpm_idx on public.samples(bpm);
create index samples_key_idx on public.samples(key);
create index samples_genre_idx on public.samples(genre);
create index samples_mood_idx on public.samples(mood);
create index samples_featured_idx on public.samples(featured);
create index samples_likes_idx on public.samples(likes desc);
create index sample_stems_sample_id_idx on public.sample_stems(sample_id);
create index sample_stems_order_idx on public.sample_stems(order_index);

-- Enable Row Level Security
alter table public.samples enable row level security;
alter table public.sample_stems enable row level security;
alter table public.sample_likes enable row level security;

-- Public read access for samples
create policy "Public samples are viewable by everyone"
  on public.samples for select
  using (true);

-- Public read access for stems
create policy "Public stems are viewable by everyone"
  on public.sample_stems for select
  using (true);

-- Public read access for likes
create policy "Sample likes are viewable by everyone"
  on public.sample_likes for select
  using (true);
```

---

## New Features Added:

✅ **Piano keyboard** - Visual 2-octave keyboard  
✅ **Computer keyboard mapping** - A-; keys = notes  
✅ **MIDI controller support** - Plug in hardware MIDI keyboard  
✅ **Polyphonic playback** - Play multiple notes at once  
✅ **Pitch shifting per key** - Each key plays at different pitch  
✅ **Octave shifting** - Z/X keys or buttons to change octave range  
✅ **Stems support** - Individual track controls (volume, mute, solo)  
✅ **Visual feedback** - Keys light up when pressed  
✅ **Velocity sensitivity** - MIDI keyboards send velocity data  

---

## File Structure for Stems:
```
feelz-samples/
├── audio/
│   ├── lofi-drums/              ← Folder per sample
│   │   ├── full-mix.wav         ← Main sample
│   │   ├── kick.wav             ← Stem 1
│   │   ├── snare.wav            ← Stem 2
│   │   └── hi-hats.wav          ← Stem 3
│   └── bass-groove/
│       ├── full-mix.wav
│       ├── bass.wav
│       └── sub-bass.wav
└── thumbnails/
    ├── lofi-drums.jpg
    └── bass-groove.jpg