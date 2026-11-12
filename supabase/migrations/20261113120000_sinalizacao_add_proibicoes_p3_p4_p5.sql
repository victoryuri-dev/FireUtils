-- Acrescenta ao catalogo de sinalizacao (MA) as placas de proibicao P3, P4 e P5
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
    "key": "p3",
    "codigo": "P3",
    "categoria": "proibicao",
    "label": "Proibido utilizar água para apagar o fogo",
    "localInstalacao": "Toda situação em que o uso de água for impróprio para extinguir o fogo"
  },
  {
    "key": "p4",
    "codigo": "P4",
    "categoria": "proibicao",
    "label": "Proibido utilizar elevador em caso de incêndio",
    "localInstalacao": "Nos locais de acesso aos elevadores comuns e monta-cargas"
  },
  {
    "key": "p5",
    "codigo": "P5",
    "categoria": "proibicao",
    "label": "Proibido obstruir este local",
    "localInstalacao": "Em locais sujeitos a depósito de mercadorias onde a obstrução possa apresentar perigo de acesso às saídas de emergência, rotas de fuga, equipamentos de combate a incêndio etc."
  }
]$j$::jsonb) n
        where not ((dados->'tipos_placa') @> jsonb_build_array(jsonb_build_object('key', n->>'key')))
      )
    ),
    versao = versao + 1,
    atualizado_em = now()
where uf = 'MA' and sistema = 'sinalizacao';
