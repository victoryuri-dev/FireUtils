import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidorComNormas } from './helpers/normasDeTeste.mjs'

const server = await servidorComNormas()
after(() => server.close())
const { buildAnexoBData } = await server.ssrLoadModule('/src/utils/anexoB.js')

test('dados ausentes ficam em branco e não marcam processo técnico', () => {
  const d = buildAnexoBData({}, {})
  for (const [key,value] of Object.entries(d)) {
    if (typeof value === 'string') assert.equal(value,'',key)
  }
  assert.equal(d.processoTecnico,true)
  assert.equal(d.medidasCol1.some(m => m.ativo),false)
  assert.equal(d.medidasCol2.some(m => m.ativo),false)
})
test('área total e características vazias não são substituídas por dados das estruturas', () => {
  const d = buildAnexoBData({uf:'MA', areaConstruidaTotal:'', estruturas:[{areaTotal:3000,estrutura:['Concreto armado']} ]}, {})
  for (const key of ['areaTotalConstruida','estrutura','cobertura','vedacao','responsavelFone','rtFone']) assert.equal(d[key],'',key)
})
test('preserva as informações explicitamente salvas no projeto', () => {
  const d = buildAnexoBData({uf:'MA', areaConstruidaTotal:3000,caracteristicasEstrutura:'Madeira',cobertura:'Telha metálica',fachada:'Alvenaria',respTelefone:'123',rtTelefone:'456',processoTecnico:true}, {})
  assert.equal(d.areaTotalConstruida,'3.000 m²')
  assert.equal(d.estrutura,'Madeira')
  assert.equal(d.cobertura,'Telha metálica')
  assert.equal(d.vedacao,'Alvenaria')
  assert.equal(d.processoTecnico,true)
})
