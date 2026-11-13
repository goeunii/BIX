/* =====================================================================
   돈워리택스 — 토스 POS 매출 가져오기 (Vercel Serverless Function)
   - 토스 키는 Vercel 환경 변수에만 있어요: TOSS_ACCESS_KEY · TOSS_SECRET_KEY · TOSS_MERCHANT_ID
     코드·브라우저·응답·로그에는 절대 나가지 않아요.
   - 시연용: 환경 변수에 넣은 "토스 테스트 매장" 하나만, 읽기만 해요.
     실제 사장님 매장 키를 넣으면 링크를 가진 누구나 그 매출을 보게 되니 넣지 마세요.
   - 토스 공식 주소(open-api.tossplace.com)의 주문 조회만 불러요.
   - 결제 → 매출 이벤트 변환 규칙은 POS 연동 담당자가 넘겨준 코드(lib/toss.ts·sales.ts,
     2026-11-12, 자동 테스트 14개 통과)를 그대로 옮겼어요.
   ===================================================================== */
const TOSS = "https://open-api.tossplace.com/api-public/openapi/v1/merchants/";
const PER_HOUR = Number(process.env.POS_LIMIT_PER_HOUR || 20);   // 접속한 곳(IP)마다 1시간 조회 수
const MAX_PAGES = 40;                                             // 페이지당 500주문 × 40 = 2만 주문까지
const hits = new Map();

const METHODS = { CARD: "card", 카드: "card", 카드결제: "card", 신용카드: "card", 체크카드: "card", CASH: "cash", 현금: "cash", 계좌이체: "cash", ACCOUNT_TRANSFER: "cash", 현금영수증: "cash_receipt", 간편결제: "easy_pay", EASY_PAY: "easy_pay", 지역화폐: "local_currency", 배달앱: "delivery_app", 온라인: "online", 세금계산서: "tax_invoice", 외상: "receivable", 면세: "exempt" };

const send = (res, status, body) => { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(body)); };
const configured = () => !!(process.env.TOSS_ACCESS_KEY && process.env.TOSS_SECRET_KEY && process.env.TOSS_MERCHANT_ID);

/* 한국 날짜 YYYY-MM-DD (시각에 시간대가 붙어 있으면 한국 시간으로 바꿔요) */
function koreaDate(v) {
  const s = String(v ?? "").trim(), m = s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s|T|$)/);
  if (!m) throw Error("날짜 형식이 달라요");
  if (/[T ]\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(s)) { const t = Date.parse(s); if (!Number.isFinite(t)) throw Error("잘못된 시각"); return new Date(t + 9 * 3600000).toISOString().slice(0, 10); }
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/* 주문 → 매출 이벤트 (승인은 +, 취소는 취소한 날짜에 −) */
function ordersToSales(orders) {
  const sales = [], issues = [];
  orders.forEach((order, i) => {
    if (!Array.isArray(order.payments)) { issues.push(`주문 ${i + 1}: 결제 내역이 없어요`); return; }
    for (const p of order.payments) {
      try {
        if (!p.id || !["APPROVED", "CANCELLED"].includes(p.state ?? "")) throw Error("지원하지 않는 결제 상태예요 (부분환불 등)");
        if (!Number.isSafeInteger(p.amount) || p.amount < 0 || !Number.isSafeInteger(p.taxExemptAmount)) throw Error("결제금액·면세금액이 없어요");
        if (!p.approvedAt) throw Error("승인 시각이 없어요");
        if (p.tipAmount) throw Error("팁이 있는 결제는 따로 확인해 주세요");
        let method = p.sourceType ?? "UNDEFINED";
        if (p.easyPayDetails) method = "EASY_PAY"; else if (method === "CASH" && p.cashReceipt) method = "현금영수증";
        const base = { method, category: METHODS[method] ?? "", amount: p.amount, exempt: p.taxExemptAmount };
        sales.push({ ...base, id: `TOSS:${p.id}:sale`, date: koreaDate(p.approvedAt) });
        if (p.state === "CANCELLED") {
          if (!p.cancelledAt) throw Error("취소 시각이 없어요");
          sales.push({ ...base, id: `TOSS:${p.id}:refund`, date: koreaDate(p.cancelledAt), amount: -base.amount, exempt: -base.exempt });
        }
      } catch (e) { issues.push(`주문 ${order.id ?? i + 1}: ${e.message}`); }
    }
  });
  return { sales, issues };
}

