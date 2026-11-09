-- Extensão aditiva do esquema de tarefas já existente no projeto Supabase.
-- A tabela public.tasks já tem RLS e políticas por auth.uid(); esta coluna
-- acrescenta classificação pessoal sem substituir tabelas ou políticas.
alter table public.tasks
  add column if not exists category text not null default 'Entrada';

create index if not exists tasks_user_category_idx
  on public.tasks (user_id, category);
