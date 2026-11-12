-- Semeia normas_dados com o isolamento de risco da Paraíba (NT 20/2023
-- CBMPB): Tabela A-1 (índice das distâncias de segurança α, D = α × (largura
-- ou altura) + β) e a tabela de redutores da distância de separação.
-- Fonte: src/data/normas/PB/isolamento_risco.js.

insert into public.normas_dados (uf, sistema, dados, versao) values
  ('PB', 'isolamento_risco', $j${
  "norma": {
    "numero": "NT 20/2023",
    "nome": "Separação entre edificações (isolamento de risco) — CBMPB"
  },
  "tabela_a1": {
    "relacoes": [
      1,
      1.3,
      1.6,
      2,
      2.5,
      3.2,
      4,
      5,
      6,
      8,
      10,
      13,
      16,
      20,
      25,
      32,
      40
    ],
    "linhas": [
      {
        "aberturas": {
          "I": 20,
          "II": 10,
          "III": 5
        },
        "alfa": [
          0.4,
          0.4,
          0.44,
          0.46,
          0.48,
          0.49,
          0.5,
          0.5,
          0.51,
          0.51,
          0.51,
          0.51,
          0.51,
          0.51,
          0.51,
          0.51,
          0.51
        ]
      },
      {
        "aberturas": {
          "I": 30,
          "II": 15,
          "III": 7.5
        },
        "alfa": [
          0.6,
          0.66,
          0.73,
          0.79,
          0.84,
          0.88,
          0.9,
          0.92,
          0.93,
          0.94,
          0.94,
          0.95,
          0.95,
          0.95,
          0.95,
          0.95,
          0.95
        ]
      },
      {
        "aberturas": {
          "I": 40,
          "II": 20,
          "III": 10
        },
        "alfa": [
          0.8,
          0.8,
          0.94,
          1.02,
          1.1,
          1.17,
          1.23,
          1.27,
          1.3,
          1.32,
          1.33,
          1.33,
          1.34,
          1.34,
          1.34,
          1.34,
          1.34
        ]
      },
      {
        "aberturas": {
          "I": 50,
          "II": 25,
          "III": 12.5
        },
        "alfa": [
          0.9,
          1,
          1.11,
          1.22,
          1.33,
          1.42,
          1.51,
          1.58,
          1.63,
          1.66,
          1.69,
          1.7,
          1.71,
          1.71,
          1.71,
          1.71,
          1.71
        ]
      },
      {
        "aberturas": {
          "I": 60,
          "II": 30,
          "III": 15
        },
        "alfa": [
          1,
          1.14,
          1.26,
          1.39,
          1.52,
          1.64,
          1.76,
          1.85,
          1.93,
          1.99,
          2.03,
          2.05,
          2.07,
          2.08,
          2.08,
          2.08,
          2.08
        ]
      },
      {
        "aberturas": {
          "I": 80,
          "II": 40,
          "III": 20
        },
        "alfa": [
          1.2,
          1.37,
          1.52,
          1.68,
          1.85,
          2.02,
          2.18,
          2.34,
          2.48,
          2.59,
          2.67,
          2.73,
          2.77,
          2.79,
          2.8,
          2.81,
          2.81
        ]
      },
      {
        "aberturas": {
          "I": 100,
          "II": 50,
          "III": 25
        },
        "alfa": [
          1.4,
          1.56,
          1.74,
          1.93,
          2.13,
          2.34,
          2.55,
          2.76,
          2.95,
          3.12,
          3.26,
          3.36,
          3.43,
          3.48,
          3.51,
          3.52,
          3.53
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": 60,
          "III": 30
        },
        "alfa": [
          1.6,
          1.73,
          1.94,
          2.15,
          2.38,
          2.63,
          2.88,
          3.13,
          3.37,
          3.6,
          3.79,
          3.95,
          4.07,
          4.15,
          4.2,
          4.22,
          4.24
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": 80,
          "III": 40
        },
        "alfa": [
          1.8,
          2.04,
          2.28,
          2.54,
          2.82,
          3.12,
          3.44,
          3.77,
          4.11,
          4.43,
          4.74,
          5.01,
          5.24,
          5.41,
          5.52,
          5.6,
          5.64
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": 100,
          "III": 50
        },
        "alfa": [
          2.1,
          2.3,
          2.57,
          2.87,
          3.2,
          3.55,
          3.93,
          4.33,
          4.74,
          5.16,
          5.56,
          5.95,
          6.29,
          6.56,
          6.77,
          6.92,
          7.01
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": null,
          "III": 60
        },
        "alfa": [
          2.3,
          2.54,
          2.84,
          3.17,
          3.54,
          3.93,
          4.36,
          4.83,
          5.3,
          5.8,
          6.3,
          6.78,
          7.23,
          7.63,
          7.94,
          8.18,
          8.34
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": null,
          "III": 80
        },
        "alfa": [
          2.6,
          2.95,
          3.31,
          3.7,
          4.13,
          4.61,
          5.12,
          5.68,
          6.28,
          6.91,
          7.57,
          8.24,
          8.89,
          9.51,
          10,
          10.5,
          10.8
        ]
      },
      {
        "aberturas": {
          "I": null,
          "II": null,
          "III": 100
        },
        "alfa": [
          3,
          3.32,
          3.72,
          4.16,
          4.65,
          5.19,
          5.78,
          6.43,
          7.13,
          7.88,
          8.67,
          9.5,
          10.3,
          11.1,
          11.9,
          12.5,
          13.1
        ]
      }
    ]
  },
  "redutores": {
    "vedacoes": [
      {
        "key": "combustivel",
        "label": "Estruturas e paredes combustíveis ou TRRF até 30 min"
      },
      {
        "key": "trrf30_90",
        "label": "Paredes externas com TRRF superior a 30 min e inferior a 90 min"
      },
      {
        "key": "trrf90_120",
        "label": "Paredes externas com TRRF de 90 min e inferior a 120 min"
      },
      {
        "key": "trrf120",
        "label": "Paredes externas com TRRF igual ou maior que 120 min"
      }
    ],
    "protecoes": [
      {
        "key": "parede_corta_fogo",
        "label": "Parede corta fogo entre edificações, com resistência ao fogo de 120 min",
        "efeitos": {
          "combustivel": {
            "texto": "A distância é eliminada",
            "fator": 0
          },
          "trrf30_90": {
            "texto": "A distância é eliminada",
            "fator": 0
          },
          "trrf90_120": {
            "texto": "A distância é eliminada",
            "fator": 0
          },
          "trrf120": {
            "texto": "A distância é eliminada",
            "fator": 0
          }
        }
      },
      {
        "key": "aberturas_trrf_inferior",
        "label": "Proteção das aberturas das fachadas com elemento de proteção com TRRF 30 min inferior ao da parede",
        "efeitos": {
          "combustivel": {
            "texto": "Ineficiente",
            "fator": 1
          },
          "trrf30_90": {
            "texto": "Reduzir em 50% a distância de segurança. Considerando uma proteção das aberturas mínimas de 30 min.",
            "fator": 0.5
          },
          "trrf90_120": {
            "texto": "Reduzir em 50% a distância de segurança.",
            "fator": 0.5
          },
          "trrf120": {
            "texto": "Reduzir em 75% a distância de segurança, com um máximo exigido de 6 m.",
            "fator": 0.25,
            "maximo": 6
          }
        }
      },
      {
        "key": "aberturas_trrf_igual",
        "label": "Proteção das aberturas das fachadas com elemento de proteção com TRRF igual ao da parede",
        "efeitos": {
          "combustivel": {
            "texto": "Ineficiente",
            "fator": 1
          },
          "trrf30_90": {
            "texto": "Reduzir em 60% a distância de segurança.",
            "fator": 0.4
          },
          "trrf90_120": {
            "texto": "Reduzir em 70% a distância de segurança.",
            "fator": 0.3
          },
          "trrf120": {
            "texto": "Reduzir em 75% a distância de segurança, com um máximo exigido de 3 m.",
            "fator": 0.25,
            "maximo": 3
          }
        }
      },
      {
        "key": "cortina_agua",
        "label": "Prevendo cortina d'água por inundação",
        "efeitos": {
          "combustivel": {
            "texto": "Cortina d'água em toda a fachada. Reduzir em 50% a distância de segurança.",
            "fator": 0.5
          },
          "trrf30_90": {
            "texto": "Cortina d'água nas aberturas. Reduzir em 50% a distância de segurança.",
            "fator": 0.5
          },
          "trrf90_120": {
            "texto": "Cortina d'água nas aberturas. Reduzir em 50% a distância de segurança.",
            "fator": 0.5
          },
          "trrf120": {
            "texto": "Cortina d'água nas aberturas. Reduzir em 50% a distância de segurança.",
            "fator": 0.5
          }
        }
      }
    ]
  }
}$j$::jsonb, 1)
on conflict (uf, sistema) do update set dados = excluded.dados, versao = normas_dados.versao + 1, atualizado_em = now();
