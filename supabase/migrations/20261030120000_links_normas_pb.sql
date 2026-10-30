-- Links das normas técnicas do CBMPB (Paraíba) por medida. Executar no SQL Editor do Supabase.
-- Mesmo formato do MA (migração 20261012200000_links_normas_por_estado.sql): usa
-- public.normas_dados (uf, sistema 'links_normas'); leitura pública já permitida.
-- Fonte: https://bravo.bombeiros.pb.gov.br/portal/normas-tecnicas/ — só normas em
-- vigor (as da seção "Revogadas" ficaram de fora). Não altera cálculos normativos.
-- Medidas sem NT própria na PB (resfriamento, espuma, fontes de ignição, central de
-- gás/GLP, SPDA) ficam sem atalho. Após rodar, recarregue o FireUtils.

begin;
insert into public.normas_dados (uf, sistema, dados, versao)
values ('PB', 'links_normas', $links${
  "portal": "https://bravo.bombeiros.pb.gov.br/portal/normas-tecnicas/",
  "medidas": {
    "acesso_viatura": [
      {
        "titulo": "NT 14/2023",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2023/10/NT-14-2023-CBMPB-Acesso-de-Viaturas-as-Edificacoes-e-Areas-de-Risco.pdf"
      }
    ],
    "seg_estrutural": [
      {
        "titulo": "NT 08/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/10/NT-08-2024-Seguranca-Estrutural-contra-Incendio-.pdf"
      }
    ],
    "compart_horizontal": [
      {
        "titulo": "NT 36/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/12/NT-36-2024-Compartimentacao-horizontal-e-compartimentacao-vertical.pdf"
      }
    ],
    "compart_vertical": [
      {
        "titulo": "NT 36/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/12/NT-36-2024-Compartimentacao-horizontal-e-compartimentacao-vertical.pdf"
      }
    ],
    "controle_acabamento": [
      {
        "titulo": "NT 09/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/10/NT-09-2024-Controle-de-Materiais-de-Acabamento-e-Revestimento-.pdf"
      }
    ],
    "saida_emergencia": [
      {
        "titulo": "NT 12/2015",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2020/12/NT-CBMPB-no-012-2015-SAIDAS-DE-EMERGENCIA.pdf"
      }
    ],
    "carga_incendio": [
      {
        "titulo": "NT 02/2023",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2023/09/NT-02-2023-CBMPB.pdf"
      }
    ],
    "controle_fumaca": [
      {
        "titulo": "NT 37/2025 — Pressurização de escada",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-37-2024-Pressurizacao-de-Escada-de-Seguranca.pdf"
      }
    ],
    "gerenciamento_risco": [
      {
        "titulo": "NT 13/2023",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2023/12/NT-13-CBMPB-Gerenciamento-de-Riscos-de-Incendios.pdf"
      }
    ],
    "brigada": [
      {
        "titulo": "NT 17/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/11/NT-17-Brigada-de-Incendio.pdf"
      }
    ],
    "iluminacao": [
      {
        "titulo": "NT 18/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/01/NT-18-2024-CBMPB-Iluminacao-de-emergencia.pdf"
      }
    ],
    "alarme": [
      {
        "titulo": "NT 19/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/01/NT-19-2024-CBMPB-Sistema-de-alarme-e-deteccao-de-incendio.pdf"
      }
    ],
    "deteccao": [
      {
        "titulo": "NT 19/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/01/NT-19-2024-CBMPB-Sistema-de-alarme-e-deteccao-de-incendio.pdf"
      }
    ],
    "sinalizacao": [
      {
        "titulo": "NT 06/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-06-2024-Sinalizacao-de-emergencia-2024.pdf"
      }
    ],
    "extintores": [
      {
        "titulo": "NT 21/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/01/NT-21-2024-CBMPB-Sistema-de-protecao-por-extintores.pdf"
      }
    ],
    "hidrantes": [
      {
        "titulo": "NT 15/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-15-2024-Hidrantes-e-mangotinhos.docx.pdf"
      }
    ],
    "sprinklers": [
      {
        "titulo": "NT 38/2025",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2025/02/NT-38-2024-Chuveiro-automatico-parte-I.pdf"
      }
    ],
    "gases_fixos": [
      {
        "titulo": "NT 33/2024",
        "url": "https://bravo.bombeiros.pb.gov.br/portal/wp-content/uploads/2024/12/NT-33-2024-Sistema-fixo-de-gases-para-combate-a-incendio.pdf"
      }
    ]
  }
}$links$::jsonb, 1)
on conflict (uf, sistema) do update
set dados = excluded.dados,
    versao = public.normas_dados.versao + 1,
    atualizado_em = now();
commit;
