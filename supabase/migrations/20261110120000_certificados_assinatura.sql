-- Certificados digitais A1 (.pfx/.p12) salvos na conta, para a ferramenta de
-- assinaturas (rota /assinaturas).
--
-- O que é guardado: o ARQUIVO .pfx exatamente como a pessoa o enviou, ainda
-- cifrado com a senha dele (a proteção do próprio PKCS#12), mais alguns dados
-- públicos para listar (titular, emissor, validade). A SENHA NUNCA É GUARDADA:
-- quem assina digita a senha a cada vez, e o arquivo só é aberto no navegador.
--
-- Regras:
--   • cada pessoa só enxerga, cria e apaga os PRÓPRIOS certificados (RLS);
--   • criar exige licença do módulo 'assinaturas' (ou PRO) — política restritiva,
--     como em projetos; ler e apagar continuam liberados (os dados são da pessoa);
--   • no máximo 10 certificados por conta e sem repetir o mesmo certificado
--     (impressão digital única por conta);
--   • não há UPDATE: para trocar um certificado, apague e envie de novo.
--
-- Idempotente: pode rodar de novo sem efeito.

create table if not exists public.certificados_assinatura (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text        not null check (char_length(nome) between 1 and 80),
  titular       text        not null check (char_length(titular) between 1 and 300),
  emissor       text        not null default '' check (char_length(emissor) <= 300),
  valido_de     date,
  valido_ate    date        not null,
  icp_brasil    boolean     not null default false,
  autoassinado  boolean     not null default false,
  -- SHA-256 (hex) do certificado, para não salvar o mesmo duas vezes.
  impressao     text        not null check (char_length(impressao) = 64),
  -- O .pfx em base64 (cifrado pela senha do próprio arquivo). Limite: ~150 KB.
  pfx_base64    text        not null check (char_length(pfx_base64) between 1 and 200000),
  criado_em     timestamptz not null default now(),
  unique (user_id, impressao)
);

comment on table public.certificados_assinatura is
  'Certificados A1 (.pfx cifrado pela senha do arquivo) salvos pela conta para assinar PDFs. A senha nunca é guardada.';
comment on column public.certificados_assinatura.pfx_base64 is
  'Arquivo .pfx em base64, ainda cifrado com a senha dele. Não selecione esta coluna ao listar.';

create index if not exists certificados_assinatura_user_idx
  on public.certificados_assinatura (user_id, criado_em);

alter table public.certificados_assinatura enable row level security;

drop policy if exists certificados_assinatura_select_proprio on public.certificados_assinatura;
create policy certificados_assinatura_select_proprio
  on public.certificados_assinatura for select to authenticated
  using (user_id = auth.uid());

drop policy if exists certificados_assinatura_insert_proprio on public.certificados_assinatura;
create policy certificados_assinatura_insert_proprio
  on public.certificados_assinatura for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists certificados_assinatura_delete_proprio on public.certificados_assinatura;
create policy certificados_assinatura_delete_proprio
  on public.certificados_assinatura for delete to authenticated
  using (user_id = auth.uid());

-- Criar exige licença (soma-se, com AND, à política acima).
drop policy if exists certificados_assinatura_insert_exige_licenca on public.certificados_assinatura;
create policy certificados_assinatura_insert_exige_licenca
  on public.certificados_assinatura as restrictive for insert to authenticated
  with check (public.tem_licenca('assinaturas'));

-- Limite por conta, com mensagem clara (a interface mostra o texto do erro).
create or replace function public.certificados_assinatura_limite()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.certificados_assinatura c where c.user_id = new.user_id) >= 10 then
    raise exception 'Limite de 10 certificados por conta. Remova um para adicionar outro.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists certificados_assinatura_limite on public.certificados_assinatura;
create trigger certificados_assinatura_limite
  before insert on public.certificados_assinatura
  for each row execute function public.certificados_assinatura_limite();

-- Só o necessário para a interface: sem UPDATE, e sem acesso para quem não está logado.
revoke all on public.certificados_assinatura from anon, public;
grant select, insert, delete on public.certificados_assinatura to authenticated;
