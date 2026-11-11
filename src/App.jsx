import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, supabaseReady } from './supabase.js'
import { loadWorkspace, removeTask, saveMessage, saveProfile, saveTask, saveWaterLog } from './data.js'
import brandIcon from './assets/agirmente-app-icon.png'
import brandLogo from './assets/agirmente-horizontal-logo.png'
import {
  ArrowRight, ArrowUpRight, Bell, BellRing, CalendarDays, Check, CheckCheck, ChevronDown,
  CircleDollarSign, CircleHelp, Clock3, Command, Compass, Filter, Focus, History, Home, Inbox, Lightbulb,
  ListChecks, ListTodo, LogOut, MessageCircle, Mic, MoreHorizontal, Plus, Repeat2, Save, Search, Send, Settings2, Sparkles,
  Sun, Tag, Target, Trash2, UserRound, X, Droplets, GlassWater, Columns3, List, CalendarRange, FileText,
} from 'lucide-react'

const navigation = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'focus', label: 'Foco agora', icon: Target },
  { id: 'queue', label: 'Minha fila', icon: ListTodo },
  { id: 'health', label: 'Saúde', icon: Droplets },
  { id: 'assistant', label: 'Assistente', icon: MessageCircle },
  { id: 'profile', label: 'Perfil', icon: UserRound },
]

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
const cleanText = (value) => value.trim().replace(/\s+/g, ' ')
const dateLabel = (value) => {
  if (!value) return 'Sem data'
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(date)
}
const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}
function suggestTaskDetails(raw, categories = [], tagCatalog = []) {
  const text = raw.toLocaleLowerCase('pt-BR')
  const categoryHints = [
    ['Saúde', /sa[uú]de|m[eé]dic|consulta|rem[eé]dio|exame|[aá]gua|terapia|dentista/],
    ['Trabalho', /trabalho|cliente|reuni[aã]o|projeto|relat[oó]rio|equipe|empresa|cobrar|or[cç]amento/],
    ['Pessoal', /casa|fam[ií]lia|mercado|pessoal|organizar|comprar|pagar/],
    ['Ideias', /ideia|pensar|pesquisar|planejar|talvez|projeto futuro/],
  ]
  const detected = categoryHints.find(([, pattern]) => pattern.test(text))?.[0]
  const category = detected && categories.includes(detected) ? detected : 'Entrada'
  const priority = /urgente|hoje|atrasad|prazo|até amanhã|o quanto antes/.test(text) ? 1 : /quando puder|sem pressa|algum dia|sem urgência/.test(text) ? 3 : 2
  const minutes = Number(text.match(/\b(\d{1,3})\s*(?:min|minuto|minutos)\b/)?.[1]) || (text.length > 110 ? 30 : text.length > 55 ? 20 : null)
  const due = /\bhoje\b/.test(text) ? dateFromInput(localDateString()) : /\bamanh[ãa]\b/.test(text) ? dateFromInput(localDateString(new Date(Date.now()+86400000))) : null
  const words = text.match(/#([\p{L}\p{N}_-]+)/gu) || []
  const registeredTags = new Set(tagCatalog.map((tag) => tag.name.toLocaleLowerCase('pt-BR')))
  const tags = words.map((word) => word.slice(1)).filter((tag) => registeredTags.has(tag.toLocaleLowerCase('pt-BR')))
  return { category, priority, estimated_minutes: minutes, due_at: due, tags, tag_colors: {} }
}

function BrandMark() {
  return <img className="brand-symbol" src={brandIcon} alt="" aria-hidden="true" />
}

const inputDate = (value) => value ? new Date(value).toISOString().slice(0, 10) : ''
const dateFromInput = (value) => value ? new Date(`${value}T12:00:00`).toISOString() : null
const localDateString = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateTimeInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return `${localDateString(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const dateTimeFromInput = (value) => value ? new Date(value).toISOString() : null
const nextOccurrence = (dateValue, recurrence) => {
  const date = dateValue ? new Date(dateValue) : new Date()
  date.setHours(12, 0, 0, 0)
  if (recurrence === 'diaria') date.setDate(date.getDate() + 1)
  else if (recurrence === 'dias_uteis') { date.setDate(date.getDate() + 1); if (date.getDay() === 6) date.setDate(date.getDate() + 2); if (date.getDay() === 0) date.setDate(date.getDate() + 1) }
  else if (recurrence === 'semanal') date.setDate(date.getDate() + 7)
  else if (recurrence === 'mensal') date.setMonth(date.getMonth() + 1)
  return date.toISOString()
}
const eventLabels = {
  criada: 'Atividade criada', iniciada: 'Atividade iniciada', pausada: 'Atividade pausada',
  retomada: 'Atividade retomada', aguardando_alguem: 'Aguardando retorno', cobranca_feita: 'Cobrança registrada',
  concluida: 'Atividade concluída', reaberta: 'Atividade reaberta', atualizada: 'Detalhes atualizados',
  cobranca_adiada: 'Cobrança agendada para depois',
}

function AuthGate() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setNotice('')
    const result = isSignup
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href } })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    setNotice(result.error?.message ?? (isSignup ? 'Conta criada. Confira seu e-mail para confirmar o acesso.' : 'Acesso realizado.'))
  }
  return <main className="auth-screen"><div className="auth-brand"><img src={brandLogo} alt="AGIRMENTE — Seu jeito de pensar. Sua maneira de transformar." /></div><section className="auth-card"><div className="eyebrow"><Sparkles size={15} /> UM LUGAR PARA COMEÇAR</div><h1>Seus pensamentos<br />podem respirar.</h1><p>Entre para continuar organizando as coisas do seu jeito.</p><form onSubmit={submit} className="auth-form"><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="voce@email.com" autoComplete="email" /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="6" placeholder="Pelo menos 6 caracteres" autoComplete={isSignup ? 'new-password' : 'current-password'} /></label><button className="primary-button full" disabled={busy}>{busy ? 'Só um instante…' : isSignup ? 'Criar minha conta' : 'Entrar'}<ArrowRight size={17} /></button></form>{notice && <div className="notice">{notice}</div>}<button className="text-button auth-toggle" onClick={() => { setIsSignup(!isSignup); setNotice('') }}>{isSignup ? 'Já tenho uma conta' : 'Ainda não tenho conta'}</button><div className="auth-note">Seus dados ficam protegidos e pertencem a você.</div></section><div className="auth-footer">Seu jeito de pensar. Sua maneira de transformar.</div></main>
}

function TaskRow({ task, onStatus, onDelete, onPrioritize, onCategory, onOpen, onToggleFocus, isFocused = false, categories = [], tagCatalog = [], compact = false }) {
  const done = task.status === 'done'
  const isCharge = task.task_type === 'cobranca'
  return <article className={`task-row ${compact ? 'compact' : ''} ${done ? 'is-done' : ''}`}>
    <button className={`task-check ${done ? 'checked' : ''} ${isCharge ? 'task-check-charge' : ''}`} aria-label={isCharge ? 'Abrir detalhes da cobrança' : done ? 'Reabrir atividade' : 'Concluir atividade'} onClick={() => isCharge ? onOpen?.(task) : onStatus(task, { status: done ? 'next' : 'done' })}>{done ? <Check size={14} /> : isCharge ? <CircleDollarSign size={13} /> : null}</button>
    <div className="task-main"><button className="task-open-button" aria-label={`Ver e editar: ${task.title}`} title="Ver e editar atividade" onClick={() => onOpen?.(task)}><span className="task-title-line"><span className="task-title">{task.title}</span>{task.priority === 1 && <span className="priority-dot" title="Prioridade alta" />}</span><span className="task-open-label" aria-hidden="true"><FileText size={14}/></span></button><div className="task-meta"><select className="category-select" aria-label={`Categoria: ${task.title}`} value={task.category || 'Entrada'} onChange={(event) => onCategory?.(task, event.target.value)}><option value="Entrada">Entrada</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{task.task_type === 'cobranca' && <span className="task-kind-pill"><CircleDollarSign size={12} /> Cobrança</span>}{task.status === 'waiting' && <span className="task-waiting-pill">Aguardando retorno</span>}{task.due_at && <><span className="meta-separator">·</span><span className={new Date(task.due_at).toDateString() === new Date().toDateString() ? 'due-today' : ''}><CalendarDays size={12} />{dateLabel(dateFromInput(inputDate(task.due_at)))}</span></>}{task.estimated_minutes && <span><Clock3 size={12} />{task.estimated_minutes} min</span>}{task.steps?.length > 0 && <span><ListChecks size={12} />{task.steps.filter((step) => step.done).length}/{task.steps.length}</span>}{task.status === 'waiting' && task.follow_up_at && <><span className="meta-separator">·</span><span><History size={12} />Cobrar {dateLabel(task.follow_up_at)}</span></>}</div>{task.tags?.length > 0 && <div className="task-tags" aria-label="Etiquetas">{task.tags.map((tag) => { const color = tagCatalog.find((entry) => entry.name === tag)?.color || task.tag_colors?.[tag] || '#16985d'; return <span className="task-tag" key={tag} style={{ '--tag-color': color }}>{tag}</span> })}</div>}</div>
    <div className="task-actions"><button className={`focus-action ${isFocused ? 'is-selected' : ''}`} aria-label={`${isFocused ? 'Remover de' : 'Adicionar ao'} Foco agora: ${task.title}`} onClick={() => onToggleFocus?.(task)}><Target size={14} /><span>{isFocused ? 'No foco' : 'Colocar no foco'}</span></button>{task.status === 'paused' ? <button className="mini-action" onClick={() => onStatus(task, { status: 'next' })}>Retomar</button> : task.status !== 'done' && <button className="mini-action" onClick={() => onStatus(task, { status: 'paused' })}>Pausar</button>}<button className="icon-button subtle" title="Aumentar prioridade" aria-label={`Aumentar prioridade: ${task.title}`} onClick={() => onPrioritize(task)}><ArrowUpRight size={16} /></button><button className="icon-button subtle delete-action" title="Excluir" aria-label={`Excluir: ${task.title}`} onClick={() => onDelete(task)}><Trash2 size={15} /></button></div>
  </article>
}

function TaskDetailModal({ task, categories, tagCatalog = [], onClose, onSave, onDelete, onSkip, onPostpone }) {
  const [draft, setDraft] = useState(() => ({
    title: task.title || '', notes: task.notes || '', steps: (task.steps || []).map((step, index) => typeof step === 'string' ? { id: `step-${index}`, title: step, done: false } : { ...step }), category: task.category || 'Entrada',
    status: task.status || 'inbox', priority: String(task.priority || 2), due_at: inputDate(task.due_at),
    task_type: task.task_type || 'tarefa', assignee: task.assignee || '', tags: [...(task.tags || [])], tag_colors: task.tag_colors || {}, follow_up_at: inputDate(task.follow_up_at),
    estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : '', reminder_at: dateTimeInput(task.reminder_at), recurrence: task.recurrence || 'nenhuma',
  }))
  const [newStep, setNewStep] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.classList.remove('modal-open') }
  }, [onClose])

  function change(field, value) { setDraft((current) => ({ ...current, [field]: value })) }
  function addStep(event) {
    event?.preventDefault()
    const title = cleanText(newStep)
    if (!title) return
    setDraft((current) => ({ ...current, steps: [...current.steps, { id: makeId(), title, done: false }] }))
    setNewStep('')
  }
  function toggleStep(id) { setDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === id ? { ...step, done: !step.done } : step) })) }
  function removeStep(id) { setDraft((current) => ({ ...current, steps: current.steps.filter((step) => step.id !== id) })) }
  async function commit(status = draft.status, extraChanges = {}) {
    setSaving(true); setError('')
    const changes = {
      title: draft.title.trim(), notes: draft.notes.trim(), steps: draft.steps,
      category: draft.category, status, priority: Number(draft.priority), due_at: dateFromInput(draft.due_at),
      task_type: draft.task_type, assignee: draft.assignee.trim(), tags: [...new Set(draft.tags)], tag_colors: Object.fromEntries(draft.tags.map((tag) => [tag, tagCatalog.find((entry) => entry.name === tag)?.color || draft.tag_colors[tag] || '#16985d'])),
      follow_up_at: draft.task_type === 'cobranca' ? dateFromInput(draft.follow_up_at) : null,
      estimated_minutes: draft.estimated_minutes ? Number(draft.estimated_minutes) : null,
      reminder_at: dateTimeFromInput(draft.reminder_at),
      reminded_at: draft.reminder_at !== dateTimeInput(task.reminder_at) ? null : task.reminded_at || null,
      recurrence: draft.recurrence,
      ...extraChanges,
    }
    if (status === 'done' && task.status !== 'done') changes.completed_at = new Date().toISOString()
    if (!changes.title) { setError('Dê um nome para esta atividade.'); setSaving(false); return false }
    const result = await onSave(task, changes, updateNote.trim())
    setSaving(false)
    if (!result) { setError('Não consegui salvar agora. Tente novamente.'); return false }
    setDraft((current) => ({ ...current, status }))
    setUpdateNote('')
    if (status === 'done') onClose()
    return true
  }
  async function save(event) { event?.preventDefault(); await commit() }
  async function registerCharge() { await commit('waiting') }
  async function deferCharge() {
    if (!draft.follow_up_at) { setError('Escolha a data em que quer voltar a cobrar.'); return }
    if (await commit('waiting', { focus_date: null })) onPostpone?.(task, draft.follow_up_at)
  }
  async function finish() { await commit('done') }

  return <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <header className="detail-header"><div><span className="detail-eyebrow">DETALHES DA ATIVIDADE</span><h2 id="detail-title">Organize do seu jeito</h2><p>Atualize o contexto e deixe registrado o que aconteceu.</p></div><button className="icon-button detail-close" aria-label="Fechar detalhes" onClick={onClose}><X size={19} /></button></header>
      <form className="detail-form" onSubmit={save}>
        <div className="detail-fields">
          <label className="detail-field detail-wide task-title-editor">Nome da atividade<input autoFocus value={draft.title} onChange={(event) => change('title', event.target.value)} maxLength="180" /></label>
          <div className="detail-field detail-wide tag-editor"><span className="field-label-icon"><Tag size={14} /> Etiquetas</span><span className="tag-editor-hint">Escolha quantas etiquetas quiser. As cores são ajustadas em Perfil.</span><div className="tag-picker">{tagCatalog.length ? tagCatalog.map((tag) => { const selected = draft.tags.includes(tag.name); return <button type="button" key={tag.name} className={`tag-option ${selected ? 'selected' : ''}`} style={{ '--tag-color': tag.color }} aria-pressed={selected} onClick={() => change('tags', selected ? draft.tags.filter((item) => item !== tag.name) : [...draft.tags, tag.name])}><span className="tag-option-dot" />{tag.name}{selected && <Check size={13} />}</button> }) : <span className="tag-picker-empty">Cadastre suas etiquetas em Perfil para usá-las nas atividades.</span>}</div></div>
          <label className="detail-field">Tipo<select value={draft.task_type} onChange={(event) => change('task_type', event.target.value)}><option value="tarefa">Atividade</option><option value="cobranca">Cobrança</option></select></label>
          <label className="detail-field">Situação<select value={draft.status} onChange={(event) => change('status', event.target.value)}><option value="inbox">Caixa de entrada</option><option value="next">Próxima ação</option><option value="doing">Em andamento</option><option value="waiting">Aguardando retorno</option><option value="paused">Pausada</option>{(draft.task_type !== 'cobranca' || draft.status === 'done') && <option value="done">Concluída</option>}</select></label>
          <label className="detail-field">Categoria<select value={draft.category} onChange={(event) => change('category', event.target.value)}><option value="Entrada">Entrada</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
          <label className="detail-field">Prioridade<select value={draft.priority} onChange={(event) => change('priority', event.target.value)}><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option></select></label>
          <label className="detail-field">Previsão de conclusão<input type="date" value={draft.due_at} onChange={(event) => change('due_at', event.target.value)} /></label>
          <label className="detail-field">Responsável<input value={draft.assignee} onChange={(event) => change('assignee', event.target.value)} placeholder="Você ou outra pessoa" maxLength="100" /></label>
          {draft.task_type === 'cobranca' && <label className="detail-field detail-wide follow-up-field"><span className="field-label-icon"><History size={15} /> Próxima data para cobrar</span><input type="date" value={draft.follow_up_at} onChange={(event) => change('follow_up_at', event.target.value)} /><span>A cobrança continua aberta e volta ao foco nessa data.</span></label>}
          <section className="detail-field detail-wide step-builder"><span className="field-label-icon"><ListChecks size={14} /> Pequenos passos</span><p>Quebre a atividade em partes menores. Marque cada uma quando fizer sentido.</p><div className="step-list">{draft.steps.map((step) => <div className={`step-row ${step.done ? 'is-step-done' : ''}`} key={step.id}><label><input type="checkbox" checked={Boolean(step.done)} onChange={() => toggleStep(step.id)} /><span>{step.title}</span></label><button type="button" className="icon-button subtle" aria-label={`Remover passo ${step.title}`} onClick={() => removeStep(step.id)}><X size={14} /></button></div>)}</div><div className="step-add-row"><input value={newStep} onChange={(event) => setNewStep(event.target.value)} placeholder="Ex.: abrir o documento" maxLength="180" onKeyDown={(event) => { if (event.key === 'Enter') addStep(event) }} /><button type="button" className="secondary-button" disabled={!newStep.trim()} onClick={addStep}><Plus size={14} /> Adicionar passo</button></div></section>
          <label className="detail-field">Tempo estimado<select value={draft.estimated_minutes} onChange={(event) => change('estimated_minutes', event.target.value)}><option value="">Sem estimativa</option>{[5, 10, 15, 25, 30, 45, 60, 90, 120].map((minutes) => <option value={minutes} key={minutes}>{minutes < 60 ? `${minutes} minutos` : `${minutes / 60} hora${minutes > 60 ? 's' : ''}`}</option>)}</select></label>
          <label className="detail-field"><span className="field-label-icon"><Repeat2 size={14} /> Repetir</span><select value={draft.recurrence} onChange={(event) => change('recurrence', event.target.value)}><option value="nenhuma">Não repetir</option><option value="diaria">Todos os dias</option><option value="dias_uteis">Dias úteis</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option></select></label>
          <label className="detail-field detail-wide"><span className="field-label-icon"><BellRing size={14} /> Lembrete</span><input type="datetime-local" value={draft.reminder_at} onChange={(event) => change('reminder_at', event.target.value)} /><span>O lembrete aparece enquanto o AGIRMENTE estiver aberto neste navegador.</span></label>
          <label className="detail-field detail-wide">Mais informações<textarea value={draft.notes} onChange={(event) => change('notes', event.target.value)} rows="4" placeholder="Contexto, links, detalhes para lembrar…" /></label>
        </div>
        <section className="detail-history"><div className="detail-section-heading"><span className="detail-section-icon"><History size={16} /></span><div><h3>Histórico de atualizações</h3><p>Um registro simples do que mudou.</p></div></div>
          <label className="detail-field detail-wide update-note-field">Adicionar uma atualização<textarea value={updateNote} onChange={(event) => setUpdateNote(event.target.value)} rows="2" placeholder="Ex.: Falei com a pessoa; ela vai responder até sexta…" /></label>
          <div className="timeline">{(task.history || []).length ? task.history.map((event) => <article className="timeline-entry" key={event.id}><span className="timeline-dot" /><div><div className="timeline-title">{eventLabels[event.event_type] || 'Atualização'}<time>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.created_at))}</time></div>{event.note && <p>{event.note}</p>}</div></article>) : <p className="timeline-empty">As próximas mudanças aparecerão aqui.</p>}</div>
        </section>
        {error && <div className="detail-error" role="alert">{error}</div>}
        <footer className="detail-footer"><button type="button" className="detail-delete" onClick={() => onDelete(task)}><Trash2 size={15} /> Excluir</button><div className="detail-footer-actions">{draft.recurrence !== 'nenhuma' && draft.status !== 'done' && <button type="button" className="detail-cancel" onClick={() => onSkip(task)}>Pular esta vez</button>}<button type="button" className="detail-cancel" onClick={onClose}>Fechar</button>{draft.task_type === 'cobranca' && draft.status !== 'done' && <button type="button" className="detail-charge" onClick={registerCharge} disabled={saving}><History size={15} /> Registrar retorno</button>}{draft.task_type === 'cobranca' && draft.status !== 'done' && <button type="button" className="detail-defer" onClick={deferCharge} disabled={saving}><CalendarDays size={15} /> Agendar próxima cobrança</button>}<button className="primary-button detail-save" disabled={saving}>{saving ? 'Salvando…' : <><Save size={15} /> Salvar alterações</>}</button>{draft.task_type === 'cobranca' && draft.status !== 'done' && <button type="button" className="detail-finish" onClick={finish} disabled={saving}><Check size={15} /> Concluir e arquivar</button>}</div></footer>
      </form>
    </section>
  </div>
}

function FocusPicker({ tasks, focusedIds, onToggle, onClose, tagCatalog = [] }) {
  const [search, setSearch] = useState('')
  const candidates = tasks.filter((task) => { const scheduledLater = task.status === 'waiting' && task.follow_up_at && localDateString(new Date(task.follow_up_at)) > localDateString(); return task.status !== 'done' && !scheduledLater && [task.title, task.category, ...(task.tags || [])].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) })
  useEffect(() => { const close = (event) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close) }, [onClose])
  return <div className="detail-backdrop focus-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="focus-picker" role="dialog" aria-modal="true" aria-labelledby="focus-picker-title"><header><div><span className="detail-eyebrow">ESCOLHA SEM SAIR DO FOCO</span><h2 id="focus-picker-title">O que você quer priorizar?</h2><p>Selecione até três atividades. As escolhas podem mudar quando você quiser.</p></div><button className="icon-button detail-close" aria-label="Fechar seletor de foco" onClick={onClose}><X size={19} /></button></header><label className="focus-picker-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar atividade ou etiqueta" autoFocus /></label><div className="focus-picker-list">{candidates.map((task) => { const focused = focusedIds.has(task.id); const disabled = !focused && focusedIds.size >= 3; return <button key={task.id} className={`focus-choice ${focused ? 'selected' : ''}`} disabled={disabled} onClick={() => onToggle(task)}><span className="focus-choice-check">{focused && <Check size={15} />}</span><span><strong>{task.title}</strong><small>{task.category || 'Entrada'} · {task.status === 'inbox' ? 'Backlog' : task.status === 'doing' ? 'Em andamento' : task.status === 'waiting' ? 'Aguardando' : task.status === 'paused' ? 'Pausada' : 'Na fila'}</small></span>{task.tags?.slice(0,2).map((tag) => <span className="task-tag" key={tag} style={{'--tag-color':tagCatalog.find((entry) => entry.name === tag)?.color || task.tag_colors?.[tag] || '#16985d'}}>{tag}</span>)}</button> })}{!candidates.length && <div className="focus-picker-empty">Nenhuma atividade encontrada. Tente outra busca ou capture algo novo.</div>}</div><footer><span>{focusedIds.size} de 3 escolhas</span><button className="primary-button" onClick={onClose}>Concluir escolha</button></footer></section></div>
}

function WaterBody({ progress }) {
  const waterHeight = Math.max(0, Math.min(100, progress))
  const bodyPath = 'M90 12 C76 12 65 23 65 37 C65 46 70 53 78 57 L78 65 C70 67 62 73 59 82 L52 118 L30 145 C25 151 26 160 32 164 C38 168 46 166 50 160 L72 132 L77 111 L77 145 C77 151 78 156 80 161 L60 219 C57 228 61 236 70 236 C77 236 82 232 84 224 L82 181 C82 174 98 174 98 181 L96 224 C98 232 103 236 110 236 C119 236 123 228 120 219 L100 161 C102 156 103 151 103 145 L103 111 L108 132 L130 160 C134 166 142 168 148 164 C154 160 155 151 150 145 L128 118 L121 82 C118 73 110 67 102 65 L102 57 C110 53 115 46 115 37 C115 23 104 12 90 12 Z'
  const levelY = 250 - (250 * waterHeight / 100)
  return <div className="water-body-card" role="img" aria-label={`Medidor visual de hidratação: ${waterHeight} por cento da meta`}><svg viewBox="0 0 180 250" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id="body-shape"><path d={bodyPath} /></clipPath><linearGradient id="water-gradient" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#8ce4c0"/><stop offset="1" stopColor="#078e50"/></linearGradient></defs><path className="body-silhouette" d={bodyPath}/><g clipPath="url(#body-shape)"><rect className="body-water" x="0" y={levelY} width="180" height={250-levelY} fill="url(#water-gradient)"/><path className="body-water-line" d={`M0 ${levelY} q45 -9 90 0 t90 0`} /></g></svg><strong>{waterHeight}%</strong><span>da meta de hoje</span></div>
}

const boardColumns = [
  { status: 'inbox', label: 'Backlog', hint: 'Para organizar' },
  { status: 'next', label: 'Próximas ações', hint: 'Na fila' },
  { status: 'doing', label: 'Em andamento', hint: 'Começadas' },
  { status: 'waiting', label: 'Aguardando', hint: 'Retorno' },
  { status: 'paused', label: 'Pausadas', hint: 'Retomáveis' },
  { status: 'done', label: 'Concluídas', hint: 'Conquistas' },
]

function KanbanBoard({ tasks, onOpen, onFocus, onStatus, tagCatalog = [] }) {
  return <div className="kanban-board">{boardColumns.map((column) => { const items = tasks.filter((task) => task.status === column.status); return <section className="kanban-column" key={column.status}><header><div><h2>{column.label}</h2><span>{column.hint}</span></div><b>{items.length}</b></header><div className="kanban-cards">{items.map((task) => <article className="kanban-card" key={task.id}><button className="kanban-card-open" onClick={() => onOpen(task)}><strong>{task.title}</strong>{task.notes && <span>{task.notes}</span>}</button><div className="task-tags">{(task.tags || []).slice(0,3).map((tag) => <span className="task-tag" key={tag} style={{'--tag-color':tagCatalog.find((entry) => entry.name === tag)?.color || task.tag_colors?.[tag] || '#16985d'}}>{tag}</span>)}</div><footer>{task.status !== 'done' && <button className="focus-action" onClick={() => onFocus(task)}><Target size={14}/><span>{task.focus_date === localDateString() ? 'No foco' : 'Colocar no foco'}</span></button>}{task.status === 'paused' && <button className="kanban-state-action" onClick={() => onStatus(task,{status:'next'})}>Retomar</button>}{task.status !== 'done' && task.status !== 'paused' && <button className="kanban-state-action" onClick={() => onStatus(task,{status:'paused'})}>Pausar</button>}</footer></article>)}</div></section> })}</div>
}

function TagCatalogManager({ tags, tasks, onAdd, onColor, onRemove }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#168653')
  const [colors, setColors] = useState({})
  useEffect(() => setColors(Object.fromEntries(tags.map((tag) => [tag.name, tag.color]))), [tags])
  return <section className="profile-card tag-catalog-card"><div className="profile-section-title"><div><strong>Suas etiquetas</strong><span>Cadastre palavras-chave e escolha uma cor. Depois, selecione várias em cada atividade.</span></div></div><div className="tag-catalog-list">{tags.map((tag) => { const used = tasks.filter((task) => task.tags?.includes(tag.name)).length; return <div className="tag-catalog-row" key={tag.name}><span className="task-tag" style={{ '--tag-color': colors[tag.name] || tag.color }}>{tag.name}</span><span className="tag-use-count">{used ? `${used} ${used === 1 ? 'atividade' : 'atividades'}` : 'Sem uso'}</span><input type="color" aria-label={`Cor de ${tag.name}`} value={colors[tag.name] || tag.color} onChange={(event) => setColors((current) => ({ ...current, [tag.name]: event.target.value }))} onBlur={(event) => { if (event.target.value !== tag.color) onColor(tag.name, event.target.value) }} /><button className="icon-button subtle" aria-label={`Remover etiqueta ${tag.name}`} title={used ? 'Remova primeiro das atividades' : 'Remover etiqueta'} disabled={Boolean(used)} onClick={() => onRemove(tag.name)}><X size={15} /></button></div> })}{!tags.length && <p className="tag-catalog-empty">Você ainda não cadastrou etiquetas.</p>}</div><form className="tag-catalog-add" onSubmit={(event) => { onAdd(event, name, color); setName('') }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova etiqueta" aria-label="Nome da nova etiqueta" maxLength="32" /><input type="color" aria-label="Cor da nova etiqueta" value={color} onChange={(event) => setColor(event.target.value)} /><button type="submit" className="secondary-button" disabled={!cleanText(name) || tags.some((tag) => tag.name.toLocaleLowerCase('pt-BR') === cleanText(name).toLocaleLowerCase('pt-BR'))}><Plus size={14} /> Criar etiqueta</button></form></section>
}

function WaterReminder({ profile, onChange, onEnable }) {
  const [draft, setDraft] = useState(profile.settings || {})
  useEffect(() => setDraft(profile.settings || {}), [profile.settings])
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const saveNumber = (key) => onChange(key, Number(draft[key]))
  return <div className="water-settings"><label>Minha meta diária<input type="number" min="250" max="10000" step="250" value={draft.water_goal_ml || 2000} onChange={(event) => update('water_goal_ml',event.target.value)} onBlur={() => saveNumber('water_goal_ml')}/><small>ml por dia</small></label><label>Volume da minha garrafa<input type="number" min="100" max="5000" step="50" value={draft.bottle_ml || 750} onChange={(event) => update('bottle_ml',event.target.value)} onBlur={() => saveNumber('bottle_ml')}/><small>ml por garrafa</small></label><label className="water-reminder-toggle"><span><strong>Lembretes gentis</strong><small>Enquanto o app estiver aberto.</small></span><input type="checkbox" checked={Boolean(draft.water_reminders)} onChange={(event) => { update('water_reminders',event.target.checked); onChange('water_reminders',event.target.checked); if(event.target.checked) onEnable() }}/></label>{draft.water_reminders && <label>Me lembrar a cada<select value={draft.water_reminder_minutes || 120} onChange={(event) => { update('water_reminder_minutes',Number(event.target.value)); onChange('water_reminder_minutes',Number(event.target.value)) }}><option value="45">45 minutos</option><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option><option value="180">3 horas</option></select></label>}</div>
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(supabaseReady)
  const [tab, setTab] = useState('home')
  const [tasks, setTasks] = useState([])
  const [waterLogs, setWaterLogs] = useState([])
  const [profile, setProfile] = useState({ name: 'Alex', categories: ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'], settings: { reduceMotion: false, highContrast: false } })
  const [messages, setMessages] = useState([])
  const [capture, setCapture] = useState('')
  const [useCaptureSuggestions, setUseCaptureSuggestions] = useState(true)
  const [filter, setFilter] = useState('Tudo')
  const [queueView, setQueueView] = useState('lista')
  const [focusPickerOpen, setFocusPickerOpen] = useState(false)
  const [sortBy, setSortBy] = useState('data')
  const [query, setQuery] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [toast, setToast] = useState('')
  const [reminderTask, setReminderTask] = useState(null)
  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [busy, setBusy] = useState(false)
  const [profileName, setProfileName] = useState('Alex')
  const [newCategory, setNewCategory] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notificationPermission, setNotificationPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported')
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches || false)
  const [waterSaving, setWaterSaving] = useState(false)
  const captureRef = useRef(null)
  const chatRef = useRef(null)
  const firedReminders = useRef(new Set())
  const focusActionLock = useRef(false)
  const waterReminderAt = useRef(0)

  useEffect(() => {
    if (!supabaseReady) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let alive = true
    setLoadingWorkspace(true)
    loadWorkspace(user?.id).then((workspace) => {
      if (!alive) return
      setTasks(workspace.tasks); setWaterLogs(workspace.waterLogs || []); setMessages(workspace.messages)
      const savedCatalog = workspace.profile.settings?.tag_catalog || []
      const known = new Set(savedCatalog.map((item) => item.name.toLocaleLowerCase('pt-BR')))
      const legacyTags = workspace.tasks.flatMap((task) => (task.tags || []).map((name) => ({ name, color: task.tag_colors?.[name] || '#168653' }))).filter((item) => { const key = item.name.toLocaleLowerCase('pt-BR'); if (known.has(key)) return false; known.add(key); return true })
      const nextProfile = legacyTags.length ? { ...workspace.profile, settings: { ...workspace.profile.settings, tag_catalog: [...savedCatalog, ...legacyTags] } } : workspace.profile
      setProfile(nextProfile); setProfileName(workspace.profile.name || user?.email?.split('@')[0] || 'Alex')
      if (legacyTags.length) saveProfile(nextProfile, user?.id).catch((error) => showError(error))
    }).catch((error) => showError(error)).finally(() => { if (alive) setLoadingWorkspace(false) })
    return () => { alive = false }
  }, [user?.id])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = () => setSystemPrefersDark(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => { if (tab === 'assistant') chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, tab])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(''); setReminderTask(null) }, pendingDelete || reminderTask ? 8000 : 2800); return () => clearTimeout(timer) }, [toast, pendingDelete, reminderTask])
  useEffect(() => {
    if (!pendingDelete) return
    const timer = setTimeout(async () => {
      try { await removeTask(pendingDelete.id) } catch (error) { showError(error) }
      setPendingDelete(null)
    }, 8000)
    return () => clearTimeout(timer)
  }, [pendingDelete])
  useEffect(() => {
    const checkReminders = async () => {
      const now = Date.now()
      for (const task of tasks) {
        if (task.status === 'done' || !task.reminder_at || task.reminded_at || new Date(task.reminder_at).getTime() > now || firedReminders.current.has(task.id)) continue
        firedReminders.current.add(task.id)
        const message = `Lembrete: ${task.title}`
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            const notice = new Notification('AGIRMENTE', { body: message, icon: brandIcon, tag: `agirmente-${task.id}` })
            notice.onclick = () => { window.focus(); setSelectedTaskId(task.id); setTab('queue'); notice.close() }
          }
        } catch {}
        setToast(message)
        setReminderTask(task)
        const updated = { ...task, reminded_at: new Date().toISOString() }
        try {
          const stored = await saveTask(updated, user?.id)
          setTasks((items) => items.map((item) => item.id === task.id ? stored : item))
        } catch (error) { firedReminders.current.delete(task.id); showError(error) }
      }
    }
    checkReminders()
    const timer = setInterval(checkReminders, 30000)
    return () => clearInterval(timer)
  }, [tasks, user?.id])

  useEffect(() => {
    if (!profile.settings?.water_reminders) return
    if (!waterReminderAt.current) waterReminderAt.current = Date.now()
    const check = () => {
      const interval = Number(profile.settings?.water_reminder_minutes || 120) * 60000
      const todayLogs = waterLogs.filter((log) => localDateString(new Date(log.drank_at)) === localDateString())
      const lastDrink = Math.max(waterReminderAt.current, todayLogs.length ? Math.max(...todayLogs.map((log) => new Date(log.drank_at).getTime())) : 0)
      if (Date.now() - lastDrink < interval) return
      waterReminderAt.current = Date.now()
      setToast('Uma pausa para beber água pode ajudar. Sem pressa.')
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AGIRMENTE', { body: 'Uma pausa para beber água pode ajudar.', icon: brandIcon, tag: 'agirmente-water' }) } catch {}
    }
    const timer = setInterval(check, 60000)
    return () => clearInterval(timer)
  }, [profile.settings?.water_reminders, profile.settings?.water_reminder_minutes, waterLogs])

  function showError(error) { setToast(error?.message || 'Não foi possível salvar agora. Tente de novo.') }
  async function addTask(raw, category = 'Entrada', suggested = {}) {
    const title = cleanText(raw)
    if (!title) return null
    const task = { id: makeId(), title, category: suggested.category || category, task_type: 'tarefa', assignee: '', tags: suggested.tags || [], tag_colors: suggested.tag_colors || {}, follow_up_at: null, status: 'inbox', priority: suggested.priority || 3, due_at: suggested.due_at || null, reminder_at: null, reminded_at: null, estimated_minutes: suggested.estimated_minutes || null, focus_date: null, recurrence: 'nenhuma', notes: '', steps: [], history: [], created_at: new Date().toISOString() }
    try { const stored = await saveTask(task, user?.id, { event_type: 'criada', note: 'Atividade adicionada à fila.' }); setTasks((items) => [stored, ...items]); return stored } catch (error) { showError(error); return null }
  }
  async function updateTask(task, changes, activityNote = '') {
    if (changes.reminder_at !== undefined && changes.reminder_at !== task.reminder_at) firedReminders.current.delete(task.id)
    const updated = { ...task, ...changes, ...(changes.status === 'done' ? { focus_date: null, reminder_at: null, reminded_at: null } : {}) }
    let eventType = 'atualizada'
      if (changes.status === 'done' && task.status !== 'done') eventType = 'concluida'
    else if (task.status === 'done' && changes.status && changes.status !== 'done') eventType = 'reaberta'
    else if (changes.status === 'waiting') eventType = updated.task_type === 'cobranca' ? 'cobranca_feita' : 'aguardando_alguem'
    else if (task.status === 'waiting' && changes.status) eventType = 'retomada'
    else if (changes.status === 'paused') eventType = 'pausada'
    else if (changes.status === 'doing') eventType = 'iniciada'
    const defaultNote = eventType === 'cobranca_feita' ? (changes.follow_up_at ? `Nova cobrança agendada para ${dateLabel(changes.follow_up_at)}.` : 'Cobrança registrada; aguardando retorno.') : eventType === 'concluida' ? 'Atividade concluída e arquivada.' : eventType === 'pausada' ? 'Atividade pausada.' : eventType === 'iniciada' ? 'Atividade iniciada.' : eventType === 'retomada' ? 'Atividade retomada.' : eventType === 'reaberta' ? 'Atividade reaberta.' : eventType === 'aguardando_alguem' ? 'Atividade marcada como aguardando retorno.' : 'Detalhes da atividade atualizados.'
    try {
      const stored = await saveTask(updated, user?.id, { event_type: eventType, note: activityNote || defaultNote, details: { fields: Object.keys(changes), status: updated.status } })
      setTasks((items) => items.map((item) => item.id === task.id ? stored : item))
      if (eventType === 'concluida' && updated.recurrence && updated.recurrence !== 'nenhuma') {
        const nextTask = { ...updated, id: makeId(), status: 'next', completed_at: null, started_at: null, paused_at: null, focus_date: null, reminder_at: null, reminded_at: null, due_at: nextOccurrence(updated.due_at, updated.recurrence), steps: (updated.steps || []).map((step) => ({ ...step, id: makeId(), done: false })), history: [], created_at: new Date().toISOString() }
        const nextStored = await saveTask(nextTask, user?.id, { event_type: 'criada', note: 'Próxima ocorrência criada pela recorrência.' })
        setTasks((items) => [nextStored, ...items.filter((item) => item.id !== task.id), stored])
        setToast('Concluída. A próxima ocorrência já ficou guardada.')
      } else setToast(eventType === 'concluida' ? 'Concluída e arquivada. Feito no seu tempo.' : eventType === 'cobranca_feita' ? 'Cobrança registrada. A atividade continua aberta para o próximo retorno.' : eventType === 'pausada' ? 'Tudo bem pausar. Você pode retomar quando quiser.' : eventType === 'retomada' ? 'Atividade de volta à fila.' : 'Atividade atualizada.')
      return stored
    } catch (error) { showError(error); return null }
  }
  async function deleteTask(task) {
    if (pendingDelete) { try { await removeTask(pendingDelete.id) } catch (error) { showError(error) } }
    setTasks((items) => items.filter((item) => item.id !== task.id))
    setPendingDelete(task)
    setSelectedTaskId(null)
    setToast('Atividade removida da lista.')
  }
  function undoDelete() {
    if (!pendingDelete) return
    setTasks((items) => [pendingDelete, ...items])
    setPendingDelete(null)
    setToast('Atividade recuperada.')
  }
  async function toggleFocus(task) {
    if (focusActionLock.current) return
    const today = localDateString()
    if (task.status === 'waiting' && task.follow_up_at && localDateString(new Date(task.follow_up_at)) > today) { setToast(`Essa cobrança volta à fila em ${dateLabel(task.follow_up_at)}.`); return }
    const isFocused = task.focus_date === today
    if (!isFocused && focusTasks.length >= 3) { setToast('Seu foco já tem três atividades. Retire uma para abrir espaço.'); return }
    focusActionLock.current = true
    try {
      const result = await updateTask(task, { focus_date: isFocused ? null : today, ...(task.status === 'paused' && !isFocused ? { status: 'next' } : {}) }, isFocused ? 'Removida do Foco agora.' : 'Adicionada ao Foco agora.')
      if (!result) return
      setToast(isFocused ? 'Saiu do seu foco. Continua guardada na fila.' : 'Adicionada ao seu foco de hoje.')
    } finally { focusActionLock.current = false }
  }
  async function skipOccurrence(task) {
    if (!task.recurrence || task.recurrence === 'nenhuma') return
    await updateTask(task, { due_at: nextOccurrence(task.due_at, task.recurrence), focus_date: null, reminder_at: null, reminded_at: null, status: 'next' }, 'Esta ocorrência foi pulada. A próxima ficou agendada.')
    setSelectedTaskId(null)
  }
  async function enableNotifications() {
    if (!('Notification' in window)) { setToast('Este navegador não oferece notificações. Os lembretes ainda aparecem no app aberto.'); return }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    setNotificationPermission(permission)
    setToast(permission === 'granted' ? 'Notificações ativadas neste navegador.' : 'Tudo bem. Os lembretes continuarão aparecendo dentro do app.')
  }
  async function snoozeReminder(minutes) {
    if (!reminderTask) return
    const newReminder = new Date(Date.now() + minutes * 60000).toISOString()
    const result = await updateTask(reminderTask, { reminder_at: newReminder, reminded_at: null }, `Lembrete adiado por ${minutes < 60 ? `${minutes} minutos` : 'um dia'}.`)
    if (result) setToast(`Lembrete adiado. Volto a mostrar “${reminderTask.title}” depois.`)
    setReminderTask(null)
  }
  async function updatePreference(key, value) {
    const nextProfile = { ...profile, settings: { ...(profile.settings || {}), [key]: value } }
    try { const saved = await saveProfile(nextProfile, user?.id); setProfile(saved); setToast('Preferência atualizada.') } catch (error) { showError(error) }
  }
  async function addTag(event, name, color) {
    event.preventDefault()
    name = cleanText(name)
    const catalog = profile.settings?.tag_catalog || []
    if (!name || catalog.some((tag) => tag.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) return
    const nextCatalog = [...catalog, { name, color }]
    await updatePreference('tag_catalog', nextCatalog)
  }
  async function updateTagColor(name, color) {
    const catalog = (profile.settings?.tag_catalog || []).map((tag) => tag.name === name ? { ...tag, color } : tag)
    await updatePreference('tag_catalog', catalog)
  }
  async function removeTag(name) {
    const usageCount = tasks.filter((task) => task.tags?.includes(name)).length
    if (usageCount) { setToast(`“${name}” ainda está em uso por ${usageCount} ${usageCount === 1 ? 'atividade' : 'atividades'}.`); return }
    await updatePreference('tag_catalog', (profile.settings?.tag_catalog || []).filter((tag) => tag.name !== name))
  }
  async function saveWaterEntry() {
    if (waterSaving) return
    setWaterSaving(true)
    try { const log = await saveWaterLog(Number(profile.settings?.bottle_ml || 750), user?.id); setWaterLogs((items) => [log, ...items]); waterReminderAt.current = Date.now(); setToast(`Registrados ${Number(log.amount_ml).toLocaleString('pt-BR')} ml. Obrigado por cuidar de você.`) }
    catch (error) { showError(error) }
    finally { setWaterSaving(false) }
  }
  async function postponeCharge(task, followUpDate) {
    setSelectedTaskId(null)
    setToast(`Cobrança guardada para ${dateLabel(dateFromInput(followUpDate))}. Ela volta à fila nesse dia.`)
  }
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'done'), [tasks])
  const focusTasks = useMemo(() => activeTasks.filter((task) => task.focus_date === localDateString() && task.status !== 'paused' && !(task.status === 'waiting' && task.follow_up_at && localDateString(new Date(task.follow_up_at)) > localDateString())), [activeTasks])
  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const searchable = [task.title, task.notes, task.assignee, ...(task.tags || [])].join(' ').toLocaleLowerCase('pt-BR')
    const matchesQuery = searchable.includes(query.toLocaleLowerCase('pt-BR'))
    const matchesFilter = filter === 'Tudo' || (filter.startsWith('Etiqueta:') ? (task.tags || []).includes(filter.slice(9)) : filter === 'Com lembrete' ? Boolean(task.reminder_at) : filter === 'Sem prazo' ? !task.due_at : filter === 'Caixa de entrada' ? task.status === 'inbox' : filter === 'Em andamento' ? task.status === 'doing' : filter === 'Aguardando retorno' ? task.status === 'waiting' : filter === 'Pausadas' ? task.status === 'paused' : filter === 'Concluídas' ? task.status === 'done' : task.category === filter)
    const deferred = task.status === 'waiting' && task.follow_up_at && localDateString(new Date(task.follow_up_at)) > localDateString()
    return matchesQuery && matchesFilter && (filter !== 'Tudo' || !deferred)
  }).sort((a, b) => sortBy === 'prioridade' ? a.priority - b.priority : sortBy === 'tempo' ? (a.estimated_minutes || Infinity) - (b.estimated_minutes || Infinity) : (a.due_at || a.follow_up_at || '9999').localeCompare(b.due_at || b.follow_up_at || '9999')), [tasks, query, filter, sortBy])
  const agendaGroups = useMemo(() => {
    const groups = new Map()
    for (const task of visibleTasks.filter((item) => item.status !== 'done')) {
      const scheduleDate = task.due_at || task.follow_up_at
      const key = scheduleDate ? localDateString(new Date(scheduleDate)) : 'sem-data'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].sort(([a], [b]) => a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : a.localeCompare(b)).map(([key, items]) => ({ key, items, label: key === 'sem-data' ? 'Sem data marcada' : key === localDateString() ? 'Hoje' : key === localDateString(new Date(Date.now() + 86400000)) ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00`)) }))
  }, [visibleTasks])
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  function openTask(task) { setSelectedTaskId(task.id) }

  async function handleCapture(event) {
    event?.preventDefault()
    const suggestions = suggestTaskDetails(capture, profile.categories, profile.settings?.tag_catalog || [])
    const task = await addTask(capture, 'Entrada', useCaptureSuggestions ? suggestions : {})
    if (task) { setCapture(''); setToast('Guardado na sua fila. Um passo de cada vez.') }
  }
  function toggleVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) { setToast('A captura por voz ainda não está disponível neste navegador.'); return }
    const recognition = new Recognition(); recognition.lang = 'pt-BR'; recognition.interimResults = false
    recognition.onresult = (event) => setCapture((text) => `${text}${text ? ' ' : ''}${event.results[0][0].transcript}`)
    recognition.onerror = () => setToast('Não consegui ouvir agora. Você pode digitar.'); recognition.start()
  }
  async function replyToAssistant(event) {
    event.preventDefault()
    const content = cleanText(chatDraft)
    if (!content) return
    setChatDraft(''); setBusy(true)
    try {
      const userMessage = await saveMessage({ role: 'user', content }, user?.id)
      setMessages((items) => [...items, userMessage])
      const text = content.toLocaleLowerCase('pt-BR')
      let answer = 'Anotei o que você trouxe. Quer transformar em uma atividade ou pensar no próximo passo juntos?'
      if (/^(adiciona|adicionar|cria|criar|anota|anotar|lembra|lembrar|guardar|guarda)/.test(text)) {
        const title = content.replace(/^(adiciona(r)?|cria(r)?|anota(r)?|lembra(r)?|guarda(r)?)(\s+(uma tarefa|uma atividade|uma ideia|na fila|pra fila|para a fila))?\s*[:,-]?\s*/i, '')
        const created = await addTask(title)
        if (created) answer = `Coloquei “${created.title}” na sua fila. Por enquanto, isso já está cuidado.`
      } else if (/conclu|terminei|feito|finalizei/.test(text)) {
        const target = activeTasks.find((task) => text.includes(task.title.toLocaleLowerCase('pt-BR')))
        if (target) { await updateTask(target, { status: 'done' }); answer = `Marquei “${target.title}” como concluída. Pode reconhecer esse avanço.` }
        else answer = 'Posso concluir uma atividade da sua fila. Me diga o nome dela como aparece lá.'
      } else if (/paus|depois|mais tarde/.test(text)) {
        const target = activeTasks.find((task) => text.includes(task.title.toLocaleLowerCase('pt-BR')))
        if (target) { await updateTask(target, { status: 'paused' }); answer = `Deixei “${target.title}” pausada. Ela continua guardada para quando fizer sentido.` }
        else answer = 'Tudo bem deixar algo para depois. Qual atividade você quer pausar?'
      } else if (/o que (eu )?(faço|faco|começo|comeco)|por onde começo|foco|prioriz|organiz(a|e|ar) (minha )?(fila|lista)/.test(text)) {
        const ranked = [...activeTasks].filter((task) => task.status !== 'waiting' || !task.follow_up_at || localDateString(new Date(task.follow_up_at)) <= localDateString()).sort((a,b) => (a.due_at || a.follow_up_at || '9999').localeCompare(b.due_at || b.follow_up_at || '9999') || a.priority-b.priority || a.created_at.localeCompare(b.created_at))
        const picks = focusTasks.length ? focusTasks : ranked.slice(0,3)
        answer = picks.length ? `Vamos reduzir a escolha. Eu começaria por “${picks[0].title}”${picks[1] ? `, depois “${picks[1].title}”` : ''}${picks[2] ? ` e por fim “${picks[2].title}”` : ''}. Considerei prazo, prioridade e o que já está no seu foco. Peça “abrir [nome]” para organizar os detalhes, ou “colocar [nome] no foco”.` : 'Não há atividades ativas na fila. Se algo estiver na sua cabeça, escreva “guardar: ...” e eu ajudo a transformar em uma atividade.'
      } else if (/abrir|detalhes|dividir|quebrar em passos|organizar atividade/.test(text)) {
        const target = activeTasks.find((task) => text.includes(task.title.toLocaleLowerCase('pt-BR')))
        if (target) { setSelectedTaskId(target.id); answer = `Abri os detalhes de “${target.title}”. Você pode ajustar prioridade, prazo, categoria, etiquetas e pequenos passos.` }
        else answer = 'Diga o nome da atividade que você quer organizar, por exemplo: “abrir Enviar o relatório”.'
      } else if (/coloca(r)? .*foco|adiciona(r)? .*foco/.test(text)) {
        const target = activeTasks.find((task) => text.includes(task.title.toLocaleLowerCase('pt-BR')))
        if (target) { await toggleFocus(target); answer = `Atualizei o Foco agora com “${target.title}”. Se já houver três escolhas, retire uma antes de adicionar outra.` }
        else answer = 'Me diga o nome da atividade que quer colocar no Foco agora.'
      } else if (/falta(m)? (informação|detalhe)|caixa de entrada|backlog|o que preciso organizar/.test(text)) {
        const review = activeTasks.filter((task) => task.status === 'inbox').slice(0,5)
        answer = review.length ? `Estas atividades estão no seu backlog e podem ganhar contexto antes de irem para a fila: ${review.map((task) => `“${task.title}”`).join(', ')}. Abra uma para incluir detalhes; quando estiver pronta, escolha “Próxima ação”.` : 'Seu backlog está limpo por agora. Posso sugerir prioridade para o que já está na fila.'
      } else if (/o que (eu )?(faço|faco|começo|comeco)|por onde começo|foco/.test(text)) {
        answer = focusTasks.length ? `Seu foco já tem “${focusTasks[0].title}”. Se quiser, abra a atividade para dividir em um passo menor.` : 'Ainda não há escolhas no seu foco. Peça “organize minha fila” para eu recomendar até três opções, ou selecione as atividades que preferir na janela de Foco agora.'
      }
      const assistantMessage = await saveMessage({ role: 'assistant', content: answer }, user?.id)
      setMessages((items) => [...items, assistantMessage])
    } catch (error) { showError(error) } finally { setBusy(false) }
  }
  async function updateCategories(event) {
    event.preventDefault()
    const category = cleanText(newCategory)
    if (!category || profile.categories.includes(category)) return
    try { const updated = await saveProfile({ ...profile, name: profileName, categories: [...profile.categories, category] }, user?.id); setProfile(updated); setNewCategory('') } catch (error) { showError(error) }
  }
  async function saveName(event) {
    event.preventDefault()
    try { const updated = await saveProfile({ ...profile, name: cleanText(profileName) }, user?.id); setProfile(updated); setToast('Seu perfil foi atualizado.') } catch (error) { showError(error) }
  }
  function promote(task) {
    const nextPriority = task.priority === 1 ? 3 : task.priority - 1
    updateTask(task, { priority: nextPriority })
  }

  if (authLoading) return <div className="loading-screen"><BrandMark /></div>
  if (supabaseReady && !user) return <AuthGate />

  const currentNavigation = navigation.find((item) => item.id === tab)
  const queuedCount = activeTasks.length
  const firstName = (profile.name || profileName || 'Alex').split(' ')[0]
  const completedCount = tasks.filter((task) => task.status === 'done').length
  const inboxCount = tasks.filter((task) => task.status === 'inbox').length
  const doingCount = tasks.filter((task) => task.status === 'doing').length
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0
  const todayWaterLogs = waterLogs.filter((log) => localDateString(new Date(log.drank_at)) === localDateString())
  const waterTotal = todayWaterLogs.reduce((total, log) => total + Number(log.amount_ml || 0), 0)
  const waterGoal = Number(profile.settings?.water_goal_ml || 2000)
  const waterProgress = waterGoal ? Math.min(100, Math.round(waterTotal / waterGoal * 100)) : 0
  const tagCatalog = profile.settings?.tag_catalog || []
  const captureSuggestions = capture.trim() ? suggestTaskDetails(capture, profile.categories, tagCatalog) : null
  const selectedAppearance = profile.settings?.appearance || 'system'
  const effectiveTheme = selectedAppearance === 'system' ? systemPrefersDark ? 'dark' : 'light' : selectedAppearance

  return <div className={`app-shell ${profile.settings?.highContrast ? 'high-contrast' : ''} ${profile.settings?.reduceMotion ? 'reduce-motion' : ''}`} data-theme={effectiveTheme}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setTab('home')}><BrandMark /><span className="brand-word">agirmente</span></button>
      <button className="capture-shortcut" onClick={() => { setTab('home'); setTimeout(() => captureRef.current?.focus(), 0) }}><Plus size={17} /><span>Capturar pensamento</span><kbd>⌘ K</kbd></button>
      <div className="nav-label">ESPAÇO</div>
      <nav className="main-nav">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18} strokeWidth={tab === id ? 2.1 : 1.8} /><span>{label}</span>{id === 'queue' && queuedCount > 0 && <span className="nav-count">{queuedCount}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="weekly-card"><div className="weekly-icon"><Lightbulb size={17} /></div><strong>Não precisa resolver tudo agora.</strong><span>Um próximo passo já é um começo.</span></div><button className="nav-item profile-link" onClick={() => setTab('profile')}><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span>{profile.name || firstName}</span><MoreHorizontal size={17} /></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><BrandMark /> agirmente</div><div className="breadcrumb"><span>Espaço pessoal</span><span className="breadcrumb-slash">/</span><strong>{currentNavigation?.label}</strong></div><div className="topbar-actions"><span className={`connection-status ${supabaseReady ? 'cloud' : ''}`}><span className="status-dot" />{supabaseReady ? 'Sincronizado' : 'Salvo neste dispositivo'}</span><button className="icon-button notification-button" title={notificationPermission === 'granted' ? 'Notificações ativadas' : 'Ativar notificações'} aria-label="Ativar notificações" onClick={enableNotifications}><Bell size={17} /><i /></button><button className="top-avatar" onClick={() => setTab('profile')}>{firstName.slice(0, 1).toUpperCase()}</button></div></header>
      {!supabaseReady && <div className="local-banner"><span>Modo local: suas informações ficam salvas neste navegador.</span><button onClick={() => setTab('profile')}>Ver perfil <ArrowRight size={14} /></button></div>}
      <div className="page-content">
        {loadingWorkspace ? <div className="page-loading">Organizando seu espaço…</div> : <>
          {tab === 'home' && <section className="home-page">
            <div className="home-heading"><div className="home-greeting"><span className="greeting-icon"><Home size={25} /></span><div><div className="date-overline">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div><h1>{greeting()}, {firstName}<span className="heading-period">.</span></h1><p>Vamos organizar seu dia do seu jeito.</p></div></div><button className="quiet-button" onClick={() => setTab('focus')}><Compass size={16} /> Encontrar meu foco <ArrowRight size={15} /></button></div>
            <form className="capture-card" onSubmit={handleCapture}><div className="capture-top"><span className="capture-glyph"><Sparkles size={18} /></span><div><strong>Tire da cabeça, coloque aqui.</strong><span>Uma ideia, uma tarefa, qualquer coisa.</span></div></div><div className="capture-input-row"><input ref={captureRef} value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="O que está passando pela sua cabeça?" aria-label="Capturar uma atividade"/><button type="button" className="voice-button" title="Capturar por voz" onClick={toggleVoice}><Mic size={17} /></button><button type="submit" className="capture-submit" disabled={!capture.trim()}>Guardar <ArrowRight size={15} /></button></div>{captureSuggestions && <div className="capture-assistant-hint"><Sparkles size={15}/><span>Sugestão de organização: <strong>{captureSuggestions.category}</strong> · prioridade <strong>{captureSuggestions.priority === 1 ? 'alta' : captureSuggestions.priority === 2 ? 'média' : 'baixa'}</strong>{captureSuggestions.estimated_minutes && <> · cerca de <strong>{captureSuggestions.estimated_minutes} min</strong></>}{captureSuggestions.tags.length > 0 && <> · etiquetas {captureSuggestions.tags.map((tag) => `#${tag}`).join(' ')}</>}</span><label><input type="checkbox" checked={useCaptureSuggestions} onChange={(event) => setUseCaptureSuggestions(event.target.checked)}/> Aplicar</label></div>}<div className="capture-footer"><span><Command size={12} /> Captura rápida</span><span>Sem pressão para organizar agora</span></div></form>
            <div className="overview-cards" aria-label="Resumo das atividades">
              <article className="overview-card overview-card-green"><span className="overview-icon"><CheckCheck size={19} /></span><div><strong>{queuedCount}</strong><span>Atividades na fila</span></div><span className="overview-caption">guardadas com você</span></article>
              <article className="overview-card overview-card-blue"><span className="overview-icon"><Target size={19} /></span><div><strong>{focusTasks.length}<small> / 3</small></strong><span>No seu foco</span></div><span className="overview-caption">você escolhe o ritmo</span></article>
              <article className="overview-card overview-card-lime"><span className="overview-icon"><Check size={19} /></span><div><strong>{completedCount}</strong><span>Concluídas</span></div><span className="overview-caption">cada passo conta</span></article>
            </div>
            <div className="home-dashboard-grid">
              <section className="home-tasks-panel">
                <div className="home-panel-heading"><div><div className="section-kicker">PARA ESTE MOMENTO</div><h2>Próximas tarefas <span className="soft-count">{focusTasks.length}/3</span></h2></div><button className="text-link" onClick={() => setTab('focus')}>Ver todas <ArrowRight size={15} /></button></div>
                <div className="home-focus-list">{focusTasks.length ? focusTasks.map((task, index) => <div className="focus-preview" key={task.id}><span className={`focus-number ${index === 0 ? 'current' : ''}`}>{String(index + 1).padStart(2, '0')}</span><TaskRow task={task} categories={profile.categories} tagCatalog={tagCatalog} compact isFocused onToggleFocus={toggleFocus} onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} /></div>) : <div className="empty-state inline-empty"><div className="empty-icon"><CheckCheck size={20} /></div><strong>Espaço para respirar.</strong><span>Escolha até três atividades na sua fila, sem pressa.</span></div>}</div>
              </section>
              <section className="home-progress-panel">
                <div className="home-panel-heading"><div><div className="section-kicker">SEM PRESSA</div><h2>Seu progresso</h2></div><span className="progress-period">Agora</span></div>
                <div className="progress-summary"><div className="progress-ring" style={{ '--progress': `${completionRate}%` }}><div><strong>{completionRate}%</strong><span>concluído</span></div></div><div className="progress-legend"><div><i className="legend-complete" /><span>Concluídas</span><strong>{completedCount}</strong></div><div><i className="legend-active" /><span>Em andamento</span><strong>{doingCount}</strong></div><div><i className="legend-inbox" /><span>Na entrada</span><strong>{inboxCount}</strong></div></div></div>
                <div className="progress-message"><span className="progress-message-mark"><Sparkles size={15} /></span><span>Progresso também é descobrir o seu próximo passo.</span></div>
              </section>
            </div>
            <div className="bottom-cards"><button className="bottom-card" onClick={() => { setTab('queue'); setFilter('Caixa de entrada') }}><span className="bottom-card-icon inbox-icon"><Inbox size={18} /></span><span className="bottom-card-copy"><strong>Caixa de entrada</strong><small>Ideias esperando um lugar</small></span><span className="bottom-card-count">{tasks.filter((task) => task.status === 'inbox').length}</span><ArrowRight size={16} className="bottom-card-arrow" /></button><button className="bottom-card" onClick={() => setTab('assistant')}><span className="bottom-card-icon assistant-icon"><Sparkles size={18} /></span><span className="bottom-card-copy"><strong>Precisa de clareza?</strong><small>Converse com seu assistente</small></span><ArrowRight size={16} className="bottom-card-arrow" /></button></div>
          </section>}

          {tab === 'focus' && <section className="standard-page focus-page"><div className="focus-title-row"><div className="page-title-block"><div className="page-icon focus-page-icon"><Target size={20} /></div><div className="date-overline">UM PASSO DE CADA VEZ</div><h1>Foco agora</h1><p>Até três escolhas suas para hoje. No seu ritmo, sem cobrança.</p></div><button className="primary-button focus-choose-button" onClick={() => setFocusPickerOpen(true)}><Plus size={16}/> Escolher atividades</button></div><div className="focus-summary"><span><Focus size={16} /> {focusTasks.length ? `${focusTasks.length} ${focusTasks.length === 1 ? 'escolha' : 'escolhas'} para este momento` : 'Você decide quando começar'}</span><span>Seu foco pode mudar.</span></div><div className="focus-list">{focusTasks.map((task, index) => <div className="focus-item" key={task.id}><div className={`focus-item-number ${index === 0 ? 'current' : ''}`}>{index + 1}</div><div className="focus-item-content"><div className="focus-item-meta"><span>{task.category || 'Entrada'}</span>{task.due_at && <span><CalendarDays size={13} />{dateLabel(task.due_at)}</span>}{task.estimated_minutes && <span><Clock3 size={13} />{task.estimated_minutes} min</span>}{task.status === 'waiting' && <span className="task-waiting-pill">Aguardando retorno</span>}</div><h3><button className="focus-detail-link" onClick={() => openTask(task)}>{task.title}</button></h3>{task.tags?.length > 0 && <div className="task-tags">{task.tags.map((tag) => <span className="task-tag" key={tag} style={{'--tag-color':tagCatalog.find((entry) => entry.name === tag)?.color || task.tag_colors?.[tag] || '#16985d'}}>{tag}</span>)}</div>}{task.notes && <p>{task.notes}</p>}{task.steps?.length > 0 && <div className="focus-step-preview">{task.steps.filter((step) => !step.done).length} passos restantes</div>}<div className="focus-item-actions">{task.status === 'waiting' ? <button className="primary-button small" onClick={() => openTask(task)}>Ver cobrança <ArrowRight size={15} /></button> : <button className="primary-button small" onClick={() => updateTask(task, { status: 'doing' })}>{task.status === 'doing' ? 'Em andamento' : 'Começar'}<ArrowRight size={15} /></button>}{task.status !== 'waiting' && <button className="quiet-button small-quiet" onClick={() => updateTask(task, { status: 'paused' })}>Deixar para depois</button>}<button className="quiet-button small-quiet" onClick={() => toggleFocus(task)}>Tirar do foco</button></div></div><button className="icon-button more-task" title="Mudar prioridade" onClick={() => promote(task)}><ArrowUpRight size={17} /></button></div>)}{focusTasks.length === 0 && <div className="empty-state focus-empty"><div className="empty-icon"><Target size={21} /></div><h3>Você escolhe o que entra aqui.</h3><p>Selecione atividades por esta janela. Você continua nesta tela e pode mudar de ideia depois.</p><button className="primary-button" onClick={() => setFocusPickerOpen(true)}>Escolher atividades <Plus size={15} /></button></div>}</div><div className="focus-reassurance"><span className="reassurance-sparkle"><Sparkles size={15} /></span><span><strong>Você não precisa fazer tudo.</strong> Escolher um próximo passo já conta.</span></div></section>}

          {tab === 'health' && <section className="standard-page health-page"><div className="queue-heading"><div><div className="date-overline">CUIDADO FLEXÍVEL COM VOCÊ</div><h1>Saúde</h1><p>Registre a água do seu jeito. Uma garrafa por vez já conta.</p></div></div><div className="water-dashboard"><section className="water-progress-card"><div className="water-progress-copy"><span className="section-kicker">HIDRATAÇÃO DE HOJE</span><h2>{(waterTotal/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} <small>L</small></h2><p>Meta de {(waterGoal/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} L · {todayWaterLogs.length} {todayWaterLogs.length===1?'registro':'registros'}</p><div className="water-progress-track"><span style={{width:`${waterProgress}%`}}/></div><strong>{waterProgress}% da sua meta</strong><button className="primary-button water-drink-button" onClick={saveWaterEntry} disabled={waterSaving}><GlassWater size={17}/>{waterSaving?'Registrando…':`Terminei minha garrafa (${Number(profile.settings?.bottle_ml||750).toLocaleString('pt-BR')} ml)`}</button><span className="water-reassurance">A meta é uma referência pessoal, sem cobrança.</span></div><WaterBody progress={waterProgress}/></section><section className="profile-card water-settings-card"><div className="profile-section-title"><div><strong>Configure do seu jeito</strong><span>Escolha sua meta, a capacidade da garrafa e os lembretes.</span></div></div><WaterReminder profile={profile} onChange={updatePreference} onEnable={enableNotifications}/></section></div><section className="water-history-card"><div className="home-panel-heading"><div><div className="section-kicker">HOJE</div><h2>Seus registros</h2></div><span className="progress-period">{todayWaterLogs.length} {todayWaterLogs.length===1?'garrafa':'garrafas'}</span></div>{todayWaterLogs.length ? <div className="water-log-list">{todayWaterLogs.map((log) => <div className="water-log-row" key={log.id}><span className="water-log-icon"><GlassWater size={16}/></span><span><strong>{Number(log.amount_ml).toLocaleString('pt-BR')} ml</strong><small>{new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(log.drank_at))}</small></span><Check size={16}/></div>)}</div> : <div className="water-empty">Quando terminar uma garrafa, toque em “Terminei minha garrafa”. O registro fica só para você.</div>}</section></section>}

          {tab === 'queue' && <section className="standard-page queue-page">
            <div className="queue-heading"><div><div className="date-overline">SEU ESPAÇO, SEM PRESSA</div><h1>Minha fila</h1><p>Tudo o que você trouxe para cá, reunido em um só lugar.</p></div><button className="primary-button" onClick={() => { setTab('home'); setTimeout(() => captureRef.current?.focus(), 0) }}><Plus size={17} /> Nova atividade</button></div>
            <div className="queue-tools"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na sua fila" aria-label="Buscar atividade" />{query && <button className="icon-button" onClick={() => setQuery('')}><X size={15} /></button>}</div>
              <div className="filter-group" aria-label="Filtrar atividades"><Filter size={15} />{['Tudo', 'Caixa de entrada', 'Em andamento', 'Aguardando retorno', 'Pausadas', 'Concluídas', 'Com lembrete', 'Sem prazo', ...profile.categories, ...new Set(tasks.flatMap((task) => task.tags || []).map((tag) => `Etiqueta:${tag}`))].map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? 'selected' : ''}`}>{item.startsWith('Etiqueta:') ? `#${item.slice(9)}` : item}</button>)}</div>
              <div className="queue-view-controls"><label>Ordenar por<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="data">Data mais próxima</option><option value="prioridade">Prioridade</option><option value="tempo">Menor duração</option></select></label><div className="view-switch" aria-label="Visualização"><button className={queueView === 'lista' ? 'active' : ''} onClick={() => setQueueView('lista')}><List size={14}/> Lista</button><button className={queueView === 'agenda' ? 'active' : ''} onClick={() => setQueueView('agenda')}><CalendarRange size={14} /> Agenda</button><button className={queueView === 'kanban' ? 'active' : ''} onClick={() => setQueueView('kanban')}><Columns3 size={14}/> Quadro</button></div></div>
            </div>
            <div className="queue-count">{visibleTasks.length} {visibleTasks.length === 1 ? 'atividade' : 'atividades'}<span>·</span>organizadas do seu jeito</div>
            {queueView === 'lista' && <div className="queue-list-groups"><section className="queue-backlog"><header><div><span className="section-kicker">SEM PRESSA PARA ORGANIZAR</span><h2>Backlog <span>{visibleTasks.filter((task) => task.status === 'inbox').length}</span></h2><p>Capturas esperando contexto. Abra uma atividade para definir quando e como ela entra na fila.</p></div></header>{visibleTasks.filter((task) => task.status === 'inbox').map((task) => <TaskRow key={task.id} task={task} categories={profile.categories} tagCatalog={tagCatalog} isFocused={task.focus_date === localDateString()} onToggleFocus={toggleFocus} onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} />)}</section><section className="queue-organized"><header><div><span className="section-kicker">PRÓXIMAS AÇÕES E ATIVIDADES</span><h2>Sua fila <span>{visibleTasks.filter((task) => task.status !== 'inbox').length}</span></h2></div></header>{visibleTasks.filter((task) => task.status !== 'inbox').map((task) => <TaskRow key={task.id} task={task} categories={profile.categories} tagCatalog={tagCatalog} isFocused={task.focus_date === localDateString()} onToggleFocus={toggleFocus} onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} />)}</section>{visibleTasks.length === 0 && <div className="empty-state queue-empty"><div className="empty-icon"><Inbox size={20} /></div><strong>{query ? 'Não encontrei essa atividade.' : 'Este espaço está vazio.'}</strong><span>{query ? 'Experimente buscar com outras palavras.' : 'Quando algo surgir, você pode guardar aqui.'}</span></div>}</div>}
            {queueView === 'agenda' && <div className="agenda-list">{agendaGroups.map((group) => <section className="agenda-group" key={group.key}><div className="agenda-day-heading"><CalendarDays size={16} /><h2>{group.label}</h2><span>{group.items.length}</span></div>{group.items.map((task) => <TaskRow key={task.id} task={task} categories={profile.categories} tagCatalog={tagCatalog} isFocused={task.focus_date === localDateString()} onToggleFocus={toggleFocus} onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} />)}</section>)}{agendaGroups.length === 0 && <div className="empty-state queue-empty"><div className="empty-icon"><CalendarDays size={20} /></div><strong>Nenhuma data nesta busca.</strong><span>Experimente limpar os filtros ou escolher a lista.</span></div>}</div>}
            {queueView === 'kanban' && <KanbanBoard tasks={visibleTasks} onOpen={openTask} onFocus={toggleFocus} onStatus={updateTask} tagCatalog={tagCatalog}/>}
          </section>}

          {tab === 'assistant' && <section className="standard-page assistant-page"><div className="assistant-heading"><div><div className="page-icon assistant-page-icon"><Sparkles size={19} /></div><div className="date-overline">UM ESPAÇO PARA PENSAR EM VOZ ALTA</div><h1>Assistente</h1><p>Peça ajuda para priorizar, organizar uma atividade ou capturar uma ideia.</p></div><span className="quiet-button"><Clock3 size={15} /> Histórico de 7 dias</span></div><div className="chat-card"><div className="chat-welcome"><div className="assistant-orb"><Sparkles size={19} /></div><h2>Por onde começamos?</h2><p>Escreva do seu jeito. Posso sugerir prioridades, mostrar o que está no backlog e abrir os detalhes de uma atividade.</p><div className="suggestion-row"><button onClick={() => setChatDraft('Organize minha fila')}>Me ajude a priorizar</button><button onClick={() => setChatDraft('O que está no backlog?')}>O que preciso organizar?</button><button onClick={() => setChatDraft('O que eu faço primeiro?')}>Qual o próximo passo?</button><button onClick={() => setChatDraft('Guardar: ')}>Guardar uma ideia</button></div></div><div className="chat-messages">{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : firstName.slice(0, 1).toUpperCase()}</div><div className="message-content"><span>{message.role === 'assistant' ? 'Seu assistente' : 'Você'}</span><p>{message.content}</p></div></div>)}<div ref={chatRef} /></div><form className="chat-input" onSubmit={replyToAssistant}><textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Escreva do seu jeito…" rows="1" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replyToAssistant(event) } }} /><div className="chat-input-footer"><span>Respostas locais, sem enviar suas atividades a serviços externos.</span><button className="send-button" disabled={!chatDraft.trim() || busy} aria-label="Enviar mensagem">{busy ? <span className="sending-dot" /> : <Send size={16} />}</button></div></form></div><div className="assistant-note"><Sparkles size={14} /><span>O assistente usa regras locais para organizar e sugerir próximos passos. Você decide o que aplicar.</span></div></section>}

          {tab === 'profile' && <section className="standard-page profile-page"><div className="date-overline">AJUSTE O ESPAÇO AO SEU JEITO</div><h1>Seu perfil</h1><p>Pequenas preferências para deixar o AGIRMENTE mais seu.</p><div className="profile-card"><div className="profile-card-heading"><div className="large-avatar">{(profileName || 'A').slice(0, 1).toUpperCase()}</div><div><strong>{profileName}</strong><span>{user?.email || 'Perfil local neste dispositivo'}</span></div><span className="quiet-button profile-edit-hint"><Settings2 size={15} /> Preferências</span></div><form onSubmit={saveName} className="profile-form"><label htmlFor="profile-name">Como gostaria de ser chamado?</label><div className="profile-input-row"><input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength="60" /><button className="secondary-button">Salvar nome</button></div></form><div className="profile-divider" /><div className="profile-section-title"><div><strong>Suas categorias</strong><span>Use as palavras que fazem sentido para você.</span></div></div><div className="category-list">{profile.categories.map((category) => <span key={category} className="category-chip">{category}</span>)}</div><form className="category-add" onSubmit={updateCategories}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Criar uma categoria" maxLength="32" /><button type="submit" disabled={!cleanText(newCategory)}><Plus size={15} /> Adicionar</button></form><div className="profile-divider" /><div className="profile-settings-row"><div><strong>Seu espaço de trabalho</strong><span>{supabaseReady ? 'Sincronização segura com sua conta Supabase' : 'Este navegador guarda seus dados localmente'}</span></div><span className={`connection-pill ${supabaseReady ? 'is-connected' : ''}`}><span />{supabaseReady ? 'Conectado' : 'Local'}</span></div>{supabaseReady && <button className="sign-out-button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sair da conta</button>}</div><TagCatalogManager tags={tagCatalog} tasks={tasks} onAdd={addTag} onColor={updateTagColor} onRemove={removeTag} />
            <section className="profile-card accessibility-card"><div className="profile-section-title"><div><strong>Aparência e acessibilidade</strong><span>Escolha o tema e ajuste a leitura ao que funciona para você.</span></div></div><label className="theme-setting">Aparência<select value={profile.settings?.appearance || 'system'} onChange={(event) => updatePreference('appearance',event.target.value)}><option value="system">Automática · acompanhar o sistema</option><option value="light">Claro</option><option value="dark">Escuro · verde profundo</option></select></label><label className="preference-toggle"><span><strong>Contraste reforçado</strong><small>Realça textos, bordas e controles.</small></span><input type="checkbox" checked={Boolean(profile.settings?.highContrast)} onChange={(event) => updatePreference('highContrast', event.target.checked)} /></label><label className="preference-toggle"><span><strong>Reduzir animações</strong><small>Diminui movimentos e transições na interface.</small></span><input type="checkbox" checked={Boolean(profile.settings?.reduceMotion)} onChange={(event) => updatePreference('reduceMotion', event.target.checked)} /></label><div className="notification-preference"><div><strong>Lembretes neste navegador</strong><small>{notificationPermission === 'granted' ? 'Notificações de área de trabalho ativadas.' : notificationPermission === 'denied' ? 'Permissão negada pelo navegador; os avisos aparecem no app.' : 'Ative para receber avisos quando o app estiver aberto.'}</small></div><button className="secondary-button" onClick={enableNotifications}>{notificationPermission === 'granted' ? 'Ativadas' : 'Ativar'}</button></div></section>
            <div className="privacy-note"><CircleHelp size={16} /><span>Seu jeito de pensar não precisa caber em um padrão. Você pode reorganizar suas categorias quando quiser.</span></div></section>}
        </>}
      </div>
      <footer className="app-footer"><span>AGIRMENTE</span><span>Seu jeito de pensar. Sua maneira de transformar.</span><button onClick={() => setTab('profile')}>Preferências de acessibilidade <ArrowRight size={13} /></button></footer>
    </main>
    <nav className="mobile-nav">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
    {selectedTask && <TaskDetailModal key={selectedTask.id} task={selectedTask} categories={profile.categories} tagCatalog={tagCatalog} onClose={() => setSelectedTaskId(null)} onSave={updateTask} onDelete={deleteTask} onSkip={skipOccurrence} onPostpone={postponeCharge} />}
    {focusPickerOpen && <FocusPicker tasks={activeTasks} focusedIds={new Set(focusTasks.map((task) => task.id))} onToggle={toggleFocus} onClose={() => setFocusPickerOpen(false)} tagCatalog={tagCatalog} />}
    {toast && <div className="toast"><span className="toast-icon"><Check size={14} /></span>{toast}{pendingDelete && <button className="toast-undo" onClick={undoDelete}>Desfazer</button>}{reminderTask && <><button className="toast-undo" onClick={() => snoozeReminder(10)}>10 min</button><button className="toast-undo" onClick={() => snoozeReminder(1440)}>Amanhã</button></>}<button className="toast-close" onClick={() => { setToast(''); setReminderTask(null) }}><X size={14} /></button></div>}
  </div>
}

export default App
