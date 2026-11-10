import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, supabaseReady } from './supabase.js'
import { loadWorkspace, removeTask, saveMessage, saveProfile, saveTask } from './data.js'
import brandIcon from './assets/agirmente-app-icon.png'
import brandLogo from './assets/agirmente-horizontal-logo.png'
import {
  ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, ChevronDown,
  CircleDollarSign, CircleHelp, Clock3, Command, Compass, Filter, Focus, History, Inbox, Lightbulb,
  ListChecks, ListTodo, LogOut, MessageCircle, Mic, MoreHorizontal, Plus, Save, Search, Send, Settings2, Sparkles,
  Sun, Tag, Target, Trash2, UserRound, X,
} from 'lucide-react'

const navigation = [
  { id: 'home', label: 'Início', icon: Sun },
  { id: 'focus', label: 'Foco agora', icon: Target },
  { id: 'queue', label: 'Minha fila', icon: ListTodo },
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

function BrandMark() {
  return <img className="brand-symbol" src={brandIcon} alt="" aria-hidden="true" />
}

const inputDate = (value) => value ? new Date(value).toISOString().slice(0, 10) : ''
const dateFromInput = (value) => value ? new Date(`${value}T12:00:00`).toISOString() : null
const eventLabels = {
  criada: 'Atividade criada', iniciada: 'Atividade iniciada', pausada: 'Atividade pausada',
  retomada: 'Atividade retomada', aguardando_alguem: 'Aguardando retorno', cobranca_feita: 'Cobrança registrada',
  concluida: 'Atividade concluída', reaberta: 'Atividade reaberta', atualizada: 'Detalhes atualizados',
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

function TaskRow({ task, onStatus, onDelete, onPrioritize, onCategory, onOpen, categories = [], compact = false }) {
  const done = task.status === 'done'
  const isCharge = task.task_type === 'cobranca'
  return <article className={`task-row ${compact ? 'compact' : ''} ${done ? 'is-done' : ''}`}>
    <button className={`task-check ${done ? 'checked' : ''} ${isCharge ? 'task-check-charge' : ''}`} aria-label={isCharge ? 'Abrir detalhes da cobrança' : done ? 'Reabrir atividade' : 'Concluir atividade'} onClick={() => isCharge ? onOpen?.(task) : onStatus(task, { status: done ? 'next' : 'done' })}>{done ? <Check size={14} /> : isCharge ? <CircleDollarSign size={13} /> : null}</button>
    <div className="task-main"><button className="task-open-button" onClick={() => onOpen?.(task)}><span className="task-title-line"><span className="task-title">{task.title}</span>{task.priority === 1 && <span className="priority-dot" title="Prioridade alta" />}</span><ArrowUpRight size={14} className="task-open-icon" aria-hidden="true" /></button><div className="task-meta"><select className="category-select" aria-label={`Categoria: ${task.title}`} value={task.category || 'Entrada'} onChange={(event) => onCategory?.(task, event.target.value)}><option value="Entrada">Entrada</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{task.task_type === 'cobranca' && <span className="task-kind-pill"><CircleDollarSign size={12} /> Cobrança</span>}{task.status === 'waiting' && <span className="task-waiting-pill">Aguardando retorno</span>}{task.due_at && <><span className="meta-separator">·</span><span className={new Date(task.due_at).toDateString() === new Date().toDateString() ? 'due-today' : ''}><CalendarDays size={12} />{dateLabel(dateFromInput(inputDate(task.due_at)))}</span></>}{task.status === 'waiting' && task.follow_up_at && <><span className="meta-separator">·</span><span><History size={12} />Cobrar {dateLabel(task.follow_up_at)}</span></>}</div></div>
    <div className="task-actions">{task.status === 'paused' ? <button className="mini-action" onClick={() => onStatus(task, { status: 'next' })}>Retomar</button> : task.status !== 'done' && <button className="mini-action" onClick={() => onStatus(task, { status: 'paused' })}>Pausar</button>}<button className="icon-button subtle" title="Priorizar" onClick={() => onPrioritize(task)}><ArrowUpRight size={16} /></button><button className="icon-button subtle delete-action" title="Excluir" onClick={() => onDelete(task)}><Trash2 size={15} /></button></div>
  </article>
}

function TaskDetailModal({ task, categories, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({
    title: task.title || '', notes: task.notes || '', next_step: task.steps?.[0] || '', category: task.category || 'Entrada',
    status: task.status || 'inbox', priority: String(task.priority || 2), due_at: inputDate(task.due_at),
    task_type: task.task_type || 'tarefa', assignee: task.assignee || '', tags: (task.tags || []).join(', '), follow_up_at: inputDate(task.follow_up_at),
  }))
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
  async function commit(status = draft.status) {
    setSaving(true); setError('')
    const changes = {
      title: draft.title.trim(), notes: draft.notes.trim(), steps: draft.next_step.trim() ? [draft.next_step.trim()] : [],
      category: draft.category, status, priority: Number(draft.priority), due_at: dateFromInput(draft.due_at),
      task_type: draft.task_type, assignee: draft.assignee.trim(), tags: [...new Set(draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      follow_up_at: draft.task_type === 'cobranca' ? dateFromInput(draft.follow_up_at) : null,
    }
    if (status === 'done') changes.completed_at = new Date().toISOString()
    if (!changes.title) { setError('Dê um nome para esta atividade.'); setSaving(false); return }
    const result = await onSave(task, changes, updateNote.trim())
    setSaving(false)
    if (!result) { setError('Não consegui salvar agora. Tente novamente.'); return }
    setDraft((current) => ({ ...current, status }))
    setUpdateNote('')
    if (status === 'done') onClose()
  }
  async function save(event) { event?.preventDefault(); await commit() }
  async function registerCharge() { await commit('waiting') }
  async function finish() { await commit('done') }

  return <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <header className="detail-header"><div><span className="detail-eyebrow">DETALHES DA ATIVIDADE</span><h2 id="detail-title">Organize do seu jeito</h2><p>Atualize o contexto e deixe registrado o que aconteceu.</p></div><button className="icon-button detail-close" aria-label="Fechar detalhes" onClick={onClose}><X size={19} /></button></header>
      <form className="detail-form" onSubmit={save}>
        <div className="detail-fields">
          <label className="detail-field detail-wide">Nome da atividade<input autoFocus value={draft.title} onChange={(event) => change('title', event.target.value)} maxLength="180" /></label>
          <label className="detail-field">Tipo<select value={draft.task_type} onChange={(event) => change('task_type', event.target.value)}><option value="tarefa">Atividade</option><option value="cobranca">Cobrança</option></select></label>
          <label className="detail-field">Situação<select value={draft.status} onChange={(event) => change('status', event.target.value)}><option value="inbox">Caixa de entrada</option><option value="next">Próxima ação</option><option value="doing">Em andamento</option><option value="waiting">Aguardando retorno</option><option value="paused">Pausada</option>{(draft.task_type !== 'cobranca' || draft.status === 'done') && <option value="done">Concluída</option>}</select></label>
          <label className="detail-field">Categoria<select value={draft.category} onChange={(event) => change('category', event.target.value)}><option value="Entrada">Entrada</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
          <label className="detail-field">Prioridade<select value={draft.priority} onChange={(event) => change('priority', event.target.value)}><option value="1">Alta</option><option value="2">Média</option><option value="3">Baixa</option></select></label>
          <label className="detail-field">Previsão de conclusão<input type="date" value={draft.due_at} onChange={(event) => change('due_at', event.target.value)} /></label>
          <label className="detail-field">Responsável<input value={draft.assignee} onChange={(event) => change('assignee', event.target.value)} placeholder="Você ou outra pessoa" maxLength="100" /></label>
          <label className="detail-field detail-wide"><span className="field-label-icon"><Tag size={14} /> Etiquetas</span><input value={draft.tags} onChange={(event) => change('tags', event.target.value)} placeholder="Ex.: cliente, financeiro, urgente" /><span>Separe por vírgulas.</span></label>
          {draft.task_type === 'cobranca' && <label className="detail-field detail-wide follow-up-field"><span className="field-label-icon"><History size={15} /> Próxima data para cobrar</span><input type="date" value={draft.follow_up_at} onChange={(event) => change('follow_up_at', event.target.value)} /><span>A cobrança continua aberta e volta ao foco nessa data.</span></label>}
          <label className="detail-field detail-wide"><span className="field-label-icon"><ListChecks size={14} /> Próximo passo</span><input value={draft.next_step} onChange={(event) => change('next_step', event.target.value)} placeholder="Uma ação pequena que ajude a avançar" maxLength="180" /></label>
          <label className="detail-field detail-wide">Mais informações<textarea value={draft.notes} onChange={(event) => change('notes', event.target.value)} rows="4" placeholder="Contexto, links, detalhes para lembrar…" /></label>
        </div>
        <section className="detail-history"><div className="detail-section-heading"><span className="detail-section-icon"><History size={16} /></span><div><h3>Histórico de atualizações</h3><p>Um registro simples do que mudou.</p></div></div>
          <label className="detail-field detail-wide update-note-field">Adicionar uma atualização<textarea value={updateNote} onChange={(event) => setUpdateNote(event.target.value)} rows="2" placeholder="Ex.: Falei com a pessoa; ela vai responder até sexta…" /></label>
          <div className="timeline">{(task.history || []).length ? task.history.map((event) => <article className="timeline-entry" key={event.id}><span className="timeline-dot" /><div><div className="timeline-title">{eventLabels[event.event_type] || 'Atualização'}<time>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.created_at))}</time></div>{event.note && <p>{event.note}</p>}</div></article>) : <p className="timeline-empty">As próximas mudanças aparecerão aqui.</p>}</div>
        </section>
        {error && <div className="detail-error" role="alert">{error}</div>}
        <footer className="detail-footer"><button type="button" className="detail-delete" onClick={() => onDelete(task)}><Trash2 size={15} /> Excluir</button><div className="detail-footer-actions"><button type="button" className="detail-cancel" onClick={onClose}>Fechar</button>{draft.task_type === 'cobranca' && draft.status !== 'done' && <button type="button" className="detail-charge" onClick={registerCharge} disabled={saving}><History size={15} /> Registrar cobrança</button>}<button className="primary-button detail-save" disabled={saving}>{saving ? 'Salvando…' : <><Save size={15} /> Salvar alterações</>}</button>{draft.task_type === 'cobranca' && draft.status !== 'done' && <button type="button" className="detail-finish" onClick={finish} disabled={saving}><Check size={15} /> Concluir e arquivar</button>}</div></footer>
      </form>
    </section>
  </div>
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(supabaseReady)
  const [tab, setTab] = useState('home')
  const [tasks, setTasks] = useState([])
  const [profile, setProfile] = useState({ name: 'Alex', categories: ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'] })
  const [messages, setMessages] = useState([])
  const [capture, setCapture] = useState('')
  const [filter, setFilter] = useState('Tudo')
  const [query, setQuery] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [toast, setToast] = useState('')
  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [busy, setBusy] = useState(false)
  const [profileName, setProfileName] = useState('Alex')
  const [newCategory, setNewCategory] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const captureRef = useRef(null)
  const chatRef = useRef(null)

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
      setTasks(workspace.tasks); setMessages(workspace.messages); setProfile(workspace.profile); setProfileName(workspace.profile.name || user?.email?.split('@')[0] || 'Alex')
    }).catch((error) => showError(error)).finally(() => { if (alive) setLoadingWorkspace(false) })
    return () => { alive = false }
  }, [user?.id])

  useEffect(() => { if (tab === 'assistant') chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, tab])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer) }, [toast])

  function showError(error) { setToast(error?.message || 'Não foi possível salvar agora. Tente de novo.') }
  async function addTask(raw, category = 'Entrada') {
    const title = cleanText(raw)
    if (!title) return null
    const task = { id: makeId(), title, category, task_type: 'tarefa', assignee: '', tags: [], follow_up_at: null, status: 'inbox', priority: 3, due_at: null, notes: '', steps: [], history: [], created_at: new Date().toISOString() }
    try { const stored = await saveTask(task, user?.id, { event_type: 'criada', note: 'Atividade adicionada à fila.' }); setTasks((items) => [stored, ...items]); return stored } catch (error) { showError(error); return null }
  }
  async function updateTask(task, changes, activityNote = '') {
    const updated = { ...task, ...changes }
    let eventType = 'atualizada'
    if (changes.status === 'done') eventType = 'concluida'
    else if (task.status === 'done' && changes.status) eventType = 'reaberta'
    else if (changes.status === 'waiting') eventType = updated.task_type === 'cobranca' ? 'cobranca_feita' : 'aguardando_alguem'
    else if (task.status === 'waiting' && changes.status) eventType = 'retomada'
    else if (changes.status === 'paused') eventType = 'pausada'
    else if (changes.status === 'doing') eventType = 'iniciada'
    const defaultNote = eventType === 'cobranca_feita' ? 'Cobrança registrada; aguardando retorno.' : eventType === 'concluida' ? 'Atividade concluída e arquivada.' : eventType === 'pausada' ? 'Atividade pausada.' : eventType === 'iniciada' ? 'Atividade iniciada.' : eventType === 'retomada' ? 'Atividade retomada.' : eventType === 'reaberta' ? 'Atividade reaberta.' : eventType === 'aguardando_alguem' ? 'Atividade marcada como aguardando retorno.' : 'Detalhes da atividade atualizados.'
    try {
      const stored = await saveTask(updated, user?.id, { event_type: eventType, note: activityNote || defaultNote, details: { fields: Object.keys(changes), status: updated.status } })
      setTasks((items) => items.map((item) => item.id === task.id ? stored : item))
      setToast(eventType === 'concluida' ? 'Concluída e arquivada. Feito no seu tempo.' : eventType === 'cobranca_feita' ? 'Cobrança registrada. A atividade continua aberta para o próximo retorno.' : eventType === 'pausada' ? 'Tudo bem pausar. Você pode retomar quando quiser.' : eventType === 'retomada' ? 'Atividade de volta à fila.' : 'Atividade atualizada.')
      return stored
    } catch (error) { showError(error); return null }
  }
  async function deleteTask(task) {
    try { await removeTask(task.id); setTasks((items) => items.filter((item) => item.id !== task.id)); setToast('Atividade removida.') } catch (error) { showError(error) }
  }
  async function addToToday(task) { await updateTask(task, { status: 'next', priority: 1 }) }
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'done'), [tasks])
  const focusTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return activeTasks.filter((task) => task.status !== 'paused' && !(task.status === 'waiting' && task.follow_up_at && inputDate(task.follow_up_at) > today))
      .sort((a, b) => a.priority - b.priority || (a.follow_up_at || a.due_at || '9999').localeCompare(b.follow_up_at || b.due_at || '9999')).slice(0, 3)
  }, [activeTasks])
  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const searchable = [task.title, task.notes, task.assignee, ...(task.tags || [])].join(' ').toLocaleLowerCase('pt-BR')
    const matchesQuery = searchable.includes(query.toLocaleLowerCase('pt-BR'))
    const matchesFilter = filter === 'Tudo' || (filter === 'Caixa de entrada' ? task.status === 'inbox' : filter === 'Em andamento' ? task.status === 'doing' : filter === 'Aguardando retorno' ? task.status === 'waiting' : filter === 'Pausadas' ? task.status === 'paused' : filter === 'Concluídas' ? task.status === 'done' : task.category === filter)
    return matchesQuery && matchesFilter
  }), [tasks, query, filter])
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  function openTask(task) { setSelectedTaskId(task.id) }

  async function handleCapture(event) {
    event?.preventDefault()
    const task = await addTask(capture)
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
      if (/^(adiciona|adicionar|cria|criar|anota|anotar|lembra|lembrar)/.test(text)) {
        const title = content.replace(/^(adiciona(r)?|cria(r)?|anota(r)?|lembra(r)?)(\s+(uma tarefa|uma atividade|na fila|pra fila|para a fila))?\s*/i, '')
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
      } else if (/o que (eu )?(faço|faco|começo|comeco)|por onde começo|foco/.test(text)) {
        answer = focusTasks.length ? `Se ajudar, seu próximo passo pode ser: “${focusTasks[0].title}”. Quer que eu divida em uma ação menor?` : 'Sua lista está tranquila por agora. Você pode capturar qualquer coisa que esteja na cabeça.'
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

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setTab('home')}><BrandMark /><span className="brand-word">agirmente</span></button>
      <button className="capture-shortcut" onClick={() => { setTab('home'); setTimeout(() => captureRef.current?.focus(), 0) }}><Plus size={17} /><span>Capturar pensamento</span><kbd>⌘ K</kbd></button>
      <div className="nav-label">ESPAÇO</div>
      <nav className="main-nav">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18} strokeWidth={tab === id ? 2.1 : 1.8} /><span>{label}</span>{id === 'queue' && queuedCount > 0 && <span className="nav-count">{queuedCount}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="weekly-card"><div className="weekly-icon"><Lightbulb size={17} /></div><strong>Não precisa resolver tudo agora.</strong><span>Um próximo passo já é um começo.</span></div><button className="nav-item profile-link" onClick={() => setTab('profile')}><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span>{profile.name || firstName}</span><MoreHorizontal size={17} /></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><BrandMark /> agirmente</div><div className="breadcrumb"><span>Espaço pessoal</span><span className="breadcrumb-slash">/</span><strong>{currentNavigation?.label}</strong></div><div className="topbar-actions"><span className={`connection-status ${supabaseReady ? 'cloud' : ''}`}><span className="status-dot" />{supabaseReady ? 'Sincronizado' : 'Salvo neste dispositivo'}</span><button className="icon-button notification-button" title="Notificações"><Bell size={17} /><i /></button><button className="top-avatar" onClick={() => setTab('profile')}>{firstName.slice(0, 1).toUpperCase()}</button></div></header>
      {!supabaseReady && <div className="local-banner"><span>Modo local: suas informações ficam salvas neste navegador.</span><button onClick={() => setTab('profile')}>Ver perfil <ArrowRight size={14} /></button></div>}
      <div className="page-content">
        {loadingWorkspace ? <div className="page-loading">Organizando seu espaço…</div> : <>
          {tab === 'home' && <section className="home-page">
            <div className="home-heading"><div className="home-greeting"><span className="greeting-icon"><Sun size={25} /></span><div><div className="date-overline">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div><h1>{greeting()}, {firstName}<span className="heading-period">.</span></h1><p>Vamos organizar seu dia do seu jeito.</p></div></div><button className="quiet-button" onClick={() => setTab('focus')}><Compass size={16} /> Encontrar meu foco <ArrowRight size={15} /></button></div>
            <form className="capture-card" onSubmit={handleCapture}><div className="capture-top"><span className="capture-glyph"><Sparkles size={18} /></span><div><strong>Tire da cabeça, coloque aqui.</strong><span>Uma ideia, uma tarefa, qualquer coisa.</span></div></div><div className="capture-input-row"><input ref={captureRef} value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="O que está passando pela sua cabeça?" aria-label="Capturar uma atividade"/><button type="button" className="voice-button" title="Capturar por voz" onClick={toggleVoice}><Mic size={17} /></button><button type="submit" className="capture-submit" disabled={!capture.trim()}>Guardar <ArrowRight size={15} /></button></div><div className="capture-footer"><span><Command size={12} /> Captura rápida</span><span>Sem pressão para organizar agora</span></div></form>
            <div className="overview-cards" aria-label="Resumo das atividades">
              <article className="overview-card overview-card-green"><span className="overview-icon"><CheckCheck size={19} /></span><div><strong>{queuedCount}</strong><span>Atividades na fila</span></div><span className="overview-caption">guardadas com você</span></article>
              <article className="overview-card overview-card-blue"><span className="overview-icon"><Target size={19} /></span><div><strong>{focusTasks.length}<small> / 3</small></strong><span>No seu foco</span></div><span className="overview-caption">você escolhe o ritmo</span></article>
              <article className="overview-card overview-card-lime"><span className="overview-icon"><Check size={19} /></span><div><strong>{completedCount}</strong><span>Concluídas</span></div><span className="overview-caption">cada passo conta</span></article>
            </div>
            <div className="home-dashboard-grid">
              <section className="home-tasks-panel">
                <div className="home-panel-heading"><div><div className="section-kicker">PARA ESTE MOMENTO</div><h2>Próximas tarefas <span className="soft-count">{focusTasks.length}/3</span></h2></div><button className="text-link" onClick={() => setTab('focus')}>Ver todas <ArrowRight size={15} /></button></div>
                <div className="home-focus-list">{focusTasks.length ? focusTasks.slice(0, 3).map((task, index) => <div className="focus-preview" key={task.id}><span className={`focus-number ${index === 0 ? 'current' : ''}`}>{String(index + 1).padStart(2, '0')}</span><TaskRow task={task} categories={profile.categories} compact onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} /></div>) : <div className="empty-state inline-empty"><div className="empty-icon"><CheckCheck size={20} /></div><strong>Espaço para respirar.</strong><span>Nenhuma atividade precisa do seu foco agora.</span></div>}</div>
              </section>
              <section className="home-progress-panel">
                <div className="home-panel-heading"><div><div className="section-kicker">SEM PRESSA</div><h2>Seu progresso</h2></div><span className="progress-period">Agora</span></div>
                <div className="progress-summary"><div className="progress-ring" style={{ '--progress': `${completionRate}%` }}><div><strong>{completionRate}%</strong><span>concluído</span></div></div><div className="progress-legend"><div><i className="legend-complete" /><span>Concluídas</span><strong>{completedCount}</strong></div><div><i className="legend-active" /><span>Em andamento</span><strong>{doingCount}</strong></div><div><i className="legend-inbox" /><span>Na entrada</span><strong>{inboxCount}</strong></div></div></div>
                <div className="progress-message"><span className="progress-message-mark"><Sparkles size={15} /></span><span>Progresso também é descobrir o seu próximo passo.</span></div>
              </section>
            </div>
            <div className="bottom-cards"><button className="bottom-card" onClick={() => { setTab('queue'); setFilter('Caixa de entrada') }}><span className="bottom-card-icon inbox-icon"><Inbox size={18} /></span><span className="bottom-card-copy"><strong>Caixa de entrada</strong><small>Ideias esperando um lugar</small></span><span className="bottom-card-count">{tasks.filter((task) => task.status === 'inbox').length}</span><ArrowRight size={16} className="bottom-card-arrow" /></button><button className="bottom-card" onClick={() => setTab('assistant')}><span className="bottom-card-icon assistant-icon"><Sparkles size={18} /></span><span className="bottom-card-copy"><strong>Precisa de clareza?</strong><small>Converse com seu assistente</small></span><ArrowRight size={16} className="bottom-card-arrow" /></button></div>
          </section>}

          {tab === 'focus' && <section className="standard-page focus-page"><div className="page-title-block"><div className="page-icon focus-page-icon"><Target size={20} /></div><div className="date-overline">UM PASSO DE CADA VEZ</div><h1>Foco agora</h1><p>Até três coisas. No seu ritmo, sem cobrança.</p></div><div className="focus-summary"><span><Focus size={16} /> {focusTasks.length ? `${focusTasks.length} ${focusTasks.length === 1 ? 'escolha' : 'escolhas'} para este momento` : 'Você decide quando começar'}</span><span>Seu foco pode mudar.</span></div><div className="focus-list">{focusTasks.map((task, index) => <div className="focus-item" key={task.id}><div className={`focus-item-number ${index === 0 ? 'current' : ''}`}>{index + 1}</div><div className="focus-item-content"><div className="focus-item-meta"><span>{task.category || 'Entrada'}</span>{task.due_at && <span><CalendarDays size={13} />{dateLabel(task.due_at)}</span>}{task.status === 'waiting' && <span className="task-waiting-pill">Aguardando retorno</span>}</div><h3><button className="focus-detail-link" onClick={() => openTask(task)}>{task.title}</button></h3>{task.notes && <p>{task.notes}</p>}<div className="focus-item-actions">{task.status === 'waiting' ? <button className="primary-button small" onClick={() => openTask(task)}>Ver cobrança <ArrowRight size={15} /></button> : <button className="primary-button small" onClick={() => updateTask(task, { status: 'doing' })}>{task.status === 'doing' ? 'Em andamento' : 'Começar'}<ArrowRight size={15} /></button>}{task.status !== 'waiting' && <button className="quiet-button small-quiet" onClick={() => updateTask(task, { status: 'paused' })}>Deixar para depois</button>}</div></div><button className="icon-button more-task" title="Mudar prioridade" onClick={() => promote(task)}><ArrowUpRight size={17} /></button></div>)}{focusTasks.length === 0 && <div className="empty-state focus-empty"><div className="empty-icon"><Sun size={21} /></div><h3>Nada precisa acontecer agora.</h3><p>Esse espaço está livre. Quando quiser, encontre algo na sua fila.</p><button className="primary-button" onClick={() => setTab('queue')}>Abrir minha fila <ArrowRight size={15} /></button></div>}</div><div className="focus-reassurance"><span className="reassurance-sparkle"><Sparkles size={15} /></span><span><strong>Você não precisa fazer tudo.</strong> Escolher um próximo passo já conta.</span></div></section>}

          {tab === 'queue' && <section className="standard-page queue-page"><div className="queue-heading"><div><div className="date-overline">SEU ESPAÇO, SEM PRESSA</div><h1>Minha fila</h1><p>Tudo o que você trouxe para cá, reunido em um só lugar.</p></div><button className="primary-button" onClick={() => { setTab('home'); setTimeout(() => captureRef.current?.focus(), 0) }}><Plus size={17} /> Nova atividade</button></div><div className="queue-tools"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na sua fila" aria-label="Buscar atividade" />{query && <button className="icon-button" onClick={() => setQuery('')}><X size={15} /></button>}</div><div className="filter-group" aria-label="Filtrar atividades"><Filter size={15} />{['Tudo', 'Caixa de entrada', 'Em andamento', 'Aguardando retorno', 'Pausadas', 'Concluídas', ...profile.categories].map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? 'selected' : ''}`}>{item}</button>)}</div></div><div className="queue-count">{visibleTasks.length} {visibleTasks.length === 1 ? 'atividade' : 'atividades'}<span>·</span>organizadas do seu jeito</div><div className="queue-list">{visibleTasks.map((task) => <TaskRow key={task.id} task={task} categories={profile.categories} onOpen={openTask} onStatus={updateTask} onDelete={deleteTask} onPrioritize={promote} onCategory={(item, category) => updateTask(item, { category })} />)}{visibleTasks.length === 0 && <div className="empty-state queue-empty"><div className="empty-icon"><Inbox size={20} /></div><strong>{query ? 'Não encontrei essa atividade.' : 'Este espaço está vazio.'}</strong><span>{query ? 'Experimente buscar com outras palavras.' : 'Quando algo surgir, você pode guardar aqui.'}</span></div>}</div></section>}

          {tab === 'assistant' && <section className="standard-page assistant-page"><div className="assistant-heading"><div><div className="page-icon assistant-page-icon"><Sparkles size={19} /></div><div className="date-overline">UM ESPAÇO PARA PENSAR EM VOZ ALTA</div><h1>Assistente</h1><p>Organize as ideias conversando. Sem respostas certas.</p></div><button className="quiet-button"><Clock3 size={15} /> Últimos 7 dias <ChevronDown size={14} /></button></div><div className="chat-card"><div className="chat-welcome"><div className="assistant-orb"><Sparkles size={19} /></div><h2>Por onde começamos?</h2><p>Você pode me contar o que está pesando, pedir para guardar uma ideia ou descobrir seu próximo passo.</p><div className="suggestion-row"><button onClick={() => setChatDraft('O que eu faço primeiro?')}>O que eu faço primeiro?</button><button onClick={() => setChatDraft('Adiciona na fila: ')}>Guardar uma atividade</button><button onClick={() => setChatDraft('Estou com muita coisa na cabeça')}>Estou com muita coisa na cabeça</button></div></div><div className="chat-messages">{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : firstName.slice(0, 1).toUpperCase()}</div><div className="message-content"><span>{message.role === 'assistant' ? 'Seu assistente' : 'Você'}</span><p>{message.content}</p></div></div>)}<div ref={chatRef} /></div><form className="chat-input" onSubmit={replyToAssistant}><textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Escreva do seu jeito…" rows="1" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replyToAssistant(event) } }} /><div className="chat-input-footer"><span>Seu espaço é privado e sem julgamentos.</span><button className="send-button" disabled={!chatDraft.trim() || busy} aria-label="Enviar mensagem">{busy ? <span className="sending-dot" /> : <Send size={16} />}</button></div></form></div><div className="assistant-note"><Sparkles size={14} /><span>Respostas simples por enquanto. A inteligência do assistente pode evoluir com você.</span></div></section>}

          {tab === 'profile' && <section className="standard-page profile-page"><div className="date-overline">AJUSTE O ESPAÇO AO SEU JEITO</div><h1>Seu perfil</h1><p>Pequenas preferências para deixar o AGIRMENTE mais seu.</p><div className="profile-card"><div className="profile-card-heading"><div className="large-avatar">{(profileName || 'A').slice(0, 1).toUpperCase()}</div><div><strong>{profileName}</strong><span>{user?.email || 'Perfil local neste dispositivo'}</span></div><button className="quiet-button profile-edit-hint"><Settings2 size={15} /> Preferências</button></div><form onSubmit={saveName} className="profile-form"><label htmlFor="profile-name">Como gostaria de ser chamado?</label><div className="profile-input-row"><input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength="60" /><button className="secondary-button">Salvar nome</button></div></form><div className="profile-divider" /><div className="profile-section-title"><div><strong>Suas categorias</strong><span>Use as palavras que fazem sentido para você.</span></div></div><div className="category-list">{profile.categories.map((category) => <span key={category} className="category-chip">{category}</span>)}</div><form className="category-add" onSubmit={updateCategories}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Criar uma categoria" maxLength="32" /><button type="submit" disabled={!cleanText(newCategory)}><Plus size={15} /> Adicionar</button></form><div className="profile-divider" /><div className="profile-settings-row"><div><strong>Seu espaço de trabalho</strong><span>{supabaseReady ? 'Sincronização segura com sua conta Supabase' : 'Este navegador guarda seus dados localmente'}</span></div><span className={`connection-pill ${supabaseReady ? 'is-connected' : ''}`}><span />{supabaseReady ? 'Conectado' : 'Local'}</span></div>{supabaseReady && <button className="sign-out-button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sair da conta</button>}</div><div className="privacy-note"><CircleHelp size={16} /><span>Seu jeito de pensar não precisa caber em um padrão. Você pode reorganizar suas categorias quando quiser.</span></div></section>}
        </>}
      </div>
      <footer className="app-footer"><span>AGIRMENTE</span><span>Seu jeito de pensar. Sua maneira de transformar.</span><button onClick={() => setTab('profile')}>Preferências de acessibilidade <ArrowRight size={13} /></button></footer>
    </main>
    <nav className="mobile-nav">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
    {selectedTask && <TaskDetailModal key={selectedTask.id} task={selectedTask} categories={profile.categories} onClose={() => setSelectedTaskId(null)} onSave={updateTask} onDelete={deleteTask} />}
    {toast && <div className="toast"><span className="toast-icon"><Check size={14} /></span>{toast}<button className="toast-close" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>
}

export default App
