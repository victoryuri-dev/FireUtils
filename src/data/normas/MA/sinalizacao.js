// normas/MA/sinalizacao.js — NT 20 CBMMA, Sinalização de Emergência.
// Catálogo dos pictogramas de sinalização de emergência (NBR 13434 partes
// 1-3), organizado por categoria conforme o Quadro Resumo da Sinalização de
// Emergência do projeto. Cada item carrega o código de referência, o
// significado, o pictograma (imagem) e o local de instalação típico — os
// mesmos dados usados na tela de quantidades e no memorial descritivo.
// Confira contra a NT 20 CBMMA vigente antes de aplicar em projeto real.

import p1  from '../../../assets/sinalizacao/p1.png'
import p2  from '../../../assets/sinalizacao/p2.jpg'
import p3  from '../../../assets/sinalizacao/p3.jpg'
import p4  from '../../../assets/sinalizacao/p4.jpg'
import p5  from '../../../assets/sinalizacao/p5.jpg'
import a1  from '../../../assets/sinalizacao/a1.png'
import a2  from '../../../assets/sinalizacao/a2.jpg'
import a3  from '../../../assets/sinalizacao/a3.jpg'
import a4  from '../../../assets/sinalizacao/a4.png'
import a5  from '../../../assets/sinalizacao/a5.jpg'
import a6  from '../../../assets/sinalizacao/a6.png'
import a7  from '../../../assets/sinalizacao/a7.png'
import s1  from '../../../assets/sinalizacao/s1.jpg'
import s2  from '../../../assets/sinalizacao/s2.jpg'
import s3  from '../../../assets/sinalizacao/s3.jpg'
import s4  from '../../../assets/sinalizacao/s4.jpg'
import s5  from '../../../assets/sinalizacao/s5.jpg'
import s6  from '../../../assets/sinalizacao/s6.jpg'
import s7  from '../../../assets/sinalizacao/s7.jpg'
import s8  from '../../../assets/sinalizacao/s8.jpg'
import s9  from '../../../assets/sinalizacao/s9.jpg'
import s10 from '../../../assets/sinalizacao/s10.png'
import s11 from '../../../assets/sinalizacao/s11.jpg'
import s12 from '../../../assets/sinalizacao/s12.jpg'
import s13 from '../../../assets/sinalizacao/s13.png'
import s14 from '../../../assets/sinalizacao/s14.png'
import s15 from '../../../assets/sinalizacao/s15.png'
import s16 from '../../../assets/sinalizacao/s16.png'
import s17 from '../../../assets/sinalizacao/s17.png'
import s18 from '../../../assets/sinalizacao/s18.jpg'
import e1  from '../../../assets/sinalizacao/e1.webp'
import e2  from '../../../assets/sinalizacao/e2.png'
import e3  from '../../../assets/sinalizacao/e3.png'
import e5  from '../../../assets/sinalizacao/e5.jpg'
import e6  from '../../../assets/sinalizacao/e6.jpg'
import e7  from '../../../assets/sinalizacao/e7.jpg'
import e8  from '../../../assets/sinalizacao/e8.jpg'
import e9  from '../../../assets/sinalizacao/e9.jpg'
import e10 from '../../../assets/sinalizacao/e10.jpg'
import e11 from '../../../assets/sinalizacao/e11.png'
import e17 from '../../../assets/sinalizacao/e17.png'

// ── Categorias (agrupam o catálogo na tela e no memorial) ──────────────────
export const CATEGORIAS = [
  { key: 'proibicao',    label: 'Sinalização de Proibição' },
  { key: 'alerta',       label: 'Sinalização de Alerta' },
  { key: 'orientacao',   label: 'Sinalização de Orientação e Saída de Emergência' },
  { key: 'equipamentos', label: 'Sinalização de Equipamentos de Combate a Incêndio' },
]

