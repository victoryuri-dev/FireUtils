// ── Cartao de secao de formulario — separa visualmente um conjunto de
// campos do resto da pagina (fundo, borda e titulo com peso proprio),
// em vez do antigo rotulo pequeno e cinza que se misturava ao fundo.
// `cabecalhoCentralizado`: título e `extra` alinhados ao centro (ex.: um input no cabeçalho).
export default function FormSection({ title, description, extra, children, cabecalhoCentralizado = false }) {
  return (
    <section className="bg-surface border border-solid border-border rounded-lg p-5 mb-6 transition-colors duration-300 ease-out hover:border-ink-hint focus-within:border-ink-hint">
      <div className={`flex flex-wrap ${cabecalhoCentralizado ? 'items-center' : 'items-start'} justify-between gap-3 ${children ? 'mb-4' : ''}`}>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {description && <p className="text-[12px] text-ink-faint leading-[1.5] mt-1">{description}</p>}
        </div>
        {extra && <div className="max-w-full">{extra}</div>}
      </div>
      {children}
    </section>
  )
}
