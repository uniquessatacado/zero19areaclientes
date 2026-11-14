// Área do cliente DTF por metro (13/11): link de acesso enviado pela ZERO19 ("Criar minha senha" / "Trocar a senha").
// O link tem um código de uso único (hash no banco, 7 dias). Aqui, com a chave de serviço (só no servidor):
//  - check: diz de quem é o link (nome e e-mail) sem revelar mais nada;
//  - set: cria a conta do cliente (e-mail já confirmado, marcada z19p_dtf) ou troca a senha de uma conta que É do portal DTF.
// Nunca troca a senha de conta da equipe ou de outra conta do sistema (ex.: Venduss): nesses casos o cliente entra com a senha
// que já tem e o 019 liga a conta pelo e-mail.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const service = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const fail = (error: string, code = "error", status = 400) => json({ ok: false, code, error }, status);

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: service, body: JSON.stringify(args) });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || `Falha ao consultar o acesso (${response.status}).`);
  return data;
}

const messages: Record<string, string> = {
  invalid: "Este link de acesso não vale. Peça um link novo para a ZERO19.",
  used: "Este link já foi usado. Entre com seu e-mail e senha ou peça um link novo para a ZERO19.",
  expired: "Este link venceu (vale 7 dias). Peça um link novo para a ZERO19.",
  inactive: "Seu acesso está desativado. Fale com a ZERO19.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido.", "method", 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return fail(messages.invalid, "invalid");
    const info = await rpc("z19p_dtf_token_check", { p_token: token });
    if (info?.error) return fail(messages[info.error] || messages.invalid, info.error);
    const foreign = Boolean(info.userId) && !info.userIsDtf;
    if (body?.action === "check") {
      return json({ ok: true, name: info.name, email: info.email, purpose: info.purpose, existingAccount: foreign, staff: Boolean(info.userIsStaff) });
    }
    if (body?.action !== "set") return fail("Ação inválida.", "action");
    const password = String(body?.password ?? "");
    if (password.length < 6) return fail("A senha precisa ter pelo menos 6 letras ou números.", "weak");
    if (password.length > 72) return fail("A senha pode ter no máximo 72 caracteres.", "weak");
    if (info.userIsStaff) return fail("Este e-mail é de uma conta da equipe do 019. Peça para a ZERO19 cadastrar outro e-mail.", "staff");
    if (foreign) return fail("Você já tem uma conta no sistema com este e-mail. Entre com a senha que você já usa (a mesma do Venduss).", "existing_account");
    let userId = info.userId as string | null;
    if (userId) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT", headers: service, body: JSON.stringify({ password, email_confirm: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return fail(data?.msg || data?.message || "Não deu para salvar a senha. Tente de novo.", "auth");
      }
    } else {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST", headers: service,
        body: JSON.stringify({ email: String(info.email).toLowerCase(), password, email_confirm: true, app_metadata: { z19p_dtf: true }, user_metadata: { name: info.name } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) return fail(data?.msg || data?.message || "Não deu para criar o acesso. Tente de novo.", "auth");
      userId = data.id;
    }
    await rpc("z19p_dtf_token_use", { p_token_id: info.tokenId, p_user_id: userId });
    return json({ ok: true, email: info.email });
  } catch (error) {
    return fail((error as Error)?.message || "Erro inesperado.", "server", 500);
  }
});
