import { supabase, supabaseReady } from './supabase.js'

const STORAGE_KEY = 'agirmente:v1'
const chatKey = (userId) => `${STORAGE_KEY}:assistant:${userId || 'local'}`
const defaultProfile = () => ({ name: 'Alex', categories: ['Pessoal', 'Trabalho', 'Saúde', 'Ideias'], settings: { reduceMotion: false, highContrast: false, appearance: 'system', water_goal_ml: 2000, bottle_ml: 750, water_reminders: false, water_reminder_minutes: 120 } })
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
    if (saved) return { tasks: saved.tasks ?? starterTasks, waterLogs: saved.waterLogs ?? [], messages: (saved.messages ?? []).filter((m) => Date.now() - new Date(m.created_at).getTime() < 7 * 86400000), profile: { ...defaultProfile(), ...(saved.profile || {}), settings: { ...defaultProfile().settings, ...(saved.profile?.settings || {}) } } }
  } catch {}
  return { tasks: starterTasks, messages: [], profile: defaultProfile() }
}

let localState = getLocalState()
localState.waterLogs ||= []
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
  steps: Array.isArray(task.steps) ? task.steps : task.next_step ? [{ id: `legacy-${task.id}`, title: task.next_step, done: false }] : [],
  estimated_minutes: task.estimated_minutes || null,
  focus_date: task.focus_date || null,
  reminder_at: task.reminder_at || null,
  reminded_at: task.reminded_at || null,
  recurrence: task.recurrence || 'nenhuma',
  task_type: task.task_type || 'tarefa',
  assignee: task.assignee || '',
  tags: Array.isArray(task.tags) ? task.tags : [],
  tag_colors: task.tag_colors && typeof task.tag_colors === 'object' ? task.tag_colors : {},
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
    tag_colors: task.tag_colors && typeof task.tag_colors === 'object' ? task.tag_colors : {},
    follow_up_at: task.follow_up_at || null,
    status: statusToDatabase[status] || 'entrada',
    priority: priorityToDatabase[task.priority] || 'media',
    next_step: task.steps?.find((step) => !step.done)?.title || null,
    steps: Array.isArray(task.steps) ? task.steps : [],
    estimated_minutes: task.estimated_minutes || null,
    focus_date: task.focus_date || null,
    reminder_at: task.reminder_at || null,
    reminded_at: task.reminded_at || null,
    recurrence: task.recurrence || 'nenhuma',
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
  const [taskResult, eventResult, authResult, waterResult] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', userId).order('position', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('task_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
    supabase.from('water_logs').select('*').eq('user_id', userId).order('drank_at', { ascending: false }),
  ])
  const { data: rows, error } = taskResult
  const { data: eventRows, error: eventError } = eventResult
  const { data: authData, error: authError } = authResult
  const { data: waterRows, error: waterError } = waterResult
  if (error || eventError || authError || waterError) throw error || eventError || authError || waterError
  const historyByTask = (eventRows || []).reduce((history, event) => {
    history[event.task_id] ||= []
    history[event.task_id].push(event)
    return history
  }, {})
  const metadata = authData.user?.user_metadata || {}
  return {
    tasks: (rows || []).map((row) => mapTaskFromDatabase({ ...row, history: historyByTask[row.id] || [] })),
    waterLogs: waterRows || [],
    profile: { ...defaultProfile(), name: metadata.name || authData.user?.email?.split('@')[0] || '', categories: Array.isArray(metadata.categories) ? metadata.categories : defaultProfile().categories, settings: { ...defaultProfile().settings, ...(metadata.settings || {}) } },
    messages: readMessages(userId),
    mode: 'cloud',
  }
}

export async function saveWaterLog(amountMl, userId) {
  const entry = { user_id: userId, amount_ml: Number(amountMl), drank_at: new Date().toISOString() }
  if (supabaseReady) {
    const { data, error } = await supabase.from('water_logs').insert(entry).select().single()
    if (error) throw error
    return data
  }
  const stored = { ...entry, id: makeLocalId() }
  localState.waterLogs = [stored, ...(localState.waterLogs || [])]
  persist()
  return stored
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
    const { data, error } = await supabase.auth.updateUser({ data: { name: profile.name, categories: profile.categories, settings: profile.settings || defaultProfile().settings } })
    if (error) throw error
    return { name: data.user.user_metadata.name || '', categories: data.user.user_metadata.categories || [], settings: { ...defaultProfile().settings, ...(data.user.user_metadata.settings || {}) } }
  }
  localState.profile = profile
  persist()
  return profile
}
