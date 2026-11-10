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
  add column if not exists follow_up_at timestamptz;

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
