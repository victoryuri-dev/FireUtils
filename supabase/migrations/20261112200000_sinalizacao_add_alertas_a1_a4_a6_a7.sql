-- Acrescenta ao catalogo de sinalizacao (MA) as placas de alerta A1, A4, A6 e A7
-- (NBR 13434-2), que faltavam. Os pictogramas ficam no bundle do site
-- (src/assets/sinalizacao); aqui so o texto. Idempotente: nao duplica placa
-- cuja key ja exista. Executar no SQL Editor do Supabase e recarregar o site.

update public.normas_dados
set dados = jsonb_set(
      dados, '{tipos_placa}',
      (dados->'tipos_placa') || (
        select coalesce(jsonb_agg(n), '[]'::jsonb)
        from jsonb_array_elements($j$[
  {
    "key": "a1",
    "codigo": "A1",
    "categoria": "alerta",
    "label": "Alerta geral",
    "localInstalacao": "Toda vez que não houver símbolo específico de alerta; deve sempre estar acompanhado de mensagem escrita específica"
  },
  {
    "key": "a4",
    "codigo": "A4",
    "categoria": "alerta",
    "label": "Cuidado, risco de corrosão",
    "localInstalacao": "Próximo a locais onde houver presença de materiais corrosivos"
  },
  {
    "key": "a6",
    "codigo": "A6",
    "categoria": "alerta",
    "label": "Cuidado, risco de radiação",
    "localInstalacao": "Próximo a locais onde houver presença de materiais radioativos"
  },
  {
    "key": "a7",
    "codigo": "A7",
    "categoria": "alerta",
    "label": "Cuidado, risco de exposição a produtos tóxicos",
    "localInstalacao": "Próximo a locais onde houver presença de produtos tóxicos"
  }
]$j$::jsonb) n
        where not ((dados->'tipos_placa') @> jsonb_build_array(jsonb_build_object('key', n->>'key')))
      )
    ),
    versao = versao + 1,
    atualizado_em = now()
where uf = 'MA' and sistema = 'sinalizacao';