// ── Catálogo de placas/pictogramas — NBR 13434-2/3 ──────────────────────────
// `quantidadeRef` reproduz o texto da coluna "Quantidade" do quadro resumo —
// a maioria remete ao dimensionamento feito em Saída de Emergência (NT 11),
// não é um número fixo por projeto.
export const TIPOS_PLACA = [
  // Proibição — fundo branco, faixa/círculo vermelho (NBR 13434-2)
  { key: 'p1', codigo: 'P1', categoria: 'proibicao', label: 'Proibido fumar',
    img: p1, localInstalacao: 'Ambientes e áreas onde é proibido fumar' },
  { key: 'p2', codigo: 'P2', categoria: 'proibicao', label: 'Proibido produzir chama',
    img: p2, localInstalacao: 'Áreas com risco de incêndio onde é proibido produzir chama' },
  { key: 'p3', codigo: 'P3', categoria: 'proibicao', label: 'Proibido utilizar água para apagar o fogo',
    img: p3, localInstalacao: 'Toda situação em que o uso de água for impróprio para extinguir o fogo' },
  { key: 'p4', codigo: 'P4', categoria: 'proibicao', label: 'Proibido utilizar elevador em caso de incêndio',
    img: p4, localInstalacao: 'Nos locais de acesso aos elevadores comuns e monta-cargas' },
  { key: 'p5', codigo: 'P5', categoria: 'proibicao', label: 'Proibido obstruir este local',
    img: p5, localInstalacao: 'Em locais sujeitos a depósito de mercadorias onde a obstrução possa apresentar perigo de acesso às saídas de emergência, rotas de fuga, equipamentos de combate a incêndio etc.' },

  // Alerta — fundo amarelo, faixa preta (NBR 13434-2)
  { key: 'a1', codigo: 'A1', categoria: 'alerta', label: 'Alerta geral',
    img: a1, localInstalacao: 'Toda vez que não houver símbolo específico de alerta; deve sempre estar acompanhado de mensagem escrita específica' },
  { key: 'a2', codigo: 'A2', categoria: 'alerta', label: 'Cuidado, risco de incêndio',
    img: a2, localInstalacao: 'Áreas ou equipamentos com risco de incêndio' },
  { key: 'a3', codigo: 'A3', categoria: 'alerta', label: 'Cuidado, risco de explosão',
    img: a3, localInstalacao: 'Áreas ou equipamentos com risco de explosão' },
  { key: 'a4', codigo: 'A4', categoria: 'alerta', label: 'Cuidado, risco de corrosão',
    img: a4, localInstalacao: 'Próximo a locais onde houver presença de materiais corrosivos' },
  { key: 'a5', codigo: 'A5', categoria: 'alerta', label: 'Cuidado, risco de choque elétrico',
    img: a5, localInstalacao: 'Quadros, casas de máquinas e áreas com risco de choque elétrico' },
  { key: 'a6', codigo: 'A6', categoria: 'alerta', label: 'Cuidado, risco de radiação',
    img: a6, localInstalacao: 'Próximo a locais onde houver presença de materiais radioativos' },
  { key: 'a7', codigo: 'A7', categoria: 'alerta', label: 'Cuidado, risco de exposição a produtos tóxicos',
    img: a7, localInstalacao: 'Próximo a locais onde houver presença de produtos tóxicos' },

  // Orientação e saída de emergência — fundo verde (NBR 13434-3)
  { key: 's1_e', codigo: 'S1-E', categoria: 'orientacao', label: 'Saída de emergência — seta à esquerda (modelo 1)',
    img: s1, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's1_d', codigo: 'S1-D', categoria: 'orientacao', label: 'Saída de emergência — seta à direita (modelo 1)',
    img: s1, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's2_e', codigo: 'S2-E', categoria: 'orientacao', label: 'Saída de emergência — seta à esquerda (modelo 2)',
    img: s2, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's2_d', codigo: 'S2-D', categoria: 'orientacao', label: 'Saída de emergência — seta à direita (modelo 2)',
    img: s2, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's3', codigo: 'S3', categoria: 'orientacao', label: 'Saída de emergência — seta em frente',
    img: s3, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's4', codigo: 'S4', categoria: 'orientacao', label: 'Saída de emergência — seta diagonal superior direita',
    img: s4, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's5', codigo: 'S5', categoria: 'orientacao', label: 'Saída de emergência — seta diagonal superior esquerda',
    img: s5, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's6', codigo: 'S6', categoria: 'orientacao', label: 'Saída de emergência — seta diagonal inferior direita',
    img: s6, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's7', codigo: 'S7', categoria: 'orientacao', label: 'Saída de emergência — seta diagonal inferior esquerda',
    img: s7, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's8', codigo: 'S8', categoria: 'orientacao', label: 'Saída de emergência — descer escada (seta inferior direita)',
    img: s8, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's9', codigo: 'S9', categoria: 'orientacao', label: 'Saída de emergência — descer escada (seta inferior esquerda)',
    img: s9, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's10', codigo: 'S10', categoria: 'orientacao', label: 'Saída de emergência — subir escada (seta superior esquerda)',
    img: s10, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's11', codigo: 'S11', categoria: 'orientacao', label: 'Saída de emergência — subir escada (seta superior direita)',
    img: s11, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's12', codigo: 'S12', categoria: 'orientacao', label: 'Saída de emergência — texto "SAÍDA"',
    img: s12, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's13', codigo: 'S13', categoria: 'orientacao', label: 'Saída de emergência — "SAÍDA" com seta à direita',
    img: s13, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's14', codigo: 'S14', categoria: 'orientacao', label: 'Saída de emergência — "SAÍDA" (sem seta)',
    img: s14, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's15', codigo: 'S15', categoria: 'orientacao', label: 'Rota de fuga acessível — seta à direita',
    img: s15, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's16', codigo: 'S16', categoria: 'orientacao', label: 'Saída de emergência acessível — "SAÍDA" com seta à direita',
    img: s16, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)', localInstalacao: 'Rotas de saída' },
  { key: 's17', codigo: 'S17', categoria: 'orientacao', label: 'Número do pavimento',
    img: s17, quantidadeRef: 'O necessário para atender ao dimensionamento de Saída de Emergência (NT 11)',
    localInstalacao: 'A 1,80 m de altura, instalada junto à parede, sobre o patamar de acesso de cada pavimento' },
  { key: 's18', codigo: 'S18', categoria: 'orientacao', label: 'Instrução de abertura da porta corta-fogo por barra antipânico',
    img: s18, localInstalacao: 'Indicação da forma de acionamento da barra antipânico instalada sobre a porta corta-fogo' },

  // Equipamentos de combate a incêndio — fundo vermelho (NBR 13434-3)
  { key: 'e1', codigo: 'E1', categoria: 'equipamentos', label: 'Alarme sonoro',
    img: e1 },
  { key: 'e2', codigo: 'E2', categoria: 'equipamentos', label: 'Acionador manual de alarme de incêndio',
    img: e2 },
  { key: 'e3', codigo: 'E3', categoria: 'equipamentos', label: 'Comando manual da bomba de incêndio',
    img: e3 },
  { key: 'e5', codigo: 'E5', categoria: 'equipamentos', label: 'Extintor de incêndio',
    img: e5 },
  { key: 'e6', codigo: 'E6', categoria: 'equipamentos', label: 'Mangotinho',
    img: e6 },
  { key: 'e7', codigo: 'E7', categoria: 'equipamentos', label: 'Abrigo de mangueira e hidrante',
    img: e7 },
  { key: 'e8', codigo: 'E8', categoria: 'equipamentos', label: 'Hidrante de incêndio',
    img: e8 },
  { key: 'e9', codigo: 'E9', categoria: 'equipamentos', label: 'Coleção de equipamentos de combate a incêndio',
    img: e9 },
  { key: 'e10', codigo: 'E10', categoria: 'equipamentos', label: 'Válvula de controle do sistema de chuveiros automáticos',
    img: e10 },
  { key: 'e11', codigo: 'E11', categoria: 'equipamentos', label: 'Extintor de incêndio tipo carreta',
    img: e11 },
  { key: 'e17', codigo: 'E17', categoria: 'equipamentos', label: 'Sinalização de solo para equipamentos de combate a incêndio (hidrantes e extintores)',
    img: e17, localInstalacao: 'Usada para indicar a localização dos equipamentos de combate a incêndio e alarme, para evitar a sua obstrução' },
]

export const NOTAS = {
  geral: 'NBR 13434 (partes 1 a 3) — as placas de sinalização de emergência seguem cores, formas e pictogramas padronizados por categoria: proibição (fundo branco, faixa/círculo vermelho), alerta (fundo amarelo, faixa preta), orientação e saída (fundo verde) e equipamentos de combate a incêndio (fundo vermelho).',
  altura: 'Salvo indicação específica em contrário, as placas de equipamento e o número do pavimento devem ser instalados a 1,80 m de altura em relação ao piso acabado.',
  fotoluminescencia: 'As placas de orientação, saída de emergência e equipamentos devem ser fotoluminescentes, garantindo visibilidade mesmo na falta de energia elétrica.',
  quantidade: 'A quantidade de placas de orientação e saída de emergência decorre diretamente do dimensionamento das rotas de fuga feito em Saída de Emergência (NT 11 CBMMA).',
}
