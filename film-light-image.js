// 2.17.89 (dono 03/11: "quando eu adiciono artes, demora um pouco para mostrar a arte no filme"). Imagem leve da arte
// (até 1536 px, pelo redimensionamento do Supabase, com a transparência sem perda) para a prévia do filme, as miniaturas
// da lista e a análise de transparência do encaixe. Antes cada uma baixava o PNG de impressão inteiro (8 a 16 MB).
// O arquivo de impressão, as medidas e a exportação não mudam; se a imagem leve falhar, usa o arquivo de sempre.
export const FILM_LIGHT_PX = 1536;
const PRIVATE_BUCKET = 'z19p-private', SIGN_SECONDS = 900;
const signed = new Map();

export function filmImageBucket(item, {assetUrls = null, row = null} = {}) {
  return row?.metadata?.storage_bucket || item?.storageBucket || item?.storage_bucket
    || (assetUrls?.isPrivatePath?.(item?.path) ? PRIVATE_BUCKET : 'z19p-assets');
}

export async function filmLightImageUrl(supabase, {bucket, path, now = () => Date.now()} = {}) {
  if (!supabase?.storage || !path || /^(data|blob|https?):/i.test(path)) return '';
  const transform = {width: FILM_LIGHT_PX, height: FILM_LIGHT_PX, resize: 'contain'};
  if (bucket !== PRIVATE_BUCKET) return supabase.storage.from(bucket || 'z19p-assets').getPublicUrl(path, {transform})?.data?.publicUrl || '';
  const hit = signed.get(path);
  if (hit?.url && hit.expiresAt > now() + 60000) return hit.url;
  if (hit?.pending) return hit.pending;
  const pending = supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SIGN_SECONDS, {transform}).then(({data, error}) => {
    if (error || !data?.signedUrl) throw error || new Error('Sem link da imagem leve.');
    signed.set(path, {url: data.signedUrl, expiresAt: now() + SIGN_SECONDS * 1000});
    return data.signedUrl;
  }).catch(error => { signed.delete(path); throw error; });
  signed.set(path, {pending, expiresAt: 0});
  return pending;
}
