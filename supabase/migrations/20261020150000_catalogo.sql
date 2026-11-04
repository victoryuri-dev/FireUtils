-- Catálogo da biblioteca de famílias (painel FireUtils.admin).
--
-- As tabelas são o RASCUNHO de trabalho. O que a dockpane lê continua sendo o
-- `plugin-assets/catalog.json` (público), gerado a partir daqui pela Edge
-- Function `admin-catalogo`, que só publica se todo arquivo citado existir nos
-- buckets (nada de item fantasma).
--
-- Arquivos: .rfa em `revit-families` (privado); ícones e thumbnails em
-- `plugin-assets` (público), sob `icons/`, `category-icons/` e `thumbnails/`. O catálogo guarda
-- só as CHAVES; o painel sobe os arquivos direto do navegador (políticas de
-- admin abaixo) e a function confere tudo antes de publicar.
--
-- Idempotente: pode rodar de novo sem efeito.

create table if not exists public.catalogo_categorias (
  id            text        primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome          text        not null check (length(btrim(nome)) between 1 and 120),
  icon_key      text        check (icon_key ~ '^(icons|category-icons)/[A-Za-z0-9_.-]+$' and icon_key not like '%..%'),
  ordem         integer     not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists catalogo_categorias_nome_uq
  on public.catalogo_categorias (lower(btrim(nome)));

create table if not exists public.catalogo_familias (
  id            text        primary key check (id ~ '^[a-z0-9_-]+$'),
  nome          text        not null check (length(btrim(nome)) between 1 and 200),
  category_id   text        not null references public.catalogo_categorias(id)
                            on update cascade on delete restrict,
  thumbnail_key text        check (thumbnail_key ~ '^thumbnails/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$' and thumbnail_key not like '%..%'),
  storage_key   text        not null unique
                            check (storage_key ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(rfa|rvt)$' and storage_key not like '%..%'),
  size_bytes    bigint      not null check (size_bytes >= 0),
  sha256        text        not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ordem         integer     not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Duplicata por nome (sem diferenciar maiúsculas) é rejeitada, como no plugin.
create unique index if not exists catalogo_familias_nome_uq
  on public.catalogo_familias (lower(btrim(nome)));
create index if not exists catalogo_familias_categoria_idx
  on public.catalogo_familias (category_id, ordem);

-- Uma linha só: ícone da categoria agregada "Todas" e dados da última publicação.
create table if not exists public.catalogo_config (
  id              boolean     primary key default true check (id),
  todas_icon_key  text        check (todas_icon_key ~ '^(icons|category-icons)/[A-Za-z0-9_.-]+$' and todas_icon_key not like '%..%'),
  publicado_em    timestamptz,
  publicado_por   uuid        references auth.users(id) on delete set null
);
insert into public.catalogo_config (id) values (true) on conflict do nothing;

create or replace function public.catalogo_toca()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists catalogo_categorias_toca on public.catalogo_categorias;
create trigger catalogo_categorias_toca before update on public.catalogo_categorias
  for each row execute function public.catalogo_toca();
drop trigger if exists catalogo_familias_toca on public.catalogo_familias;
create trigger catalogo_familias_toca before update on public.catalogo_familias
  for each row execute function public.catalogo_toca();

-- RLS: só admin lê e escreve. Os clientes leem o catalog.json publicado.
alter table public.catalogo_categorias enable row level security;
alter table public.catalogo_familias   enable row level security;
alter table public.catalogo_config     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['catalogo_categorias', 'catalogo_familias', 'catalogo_config'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
  end loop;
end $$;

-- Excluir: categoria e família (a config nunca é apagada).
drop policy if exists catalogo_categorias_admin_delete on public.catalogo_categorias;
create policy catalogo_categorias_admin_delete on public.catalogo_categorias
  for delete to authenticated using (public.is_admin());
drop policy if exists catalogo_familias_admin_delete on public.catalogo_familias;
create policy catalogo_familias_admin_delete on public.catalogo_familias
  for delete to authenticated using (public.is_admin());

-- Auditoria das mudanças feitas por um admin logado. A function admin-catalogo
-- (service role) registra as suas próprias ações.
create or replace function public.auditar_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.is_admin() then
    insert into public.admin_auditoria (admin_id, admin_email, acao, alvo_tipo, alvo_id, antes, depois)
    values (
      auth.uid(),
      (select u.email::text from auth.users u where u.id = auth.uid()),
      tg_table_name || '.' || lower(tg_op),
      tg_table_name,
      coalesce(new.id, old.id)::text,
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.auditar_catalogo() from public;

drop trigger if exists catalogo_categorias_auditoria on public.catalogo_categorias;
create trigger catalogo_categorias_auditoria
  after insert or update or delete on public.catalogo_categorias
  for each row execute function public.auditar_catalogo();
drop trigger if exists catalogo_familias_auditoria on public.catalogo_familias;
create trigger catalogo_familias_auditoria
  after insert or update or delete on public.catalogo_familias
  for each row execute function public.auditar_catalogo();

-- Storage. Os buckets já existem (criados antes, pelo painel do Supabase);
-- o insert só garante o caso de um ambiente novo.
insert into storage.buckets (id, name, public) values ('revit-families', 'revit-families', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('plugin-assets', 'plugin-assets', true)
on conflict (id) do nothing;

-- O admin gerencia os .rfa e, em plugin-assets, só icons/, category-icons/ e thumbnails/ (o
-- catalog.json é escrito apenas pela Edge Function). A leitura para clientes
-- licenciados de revit-families e a leitura pública de plugin-assets não são
-- tocadas aqui.
drop policy if exists catalogo_admin_select on storage.objects;
create policy catalogo_admin_select on storage.objects for select to authenticated
  using (public.is_admin() and (
    bucket_id = 'revit-families'
    or (bucket_id = 'plugin-assets' and (name like 'icons/%' or name like 'category-icons/%' or name like 'thumbnails/%'))
  ));

drop policy if exists catalogo_admin_insert on storage.objects;
create policy catalogo_admin_insert on storage.objects for insert to authenticated
  with check (public.is_admin() and (
    bucket_id = 'revit-families'
    or (bucket_id = 'plugin-assets' and (name like 'icons/%' or name like 'category-icons/%' or name like 'thumbnails/%'))
  ));

drop policy if exists catalogo_admin_update on storage.objects;
create policy catalogo_admin_update on storage.objects for update to authenticated
  using (public.is_admin() and (
    bucket_id = 'revit-families'
    or (bucket_id = 'plugin-assets' and (name like 'icons/%' or name like 'category-icons/%' or name like 'thumbnails/%'))
  ))
  with check (public.is_admin() and (
    bucket_id = 'revit-families'
    or (bucket_id = 'plugin-assets' and (name like 'icons/%' or name like 'category-icons/%' or name like 'thumbnails/%'))
  ));

drop policy if exists catalogo_admin_delete on storage.objects;
create policy catalogo_admin_delete on storage.objects for delete to authenticated
  using (public.is_admin() and (
    bucket_id = 'revit-families'
    or (bucket_id = 'plugin-assets' and (name like 'icons/%' or name like 'category-icons/%' or name like 'thumbnails/%'))
  ));