async function page(from, to, cursor) {
  const url = new URL(TOSS + encodeURIComponent(process.env.TOSS_MERCHANT_ID) + "/order/orders/by-cursor");
  url.searchParams.set("from", from); url.searchParams.set("to", to); url.searchParams.set("size", "500"); url.searchParams.set("sortOrder", "ASC");
  if (cursor) url.searchParams.set("cursor", cursor);
  const r = await fetch(url, { headers: { "x-access-key": process.env.TOSS_ACCESS_KEY, "x-secret-key": process.env.TOSS_SECRET_KEY, Accept: "application/json", "Content-Type": "application/json", "User-Agent": "DontWorryTax-POS/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    const msg = r.status === 401 ? "토스가 인증을 거절했어요 (401). Vercel에 넣은 Access Key·Secret 한 쌍, MerchantId, 테스트 매장의 앱 사용(ON)을 함께 확인해 주세요."
      : r.status === 403 ? "토스가 접근을 거절했어요 (403). 앱의 주문 조회 권한과 매장 사용 설정을 확인해 주세요."
      : r.status === 429 ? "토스 조회 한도에 걸렸어요. 잠시 뒤 다시 해 주세요."
      : `토스 주문 조회에 실패했어요 (${r.status}).`;
    throw Object.assign(Error(msg), { toss: r.status });
  }
  const j = await r.json();
  if (j.resultType !== "SUCCESS" || !Array.isArray(j.success?.items)) throw Error("토스에서 정상 주문 목록을 받지 못했어요.");
  return { items: j.success.items, cursor: typeof j.success.cursor === "string" ? j.success.cursor : null };
}

module.exports = async (req, res) => {
  if (req.method === "GET") return send(res, 200, { ok: true, configured: configured() });
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "POST로만 요청할 수 있어요" });
  if (!configured()) return send(res, 503, { ok: false, configured: false, message: "Vercel에 토스 테스트 매장 키(TOSS_ACCESS_KEY·TOSS_SECRET_KEY·TOSS_MERCHANT_ID)가 아직 없어요" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const now = new Date(), thisYear = new Date(now.getTime() + 9 * 3600000).getUTCFullYear();
  const year = Number(body?.year);
  if (!Number.isInteger(year) || year < thisYear - 5 || year > thisYear) return send(res, 400, { ok: false, message: "조회할 연도를 확인해 주세요" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const list = (hits.get(ip) || []).filter((t) => Date.now() - t < 3600 * 1000);
  if (list.length >= PER_HOUR) return send(res, 429, { ok: false, message: "POS 매출을 너무 자주 불러왔어요. 잠시 뒤 다시 해 주세요" });
  list.push(Date.now()); hits.set(ip, list);

  const from = `${year}-01-01T00:00:00+09:00`;
  const to = year === thisYear ? now.toISOString() : `${year + 1}-01-01T00:00:00+09:00`;
  const sales = [], issues = [], seen = new Set();
  try {
    let cursor = null, n = 0;
    do {
      if (++n > MAX_PAGES) return send(res, 502, { ok: false, message: "주문이 너무 많아 다 불러오지 못했어요. 일부만 보여 주면 틀리니까 멈췄어요." });
      const p = await page(from, to, cursor);
      const x = ordersToSales(p.items); sales.push(...x.sales); issues.push(...x.issues);
      if (p.cursor && seen.has(p.cursor)) return send(res, 502, { ok: false, message: "토스 응답이 같은 페이지를 반복해서 멈췄어요." });
      if (p.cursor) seen.add(p.cursor);
      cursor = p.cursor;
    } while (cursor);
  } catch (ex) {
    if (ex.toss) console.error("toss_api_error", { status: ex.toss });   // 키·응답 본문은 남기지 않아요
    return send(res, 502, { ok: false, message: ex.toss ? ex.message : "토스에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." });
  }
  return send(res, 200, { ok: true, year, asOf: to, sales, issues: issues.slice(0, 50), issueCount: issues.length });
};
