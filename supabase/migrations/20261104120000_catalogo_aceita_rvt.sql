-- O catálogo passa a aceitar arquivos .rvt (projeto do Revit) além de .rfa
-- (família) em `revit-families`. A chave continua <pasta>/<nome>.<ext>; quem
-- consome o catálogo distingue pela extensão do `storage_key`.
--
-- Idempotente: pode rodar de novo sem efeito.

alter table public.catalogo_familias drop constraint if exists catalogo_familias_storage_key_check;
alter table public.catalogo_familias add constraint catalogo_familias_storage_key_check
  check (storage_key ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(rfa|rvt)$' and storage_key not like '%..%');
