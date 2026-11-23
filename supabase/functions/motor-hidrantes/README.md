# motor-hidrantes

Motor de dimensionamento do Sistema de Hidrantes (método da marcha com
Fator K). O plugin Revit lê o modelo e manda os dados; o cálculo, a norma e
as verificações normativas rodam só aqui.

Código do motor: `../_shared/motor/hidrantes/` (TypeScript puro, sem Deno nem
banco — por isso também roda em Node nos testes).

| Arquivo | O que faz |
|---|---|
| `hidraulica.ts` | Hazen-Williams, Fator K, esguicho → mangueira → válvula, equilíbrio no Ponto A, marcha de pressões |
| `succao.ts`, `npshd.ts` | Condição de sucção e NPSH disponível |
| `perfil.ts` | Lê a norma de `normas_dados` (UF + `hidrantes`) e monta o perfil do motor |
| `dimensionar.ts` | Valida a entrada, aplica a norma, roda o cálculo e as verificações; devolve o resultado ou o erro |

## Contrato

`POST /functions/v1/motor-hidrantes` com `Authorization: Bearer <access token do usuário>`.

```jsonc
{
  "uf": "MA",
  "valor_sistema": "Tipo 4 – Var. B – DN 65 | 300 L/min | 30 mca | Esg DN 60 | 30 m | simples",  // classificação gravada no Project Information; os parâmetros vêm no próprio texto (o site interpreta o Tipo; o motor não tem tabela de Tipos). Também aceita "Personalizado – DN …"
  "metodo": "Válvula do Hidrante",           // ou "Ponta do Esguicho Regulável"; null = Válvula
  "trechos": {                               // t1 RTI→Bomba, t2 Bomba→Ponto A, t3 Ponto A→HD01, t4 Ponto A→HD02
    "t1": [{ "d_mm": 100, "L": 4.0, "Leq": 3.0, "n_tubos": 2, "ids": [123], "acessorios": [] }]
  },
  "cotas": { "z_rti": 2, "z_succao": 1, "z_recalque": 1, "z_ponto_a": 6, "z_hd01": 5, "z_hd02": 5 },
  "dados_succao": { "altitude_m": null, "temperatura_c": null }
}
```

Resposta 200:

- `{ "ok": true, "versao": 1, "norma": "...", "resultado": {...} }` — `resultado`
  tem o mesmo formato do `payload_hid` que o plugin gravava no `firedata.json`
  (`res`, `dados_sistema`, `verif_succao`, `verif_npshd`...). O cliente só
  acrescenta o que é local (timestamp, nome do projeto, ranking de hidrantes).
- `{ "ok": false, "versao": 1, "erro": "..." }` — falha normativa ou de dados,
  com o texto que o usuário vê.

Outros status: `400` entrada malformada, `401` sem login ou sessão expirada,
`403` sem licença, `405`, `413` corpo > 1 MB, `429` mais de 30 pedidos por
minuto por usuário (por instância), `500` falha inesperada.

O cliente **não** envia Pmin, vazão, coeficiente C nem tolerâncias: tudo isso
vem da norma, lida aqui. `Ltotal` e os totais dos trechos também são
recalculados no servidor.

## Publicação

```bash
supabase functions deploy motor-hidrantes
```

Usa os secrets que o Supabase já injeta (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) e o `EXIGIR_LICENCA` das demais functions: com
`EXIGIR_LICENCA=true` o módulo `hidrantes` (ou `pro`) passa a ser exigido.
Sem ele, qualquer usuário logado calcula. Ligue junto com as outras.

## Testes

`tests/motorHidrantes.test.mjs` compara o motor com `tests/fixtures/motor-hidrantes/golden.json`,
gerado pelo motor Python original do plugin (`gerar_golden.py`) em 41 redes
(os dois métodos, os dois ramais governantes, equilíbrio sem convergência),
mais sucção, NPSH e os textos das falhas.

```bash
node --test tests/motorHidrantes.test.mjs
```
