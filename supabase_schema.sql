-- ============================================================
-- Esquema para la app de seguimiento de clientas/clientes
-- Pega este script completo en Supabase → SQL Editor → Run
-- ============================================================

-- Extensión necesaria para generar IDs (normalmente ya está activa)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabla: clients (fichas de clientas/clientes)
-- ------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid(),
  name text not null,
  age int,
  objectives text,
  pathologies text,
  training_type text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Tabla: exercises (ejercicios por clienta y categoría)
-- ------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  trainer_id uuid not null default auth.uid(),
  category text not null check (category in ('tren_inferior','espalda','pectoral_hombros','brazos','funcional')),
  name text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists exercises_client_id_idx on public.exercises(client_id);

-- ------------------------------------------------------------
-- Tabla: exercise_logs (registros de peso / reps / RIR por sesión)
-- ------------------------------------------------------------
create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  trainer_id uuid not null default auth.uid(),
  log_date date not null default current_date,
  weight_kg numeric,
  reps int,
  rir numeric,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_exercise_id_idx on public.exercise_logs(exercise_id);

-- ------------------------------------------------------------
-- updated_at automático en clients
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: cada entrenador solo ve sus propios datos
-- ------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_logs enable row level security;

drop policy if exists "clients_owner_all" on public.clients;
create policy "clients_owner_all" on public.clients
  for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

drop policy if exists "exercises_owner_all" on public.exercises;
create policy "exercises_owner_all" on public.exercises
  for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

drop policy if exists "exercise_logs_owner_all" on public.exercise_logs;
create policy "exercise_logs_owner_all" on public.exercise_logs
  for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

-- ============================================================
-- Fin del script. Con esto ya tienes la base de datos lista.
-- ============================================================
