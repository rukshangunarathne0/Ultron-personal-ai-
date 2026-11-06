-- RUK-AI // ULTRON PERSONAL AI — SUPABASE PERSISTENT MEMORY SCHEMA
-- Run in Supabase SQL Editor if deploying RUK-AI to cloud storage

create table if not exists public.ruk_memories (
  id text primary key,
  type text not null check (type in ('fact', 'preference', 'project', 'decision', 'person')),
  text text not null,
  is_profile boolean not null default false,
  source_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruk_tasks (
  id text primary key,
  title text not null,
  status text not null default 'active' check (status in ('queued', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.ruk_messages (
  id text primary key,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  via_voice boolean default false,
  emotion text,
  memory_update jsonb,
  timestamp timestamptz not null default now()
);
