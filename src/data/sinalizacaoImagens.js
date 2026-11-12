// Pictogramas das placas de sinalização (NBR 13434 — nacionais, não variam
// por estado). Ficam no bundle porque são arquivos de imagem, não dado
// normativo: a base central (normas_dados, sistema 'sinalizacao') guarda o
// catálogo de placas, e getSinalizacao() (normas/index.js) casa cada placa
// com a imagem pelo `key`.

import p1  from '../assets/sinalizacao/p1.png'
import p2  from '../assets/sinalizacao/p2.jpg'
import p3  from '../assets/sinalizacao/p3.jpg'
import p4  from '../assets/sinalizacao/p4.jpg'
import p5  from '../assets/sinalizacao/p5.jpg'
import a1  from '../assets/sinalizacao/a1.png'
import a2  from '../assets/sinalizacao/a2.jpg'
import a3  from '../assets/sinalizacao/a3.jpg'
import a4  from '../assets/sinalizacao/a4.png'
import a5  from '../assets/sinalizacao/a5.jpg'
import a6  from '../assets/sinalizacao/a6.png'
import a7  from '../assets/sinalizacao/a7.png'
import s1  from '../assets/sinalizacao/s1.jpg'
import s2  from '../assets/sinalizacao/s2.jpg'
import s3  from '../assets/sinalizacao/s3.jpg'
import s4  from '../assets/sinalizacao/s4.jpg'
import s5  from '../assets/sinalizacao/s5.jpg'
import s6  from '../assets/sinalizacao/s6.jpg'
import s7  from '../assets/sinalizacao/s7.jpg'
import s8  from '../assets/sinalizacao/s8.jpg'
import s9  from '../assets/sinalizacao/s9.jpg'
import s10 from '../assets/sinalizacao/s10.png'
import s11 from '../assets/sinalizacao/s11.jpg'
import s12 from '../assets/sinalizacao/s12.jpg'
import s13 from '../assets/sinalizacao/s13.png'
import s14 from '../assets/sinalizacao/s14.png'
import s15 from '../assets/sinalizacao/s15.png'
import s16 from '../assets/sinalizacao/s16.png'
import s17 from '../assets/sinalizacao/s17.png'
import s18 from '../assets/sinalizacao/s18.jpg'
import e1  from '../assets/sinalizacao/e1.webp'
import e2  from '../assets/sinalizacao/e2.png'
import e3  from '../assets/sinalizacao/e3.png'
import e5  from '../assets/sinalizacao/e5.jpg'
import e6  from '../assets/sinalizacao/e6.jpg'
import e7  from '../assets/sinalizacao/e7.jpg'
import e8  from '../assets/sinalizacao/e8.jpg'
import e9  from '../assets/sinalizacao/e9.jpg'
import e10 from '../assets/sinalizacao/e10.jpg'
import e11 from '../assets/sinalizacao/e11.png'
import e17 from '../assets/sinalizacao/e17.png'

export const IMAGEM_PLACA = {
  'p1': p1,
  'p2': p2,
  'p3': p3,
  'p4': p4,
  'p5': p5,
  'a1': a1,
  'a2': a2,
  'a3': a3,
  'a4': a4,
  'a5': a5,
  'a6': a6,
  'a7': a7,
  's1_e': s1,
  's1_d': s1,
  's2_e': s2,
  's2_d': s2,
  's3': s3,
  's4': s4,
  's5': s5,
  's6': s6,
  's7': s7,
  's8': s8,
  's9': s9,
  's10': s10,
  's11': s11,
  's12': s12,
  's13': s13,
  's14': s14,
  's15': s15,
  's16': s16,
  's17': s17,
  's18': s18,
  'e1': e1,
  'e2': e2,
  'e3': e3,
  'e5': e5,
  'e6': e6,
  'e7': e7,
  'e8': e8,
  'e9': e9,
  'e10': e10,
  'e11': e11,
  'e17': e17,
}
