-- Cria a linha de `perfis` no cadastro, a partir dos dados enviados pelo site
-- (conselho + número do registro) ou pelo provedor de login (nome do Google).
-- Executar no SQL Editor do Supabase.
--
-- Precisa ser trigger: com a confirmação de e-mail ligada, o usuário não tem
-- sessão logo após o cadastro, então o navegador não consegue gravar em
-- `perfis` (RLS exige auth.uid()). Os dados viajam em user_metadata
-- (supabase.auth.signUp options.data) e o banco os copia para o perfil.
-- As políticas de RLS e a tabela continuam como na migração original.

create or replace function public.criar_perfil_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  tipo   text  := upper(coalesce(meta->>'conselho_tipo', ''));
  numero text  := btrim(coalesce(meta->>'conselho_numero', ''));
  nome   text  := btrim(coalesce(meta->>'full_name', meta->>'name', ''));
begin
  if tipo not in ('CREA', 'CAU') then tipo := ''; end if;

  begin
    insert into public.perfis (user_id, nome, responsavel_tecnico)
    values (
      new.id,
      left(nome, 120),
      jsonb_build_object('rtConselhoTipo', tipo, 'rtConselho', left(numero, 40))
    )
    on conflict (user_id) do nothing;
  exception when others then
    -- O perfil é complemento: nunca pode impedir a criação da conta. Sem a
    -- linha, o site trata como perfil vazio e o usuário preenche depois.
    raise warning 'criar_perfil_no_cadastro falhou para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists criar_perfil_no_cadastro on auth.users;
create trigger criar_perfil_no_cadastro
  after insert on auth.users
  for each row execute function public.criar_perfil_no_cadastro();
