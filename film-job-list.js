// Keep the landing-page query small: snapshots can contain full rendered films.
// JSON text projection/alias follows Supabase's documented select syntax:
// https://supabase.com/docs/guides/database/json#query-json-data
export const FILM_JOB_LIST_COLUMNS = 'id,name,film_width_cm,calculated_length_cm,updated_at,commit_state:settings_snapshot->>commit_state';
export const FILM_JOB_LIST_LIMIT = 12;
const NAMED_DRAFT_KIND = 'named_film_draft_v1';
// neq alone would exclude SQL NULL and hide legacy jobs with no kind.
const JOB_KIND_FILTER = 'settings_snapshot->>kind.is.null,settings_snapshot->>kind.neq.' + NAMED_DRAFT_KIND;
const TABLE = 'z19p_print_jobs';

function requiredId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label);
  return value.trim();
}

function readError(operation, cause, responseStatus) {
  const rawCode = String(cause?.code || '');
  const code = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(rawCode) ? rawCode : '';
  const status = Number(responseStatus || cause?.status);
  const message = String(cause?.message || '');
  let guidance = 'Tente novamente. Se continuar, informe esta etapa ao suporte.';
  if (status === 401 || status === 403 || code === '42501' || code === 'PGRST301') {
    guidance = 'Verifique sua sessão e a permissão para acessar os filmes desta conta.';
  } else if (code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205') {
    guidance = 'A estrutura de dados necessária aos filmes não está disponível; informe o código ao suporte.';
  } else if (cause?.name === 'AbortError' || cause?.name === 'TimeoutError' || /timeout|tempo limite|demorou/i.test(message)) {
    guidance = 'A leitura excedeu o tempo limite ou foi cancelada. Tente novamente.';
  } else if (/failed to fetch|network|fetch failed|conexão|conexao/i.test(message)) {
    guidance = 'Falha de conexão ao ler os filmes. Verifique sua conexão e tente novamente.';
  }
  // Never expose raw backend messages/details, request URLs, owner IDs or tokens.
  const error = new Error(`Não foi possível ${operation === 'list' ? 'carregar a lista de jobs salvos' : 'abrir o job salvo'}. ${guidance}${code ? ` Código: ${code}.` : ''}`);
  error.name = 'FilmJobReadError';
  error.operation = operation;
  if (code) error.code = code;
  if (Number.isInteger(status) && status >= 100 && status <= 599) error.status = status;
  return error;
}

/** Return up to 12 lightweight summaries. commit_state is a flat text field.
 * No shared cache; callers must guard account/route changes after awaiting. */
export async function listFilmJobs(supabase, owner) {
  const account = requiredId(owner, 'Selecione uma conta antes de carregar os jobs salvos.');
  let result;
  try {
    result = await supabase.from(TABLE).select(FILM_JOB_LIST_COLUMNS)
      .eq('owner_id', account).or(JOB_KIND_FILTER)
      .order('updated_at', {ascending: false}).order('id', {ascending: false})
      .limit(FILM_JOB_LIST_LIMIT);
  } catch (error) {
    throw readError('list', error);
  }
  if (result?.error) throw readError('list', result.error, result.status);
  if (!result || (result.data != null && !Array.isArray(result.data))) throw readError('list');
  return (result.data || []).slice(0, FILM_JOB_LIST_LIMIT).map(row => {
    if (!row || typeof row !== 'object' || !row.id) throw readError('list');
    const {id, name, film_width_cm, calculated_length_cm, updated_at, commit_state} = row;
    return {id, name, film_width_cm, calculated_length_cm, updated_at, commit_state: commit_state ?? null};
  });
}

/** Fetch the full snapshot only on explicit open. null means unavailable for
 * this account; do not distinguish a missing row from one hidden by RLS. */
export async function getFilmJob(supabase, owner, id) {
  const account = requiredId(owner, 'Selecione uma conta antes de abrir um job salvo.');
  const jobId = requiredId(id, 'Selecione o job salvo que deseja abrir.');
  let result;
  try {
    result = await supabase.from(TABLE).select('*').eq('owner_id', account)
      .eq('id', jobId).or(JOB_KIND_FILTER).maybeSingle();
  } catch (error) {
    throw readError('get', error);
  }
  if (result?.error) throw readError('get', result.error, result.status);
  if (!result) throw readError('get');
  const row = result.data;
  if (row == null) return null;
  if (typeof row !== 'object' || Array.isArray(row)) throw readError('get');
  if (row.owner_id !== account || row.id !== jobId || row.settings_snapshot?.kind === NAMED_DRAFT_KIND) return null;
  return row;
}
