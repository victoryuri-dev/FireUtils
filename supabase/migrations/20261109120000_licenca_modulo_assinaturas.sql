-- Novo módulo licenciável: 'assinaturas' (ferramenta web de assinatura de PDFs
-- em lote, rota /assinaturas). A licença PRO continua liberando todos os
-- módulos, inclusive este (ver temAcesso em src/hooks/useLicencas.js).
--
-- Só amplia as listas permitidas nas duas tabelas que restringem o módulo:
--   • licencas              — licença de cada conta
--   • licenca_teste_config  — módulo concedido no teste grátis de novos usuários
--
-- Idempotente: pode rodar de novo sem efeito.

alter table public.licencas drop constraint if exists licencas_modulo_check;
alter table public.licencas
  add constraint licencas_modulo_check
  check (modulo in ('saidas', 'memorial', 'hidrantes', 'assinaturas', 'pro'));

alter table public.licenca_teste_config drop constraint if exists licenca_teste_config_modulo_check;
alter table public.licenca_teste_config
  add constraint licenca_teste_config_modulo_check
  check (modulo in ('saidas', 'memorial', 'hidrantes', 'assinaturas', 'pro'));

comment on table public.licencas is
  'Licença de cada conta por módulo (saidas, memorial, hidrantes, assinaturas, pro). Lida pela aba Ferramentas do perfil e pelo bloqueio de acesso.';
