-- Saídas de emergência da PB: link para a NT 12/2025 (versão atualizada), a
-- mesma que o FireUtils usa nos cálculos. Informado pelo usuário: a NT
-- 12/2015 ainda aparece no portal, mas a vigente é a 2025.
-- Após rodar, recarregue o FireUtils.

begin;
update public.normas_dados
set dados = jsonb_set(dados, '{medidas,saida_emergencia}', $j$[
              { "titulo": "NT 12/2025", "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-12-2025-Saida-de-emergencia-Atualizada.pdf" }
            ]$j$::jsonb, true),
    versao = versao + 1,
    atualizado_em = now()
where uf = 'PB' and sistema = 'links_normas';
commit;
