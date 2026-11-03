-- Teste grátis para usuários NOVOS: quem se cadastra ganha uma licença de teste
-- automaticamente. Quem já existe não é afetado.
--
-- A configuração (ligado, módulo, dias) fica em `licenca_teste_config` e é
-- editada pelo painel FireUtils.admin; desligar não exige nova migração.
-- Padrão: ligado, módulo PRO (libera tudo), 5 dias.
--
-- Validade: expira_em = hoje + dias (data do Brasil). Como o último dia é
-- inclusivo, quem se cadastra ganha pelo menos `dias` dias completos.
--
-- O trigger NUNCA pode impedir um cadastro: qualquer erro vira aviso no log e
-- o usuário é criado normalmente, só que sem o teste.
--
-- Idempotente: pode rodar de novo sem efeito.

create table if not exists public.licenca_teste_config (
  id            boolean     primary key default true check (id),
  ativo         boolean     not null default true,
  modulo        text        not null default 'pro' check (modulo in ('saidas', 'memorial', 'hidrantes', 'pro')),
  dias          integer     not null default 5 check (dias between 1 and 90),
  atualizado_em timestamptz not null default now()
);

insert into public.licenca_teste_config (id) values (true) on conflict do nothing;

comment on table public.licenca_teste_config is
  'Teste grátis concedido a cada novo usuário (trigger conceder_teste_novo_usuario). Uma linha só.';

alter table public.licenca_teste_config enable row level security;

drop policy if exists licenca_teste_config_admin_select on public.licenca_teste_config;
create policy licenca_teste_config_admin_select on public.licenca_teste_config
  for select to authenticated using (public.is_admin());

drop policy if exists licenca_teste_config_admin_update on public.licenca_teste_config;
create policy licenca_teste_config_admin_update on public.licenca_teste_config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.licenca_teste_config_toca()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists licenca_teste_config_toca on public.licenca_teste_config;
create trigger licenca_teste_config_toca before update on public.licenca_teste_config
  for each row execute function public.licenca_teste_config_toca();

-- Mudanças feitas por um admin entram na auditoria (a função é genérica:
-- usa o nome da tabela como alvo).
drop trigger if exists licenca_teste_config_auditoria on public.licenca_teste_config;
create trigger licenca_teste_config_auditoria
  after update on public.licenca_teste_config
  for each row execute function public.auditar_catalogo();

create or replace function public.conceder_teste_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c    public.licenca_teste_config;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  begin
    select * into c from public.licenca_teste_config where id;
    if found and c.ativo then
      insert into public.licencas (user_id, modulo, plano, situacao, inicio_em, expira_em)
      values (new.id, c.modulo, 'Teste de ' || c.dias || ' dias', 'teste', hoje, hoje + c.dias)
      on conflict (user_id, modulo) do nothing;
    end if;
  exception when others then
    raise warning 'conceder_teste_novo_usuario: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.conceder_teste_novo_usuario() from public;

drop trigger if exists conceder_teste_novo_usuario on auth.users;
create trigger conceder_teste_novo_usuario
  after insert on auth.users
  for each row execute function public.conceder_teste_novo_usuario();
