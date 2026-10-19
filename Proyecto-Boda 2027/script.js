const defaultCatalog = {
  'Summit Hotel': [
    { name: 'Paquete Esmeralda', price: 65, max: 80, includes: ['Cena de 3 tiempos', 'Brindis', 'Mesa de postres'] },
    { name: 'Paquete Gran Salón', price: 82, max: 150, includes: ['Cena de 3 tiempos', 'Barra por 4 horas', 'Decoración básica', 'Suite nupcial'] }
  ],
  'Otra opción por cotizar': [{ name: 'Paquete personalizado', price: 0, max: 0, includes: ['Edita precio y capacidad', 'Añade notas de cotización'] }]
};

const storageKey = 'boda2027-tracker';
const initialState = { venue: 'Summit Hotel', packageIndex: 0, price: 65, plannedGuests: 60, maxGuests: 80, notes: '', guests: [], presets: [], catalog: defaultCatalog };
let state = JSON.parse(localStorage.getItem(storageKey) || 'null') || initialState;
if (!state.catalog) state.catalog = structuredClone(defaultCatalog);
let editingExisting = true;
let supabaseClient = null;
let remoteSaveTimer;
let loadingRemoteState = false;

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  queueRemoteSave();
}

function queueRemoteSave() {
  if (!supabaseClient || loadingRemoteState) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(saveRemoteState, 700);
}

async function saveRemoteState() {
  const { error } = await supabaseClient
    .from('wedding_workspace')
    .upsert({ id: 'boda-2027', state, updated_at: new Date().toISOString() });
  if (error) setAuthStatus(`No se pudo sincronizar: ${error.message}`);
}

function setAuthStatus(message) { $('authStatus').textContent = message; }
function isAllowedEmail(email) { return ALLOWED_EMAILS.includes(email.toLowerCase()); }

async function loadRemoteState() {
  loadingRemoteState = true;
  const { data, error } = await supabaseClient.from('wedding_workspace').select('state').eq('id', 'boda-2027').maybeSingle();
  loadingRemoteState = false;
  if (error) { setAuthStatus(`No se pudo cargar la boda: ${error.message}`); return; }
  if (data?.state) {
    state = data.state;
    if (!state.catalog) state.catalog = structuredClone(defaultCatalog);
    localStorage.setItem(storageKey, JSON.stringify(state));
    populateVenues(); renderGuests(); renderPresets();
  } else {
    queueRemoteSave();
  }
}

async function updateSession(session) {
  const email = session?.user?.email?.toLowerCase();
  if (!email) { clearTimeout(remoteSaveTimer); $('openAuth').textContent = 'Iniciar sesión'; return; }
  if (!isAllowedEmail(email)) {
    await supabaseClient.auth.signOut();
    setAuthStatus('Este correo no tiene permiso para acceder.');
    return;
  }
  $('openAuth').textContent = 'Cerrar sesión';
  setAuthStatus(`Sesión activa: ${email}`);
  await loadRemoteState();
}

async function initializeSupabase() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabaseClient.auth.getSession();
  await updateSession(session);
  supabaseClient.auth.onAuthStateChange((_event, newSession) => { updateSession(newSession); });
}

async function signIn() {
  const email = $('authEmail').value.trim().toLowerCase();
  const password = $('authPassword').value;
  if (!isAllowedEmail(email)) return setAuthStatus('Este correo no está autorizado para este planificador.');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setAuthStatus(error ? error.message : 'Sesión iniciada.');
  if (!error) $('authDialog').close();
}

