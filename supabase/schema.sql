-- Extensão aditiva do esquema de tarefas já existente no projeto Supabase.
-- A tabela public.tasks já tem RLS e políticas por auth.uid(); esta coluna
-- acrescenta classificação pessoal sem substituir tabelas ou políticas.
alter table public.tasks
  add column if not exists category text not null default 'Entrada';

create index if not exists tasks_user_category_idx
  on public.tasks (user_id, category);

-- Campos aditivos para detalhes, etiquetas, responsáveis e retornos de cobrança.
-- O histórico usa a tabela public.task_events já protegida por RLS.
alter table public.tasks
  add column if not exists task_type text not null default 'tarefa',
  add column if not exists assignee text,
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists tag_colors jsonb not null default '{}'::jsonb,
  add column if not exists follow_up_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_tag_colors_object_check') then
    alter table public.tasks add constraint tasks_tag_colors_object_check
      check (jsonb_typeof(tag_colors) = 'object');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_task_type_check'
  ) then
    alter table public.tasks
      add constraint tasks_task_type_check
      check (task_type in ('tarefa', 'cobranca'));
  end if;
end;
$$;

-- Planejamento flexível: etapas, foco do dia, duração, lembretes e recorrência.
alter table public.tasks
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists estimated_minutes integer,
  add column if not exists focus_date date,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists recurrence text not null default 'nenhuma';

update public.tasks
set steps = jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'title', next_step,
  'done', false
))
where next_step is not null
  and next_step <> ''
  and steps = '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_steps_array_check') then
    alter table public.tasks add constraint tasks_steps_array_check
      check (jsonb_typeof(steps) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_estimated_minutes_check') then
    alter table public.tasks add constraint tasks_estimated_minutes_check
      check (estimated_minutes is null or estimated_minutes between 1 and 1440);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_recurrence_check') then
    alter table public.tasks add constraint tasks_recurrence_check
      check (recurrence in ('nenhuma', 'diaria', 'dias_uteis', 'semanal', 'mensal'));
  end if;
end;
$$;

create index if not exists tasks_user_focus_date_idx
  on public.tasks (user_id, focus_date)
  where focus_date is not null;

create index if not exists tasks_user_reminder_at_idx
  on public.tasks (user_id, reminder_at)
  where reminder_at is not null;

-- Registro de hidratação com leitura e inserção limitadas ao usuário autenticado.
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  drank_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.water_logs enable row level security;
grant select, insert, delete on public.water_logs to authenticated;

drop policy if exists "Users read their own water logs" on public.water_logs;
create policy "Users read their own water logs"
  on public.water_logs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own water logs" on public.water_logs;
create policy "Users add their own water logs"
  on public.water_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own water logs" on public.water_logs;
create policy "Users delete their own water logs"
  on public.water_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists water_logs_user_drank_at_idx
  on public.water_logs (user_id, drank_at desc);
