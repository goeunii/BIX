/* =====================================================================
   돈워리택스 — Core 대신 물어보는 서버 함수 (Vercel Serverless Function)
   - 팀 키는 Vercel 환경 변수 CORE_KEY 에만 있어요. 코드·브라우저에는 절대 나가지 않아요.
   - 읽기 전용: ping · tags.list · business.list · records.read · ai.ask 만 통과시켜요.
     purchases.add(저장) 같은 다른 동작은 모두 막아요.
   - 시뮬레이션 가게(is_sim)만 보여 주고 읽게 해요.
   - AI 질문은 길이·사진 수·횟수를 제한해요 (링크를 누구나 볼 수 있으니까요).
   ===================================================================== */
const CORE_URL = process.env.CORE_URL || "https://nenlycswptnituodxtdq.supabase.co/functions/v1/core";
const AI_PER_HOUR = Number(process.env.AI_LIMIT_PER_HOUR || 30);   // 접속한 곳(IP)마다 1시간 AI 질문 수
const ALLOWED = {
  ping: () => ({}),
  "tags.list": (b) => ({ q: b.q, prefix: b.prefix }),
  "business.list": () => ({}),
  "records.read": (b) => ({ business_id: b.business_id, tags: b.tags, period: b.period, history: b.history }),
  "ai.ask": (b) => ({ question: b.question, business_id: b.business_id, context_tags: b.context_tags, instructions: b.instructions, images: b.images, max_tokens: Math.min(Number(b.max_tokens) || 900, 1200) }),
};

const hits = new Map();          // ip → 최근 AI 질문 시각들 (서버가 깨어 있는 동안만 기억)
let sims = { at: 0, ids: new Set() };

const send = (res, status, body) => { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(body)); };
const fail = (res, status, message) => send(res, status, { ok: false, message });

async function core(action, body) {
  const r = await fetch(CORE_URL, { method: "POST", headers: { "content-type": "application/json", "x-module-key": process.env.CORE_KEY }, body: JSON.stringify({ action, ...body }) });
  let j; try { j = await r.json(); } catch { j = { ok: false, message: `Core 응답을 읽지 못했어요 (HTTP ${r.status})` }; }
  return { status: r.status, j };
}
async function simIds() {
  if (Date.now() - sims.at < 5 * 60 * 1000 && sims.ids.size) return sims.ids;
  const { j } = await core("business.list", {});
  if (j.ok) sims = { at: Date.now(), ids: new Set(j.data.filter((b) => b.is_sim).map((b) => b.business_id)) };
  return sims.ids;
}
function aiAllowed(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (list.length >= AI_PER_HOUR) return false;
  list.push(now); hits.set(ip, list); return true;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "POST로만 요청할 수 있어요");
  if (!process.env.CORE_KEY) return fail(res, 503, "서버에 팀 키(CORE_KEY)가 설정되지 않아 데모 데이터로 보여요");
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== "object") return fail(res, 400, "요청 형식이 올바르지 않아요");
  const pick = ALLOWED[body.action];
  if (!pick) return fail(res, 403, "시연 사이트에서는 읽기만 할 수 있어요");

  try {
    const out = pick(body);
    if (out.business_id !== undefined || body.action === "records.read" || body.action === "ai.ask") {
      if (!(await simIds()).has(out.business_id)) return fail(res, 403, "시뮬레이션 가게만 볼 수 있어요");
    }
    if (body.action === "ai.ask") {
      if (typeof out.question !== "string" || !out.question.trim() || out.question.length > 600) return fail(res, 400, "질문은 600자 안으로 적어 주세요");
      if (out.instructions != null && String(out.instructions).length > 2000) return fail(res, 400, "추가 지시가 너무 길어요");
      if (out.images != null) {
        if (!Array.isArray(out.images) || out.images.length > 1) return fail(res, 400, "사진은 한 장만 보낼 수 있어요");
        if (out.images.some((x) => typeof x !== "string" || !x.startsWith("data:image/") || x.length > 3_000_000)) return fail(res, 400, "사진이 너무 크거나 형식이 달라요");
      }
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
      if (!aiAllowed(ip)) return fail(res, 429, "AI 질문을 너무 많이 했어요. 1시간 뒤에 다시 해 주세요");
    }
    const { status, j } = await core(body.action, out);
    if (j.ok && body.action === "business.list") j.data = j.data.filter((b) => b.is_sim);
    if (j.ok && body.action === "ping") j.data = { today: j.data?.today, module: j.data?.module };   // 팀 정보는 필요한 것만
    return send(res, j.ok ? 200 : status >= 400 ? status : 502, j);
  } catch (ex) {
    return fail(res, 502, "Core에 연결하지 못했어요: " + ex.message);
  }
};