async function signUp() {
  if (!$('authForm').reportValidity()) return;
  const email = $('authEmail').value.trim().toLowerCase();
  const password = $('authPassword').value;
  if (!isAllowedEmail(email)) return setAuthStatus('Este correo no está autorizado para este planificador.');
  const { error } = await supabaseClient.auth.signUp({ email, password });
  setAuthStatus(error ? error.message : 'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
}

function populateVenues() {
  $('venue').innerHTML = Object.keys(state.catalog).map(venue => `<option>${venue}</option>`).join('');
  $('venue').value = state.venue;
  populatePackages();
}

function populatePackages() {
  const options = state.catalog[state.venue];
  if (state.packageIndex >= options.length) state.packageIndex = 0;
  $('package').innerHTML = options.map((item, index) => `<option value="${index}">${item.name}</option>`).join('');
  $('package').value = state.packageIndex;
  showPackage();
}

function showPackage() {
  const selected = state.catalog[state.venue][state.packageIndex];
  $('packageTitle').textContent = selected.name;
  $('includes').innerHTML = selected.includes.map(item => `<span class="tag">${item}</span>`).join('');
  $('price').value = state.price; $('plannedGuests').value = state.plannedGuests; $('maxGuests').value = state.maxGuests; $('notes').value = state.notes;
  updateSummary();
}

function updateSummary() {
  const plannedGuests = Number(state.plannedGuests) || 0;
  $('totalCost').textContent = money((Number(state.price) || 0) * plannedGuests);
  $('costCaption').textContent = `${money(state.price)} × ${plannedGuests} invitados`;
  $('guestCount').textContent = state.guests.length;
  $('capacity').textContent = state.maxGuests || '—';
  $('capacityCaption').textContent = state.maxGuests ? `${Math.max(0, state.maxGuests - plannedGuests)} espacios según tu estimado` : 'añade un máximo';
  $('plannerStatus').textContent = state.maxGuests && plannedGuests > state.maxGuests ? 'Atención: el número previsto supera la capacidad.' : '';
  persist();
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function renderGuests() {
  const list = $('guestList');
  if (!state.guests.length) { list.innerHTML = '<div class="empty">Aún no has añadido invitados.</div>'; return; }
  list.innerHTML = state.guests.map((guest, index) => `<div class="guest-row"><div><b>${escapeHtml(guest.name)}</b><div class="group">${escapeHtml(guest.group || 'Sin grupo')}</div></div><span>${index + 1}</span><button class="remove" aria-label="Eliminar invitado" data-remove="${index}">×</button></div>`).join('');
}
function renderPresets() {
  const list = $('presetList');
  if (!state.presets.length) { list.innerHTML = '<div class="empty">Guarda una versión para compararla después.</div>'; return; }
  list.innerHTML = state.presets.map((preset, index) => `<div class="preset"><div><b>${escapeHtml(preset.name)}</b><span>${preset.venue} · ${preset.guests.length} invitados · ${money(preset.price * preset.plannedGuests)}</span></div><div><button class="mini-action" data-load="${index}">Abrir</button><button class="mini-action delete" data-delete="${index}">×</button></div></div>`).join('');
}
function savePreset() {
  const name = $('presetName').value.trim();
  if (!name) return $('presetName').focus();
  state.presets.push({ ...state, name, guests: [...state.guests] });
  $('presetName').value = ''; persist(); renderPresets();
}

$('venue').addEventListener('change', event => { state.venue = event.target.value; state.packageIndex = 0; const item = state.catalog[state.venue][0]; state.price = item.price; state.maxGuests = item.max; populatePackages(); });
$('package').addEventListener('change', event => { state.packageIndex = Number(event.target.value); const item = state.catalog[state.venue][state.packageIndex]; state.price = item.price; state.maxGuests = item.max; showPackage(); });
[['price', 'price'], ['plannedGuests', 'plannedGuests'], ['maxGuests', 'maxGuests'], ['notes', 'notes']].forEach(([id, property]) => $(id).addEventListener('input', event => { state[property] = id === 'notes' ? event.target.value : Number(event.target.value); updateSummary(); }));
$('addGuest').addEventListener('click', () => { const name = $('guestName').value.trim(); if (!name) return $('guestName').focus(); state.guests.push({ name, group: $('guestGroup').value.trim() }); $('guestName').value = ''; $('guestGroup').value = ''; persist(); renderGuests(); updateSummary(); });
$('guestName').addEventListener('keydown', event => { if (event.key === 'Enter') $('addGuest').click(); });
$('guestList').addEventListener('click', event => { if (event.target.dataset.remove !== undefined) { state.guests.splice(Number(event.target.dataset.remove), 1); persist(); renderGuests(); updateSummary(); } });
$('savePreset').addEventListener('click', savePreset);
$('savePresetTop').addEventListener('click', () => { $('presetName').focus(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
$('presetList').addEventListener('click', event => { if (event.target.dataset.load !== undefined) { const presets = state.presets; state = { ...state, ...presets[Number(event.target.dataset.load)], presets }; populateVenues(); renderGuests(); updateSummary(); } if (event.target.dataset.delete !== undefined) { state.presets.splice(Number(event.target.dataset.delete), 1); persist(); renderPresets(); } });

function openEditor() {
  editingExisting = true; $('editVenue').innerHTML = Object.keys(state.catalog).map(venue => `<option>${venue}</option>`).join(''); $('editVenue').value = state.venue;
  const selected = state.catalog[state.venue][state.packageIndex];
  $('editPackageName').value = selected.name; $('editPrice').value = selected.price; $('editMax').value = selected.max; $('editIncludes').value = selected.includes.join(', ');
  $('venueDialog').showModal();
}
$('manageVenues').addEventListener('click', openEditor); $('closeDialog').addEventListener('click', () => $('venueDialog').close());
$('newVenue').addEventListener('click', () => { const name = prompt('Nombre del nuevo lugar:'); if (!name || state.catalog[name]) return; state.catalog[name] = []; editingExisting = false; $('editVenue').innerHTML = Object.keys(state.catalog).map(venue => `<option>${venue}</option>`).join(''); $('editVenue').value = name; $('editPackageName').value = ''; $('editPrice').value = ''; $('editMax').value = ''; $('editIncludes').value = ''; });
$('newPackage').addEventListener('click', () => { editingExisting = false; $('editPackageName').value = ''; $('editPrice').value = ''; $('editMax').value = ''; $('editIncludes').value = ''; $('editPackageName').focus(); });
$('editVenue').addEventListener('change', event => { editingExisting = true; const item = state.catalog[event.target.value][0]; if (item) { $('editPackageName').value = item.name; $('editPrice').value = item.price; $('editMax').value = item.max; $('editIncludes').value = item.includes.join(', '); } else { $('venueForm').reset(); $('editVenue').value = event.target.value; editingExisting = false; } });
$('venueForm').addEventListener('submit', event => { event.preventDefault(); const venue = $('editVenue').value; const updated = { name: $('editPackageName').value.trim(), price: Number($('editPrice').value), max: Number($('editMax').value), includes: $('editIncludes').value.split(',').map(item => item.trim()).filter(Boolean) }; const list = state.catalog[venue]; const oldIndex = venue === state.venue ? state.packageIndex : -1; if (editingExisting && oldIndex >= 0) list[oldIndex] = updated; else list.push(updated); state.venue = venue; state.packageIndex = editingExisting && oldIndex >= 0 ? oldIndex : list.length - 1; state.price = updated.price; state.maxGuests = updated.max; persist(); populateVenues(); $('venueDialog').close(); });
$('reset').addEventListener('click', () => { if (confirm('¿Restablecer el escenario actual? Los presets guardados se conservarán.')) { const presets = state.presets; const catalog = state.catalog; state = { ...initialState, presets, catalog }; populateVenues(); renderGuests(); updateSummary(); } });
$('openAuth').addEventListener('click', async () => {
  if (supabaseClient && $('openAuth').textContent === 'Cerrar sesión') { await supabaseClient.auth.signOut(); return; }
  $('authDialog').showModal();
});
$('closeAuth').addEventListener('click', () => $('authDialog').close());
$('authForm').addEventListener('submit', event => { event.preventDefault(); signIn(); });
$('signUp').addEventListener('click', signUp);

$('today').textContent = new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' }).format(new Date());
populateVenues(); renderGuests(); renderPresets();
initializeSupabase();
