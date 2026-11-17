-- Atualiza os links das normas do CBMPB (linha ('PB','links_normas')) conforme
-- o portal https://bravo.bombeiros.pb.gov.br/portal/normas-tecnicas/ em
-- 17/11/2026:
--   * hidrantes: o portal lista a norma como "NT 015/2025" (o arquivo ainda
--     se chama ...NT-15-2024...);
--   * isolamento_risco (medida nova): NT 020/2023 — Separação entre
--     Edificações (Isolamento de risco).
-- Não altera cálculos normativos. Após rodar, recarregue o FireUtils.

begin;
update public.normas_dados
set dados = jsonb_set(
              jsonb_set(dados, '{medidas,hidrantes}', $j$[
                { "titulo": "NT 15/2025", "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-15-2024-Hidrantes-e-mangotinhos.docx.pdf" }
              ]$j$::jsonb, true),
              '{medidas,isolamento_risco}', $j$[
                { "titulo": "NT 20/2023", "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2023/10/NT-20-CBMPB-Separacao-entre-Edificacoes-Isolamento-de-Risco-1.pdf" }
              ]$j$::jsonb, true),
    versao = versao + 1,
    atualizado_em = now()
where uf = 'PB' and sistema = 'links_normas';
commit;
