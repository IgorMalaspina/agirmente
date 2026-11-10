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
