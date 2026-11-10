import { supabase, supabaseReady } from './supabase.js'

const STORAGE_KEY = 'agirmente:v1'
const chatKey = (userId) => `${STORAGE_KEY}:assistant:${userId || 'local'}`
const now = new Date()
const later = (days) => new Date(now.getTime() + days * 86400000).toISOString()

const starterTasks = [
  { id: 'welcome-1', title: 'Separar 10 minutos para organizar a semana', category: 'Pessoal', status: 'next', priority: 1, due_at: later(0), notes: '', steps: [], created_at: later(-1) },
  { id: 'welcome-2', title: 'Enviar aquela mensagem que está esperando', category: 'Pessoal', status: 'next', priority: 2, due_at: null, notes: '', steps: [], created_at: later(-2) },
  { id: 'welcome-3', title: 'Pesquisar opções para o próximo projeto', category: 'Trabalho', status: 'paused', priority: 3, due_at: later(2), notes: '', steps: ['Anotar o que preciso descobrir'], created_at: later(-3) },
]

function getLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved) return { tasks: saved.tasks ?? starterTasks, messages: (saved.messages ?? []).filter((m) => Date.now() - new Date(m.created_at).getTime() < 7 * 86400000), profile: saved.profile ?? { name: 'Alex', categories: ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'] } }
  } catch {}
  return { tasks: starterTasks, messages: [], profile: { name: 'Alex', categories: ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'] } }
}

let localState = getLocalState()
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(localState))
const readMessages = (userId) => {
  try { return (JSON.parse(localStorage.getItem(chatKey(userId))) ?? []).filter((message) => Date.now() - new Date(message.created_at).getTime() < 7 * 86400000) } catch { return [] }
}

const statusToDatabase = { inbox: 'entrada', next: 'proxima_acao', doing: 'em_andamento', waiting: 'aguardando_alguem', paused: 'pausada', done: 'concluida' }
const statusFromDatabase = { entrada: 'inbox', proxima_acao: 'next', em_andamento: 'doing', aguardando_alguem: 'waiting', pausada: 'paused', concluida: 'done' }
const priorityToDatabase = { 1: 'alta', 2: 'media', 3: 'baixa' }
const mapTaskFromDatabase = (task) => ({
  ...task,
  category: task.category || 'Entrada',
  status: statusFromDatabase[task.status] || 'inbox',
  priority: task.priority === 'urgente' || task.priority === 'alta' ? 1 : task.priority === 'baixa' ? 3 : 2,
  notes: task.description || '',
  steps: task.next_step ? [task.next_step] : [],
  task_type: task.task_type || 'tarefa',
  assignee: task.assignee || '',
  tags: Array.isArray(task.tags) ? task.tags : [],
  follow_up_at: task.follow_up_at || null,
  history: task.history || [],
})

function mapTaskToDatabase(task, userId) {
  const status = task.status || 'inbox'
  const timestamp = new Date().toISOString()
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    description: task.notes || null,
    category: task.category || 'Entrada',
    task_type: task.task_type || 'tarefa',
    assignee: task.assignee || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    follow_up_at: task.follow_up_at || null,
    status: statusToDatabase[status] || 'entrada',
    priority: priorityToDatabase[task.priority] || 'media',
    next_step: task.steps?.[0] || null,
    due_at: task.due_at || null,
    started_at: status === 'doing' ? task.started_at || timestamp : task.started_at || null,
    paused_at: status === 'paused' ? task.paused_at || timestamp : null,
    completed_at: status === 'done' ? task.completed_at || timestamp : null,
    position: task.position || 0,
    created_at: task.created_at || timestamp,
    updated_at: timestamp,
  }
}

export async function loadWorkspace(userId) {
  if (!supabaseReady) return { ...localState, mode: 'local' }
  const [{ data: rows, error }, { data: eventRows, error: eventError }, { data: authData, error: authError }] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', userId).order('position', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('task_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])
  if (error || eventError || authError) throw error || eventError || authError
  const historyByTask = (eventRows || []).reduce((history, event) => {
    history[event.task_id] ||= []
    history[event.task_id].push(event)
    return history
  }, {})
  const metadata = authData.user?.user_metadata || {}
  return {
    tasks: (rows || []).map((row) => mapTaskFromDatabase({ ...row, history: historyByTask[row.id] || [] })),
    profile: { name: metadata.name || authData.user?.email?.split('@')[0] || '', categories: Array.isArray(metadata.categories) ? metadata.categories : ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'] },
    messages: readMessages(userId),
    mode: 'cloud',
  }
}

export async function saveTask(task, userId, activityEvent = null) {
  const complete = { ...task, updated_at: new Date().toISOString() }
  if (supabaseReady) {
    const { data, error } = await supabase.from('tasks').upsert(mapTaskToDatabase(complete, userId)).select().single()
    if (error) throw error
    let history = task.history || []
    if (activityEvent) {
      const { data: event, error: eventError } = await supabase.from('task_events').insert({
        task_id: complete.id,
        user_id: userId,
        event_type: activityEvent.event_type || 'atualizada',
        note: activityEvent.note || null,
        details: activityEvent.details || {},
      }).select().single()
      if (eventError) throw eventError
      history = [event, ...history]
    }
    return mapTaskFromDatabase({ ...data, history })
  }
  const index = localState.tasks.findIndex((item) => item.id === complete.id)
  let history = complete.history || []
  if (activityEvent) history = [{ id: makeLocalId(), ...activityEvent, created_at: new Date().toISOString() }, ...history]
  const stored = { ...complete, history }
  localState.tasks = index < 0 ? [stored, ...localState.tasks] : localState.tasks.map((item) => item.id === complete.id ? stored : item)
  persist()
  return stored
}

const makeLocalId = () => globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(16).slice(2)}`

export async function removeTask(id) {
  if (supabaseReady) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
    return
  }
  localState.tasks = localState.tasks.filter((item) => item.id !== id)
  persist()
}

export async function saveMessage(message, userId) {
  const complete = { ...message, id: message.id || crypto.randomUUID(), user_id: userId, created_at: new Date().toISOString() }
  const messages = supabaseReady ? readMessages(userId) : localState.messages
  const updated = [...messages, complete].filter((item) => Date.now() - new Date(item.created_at).getTime() < 7 * 86400000)
  if (supabaseReady) localStorage.setItem(chatKey(userId), JSON.stringify(updated))
  else { localState.messages = updated; persist() }
  return complete
}

export async function saveProfile(profile) {
  if (supabaseReady) {
    const { data, error } = await supabase.auth.updateUser({ data: { name: profile.name, categories: profile.categories } })
    if (error) throw error
    return { name: data.user.user_metadata.name || '', categories: data.user.user_metadata.categories || [] }
  }
  localState.profile = profile
  persist()
  return profile
}
