# 배포된 돈워리택스 서버 함수(/api/core)로 Core 샘플 가게 자료를 받아 data/demo-core.json 으로 저장해요.
# 데모 모드(키 없음·파일로 열기·?demo)에서 이 자료를 그대로 보여 줘요. 팀 키는 필요 없어요(서버가 대신 물어봐요).
# 사용: python3 tools/snapshot.py [사이트 주소]   (기본: https://bix-phi.vercel.app)
import json, sys, urllib.request
from pathlib import Path

SITE = (sys.argv[1] if len(sys.argv) > 1 else "https://bix-phi.vercel.app").rstrip("/")
PICK = {"해운대 바삭치킨": "demo-a", "광안 소금빵": "demo-b", "(주)서면숯불한우": "demo-c"}
# 사이트(txLoad)가 읽는 것과 똑같은 묶음 — 바뀌면 같이 고쳐요
READS = [(["profile", "tax", "hr.employee"], None), (["sales", "cogs", "hr", "expense"], None), (["derived"], "PY"),
         (["ops.purchase", "ops.supplier"], None), (["finance.interest", "capital", "liability.deferred_revenue", "ops.sales", "ops.collected"], None)]
KEEP = ("tag", "value", "supply_amount", "vat_amount", "period_start", "period_end", "item_key", "detail", "evidence", "is_estimate")


def call(body):
    req = urllib.request.Request(SITE + "/api/core", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=90))
    if not j.get("ok"): raise SystemExit(f"실패: {body['action']} → {j.get('message')}")
    return j["data"]


today = call({"action": "ping"})["today"]
py = str(int(today[:4]) - 1)
tags = {t["code"]: t["name_ko"] for t in call({"action": "tags.list"})}
out = {"today": today, "source": SITE, "tags": tags, "list": [], "reads": {}}
for b in call({"action": "business.list"}):
    did = PICK.get(b["biz_name"])
    if not did: continue
    out["list"].append({"business_id": did, **{k: b.get(k) for k in ("biz_name", "industry", "vat_type", "region", "is_sim")}})
    rd = out["reads"][did] = {}
    for t, p in READS:
        body = {"action": "records.read", "business_id": b["business_id"], "tags": t}
        if p: body["period"] = py
        d = call(body)
        key = ",".join(t) + "|" + (py if p else "")
        recs = [] if p else [{k: v for k, v in r.items() if k in KEEP and v not in (None, False)} for r in d.get("records", [])]
        rd[key] = {"records": recs, "derived": d.get("derived", [])}
        print(b["biz_name"], key, len(recs), "건")
out["list"].sort(key=lambda x: x["business_id"])
path = Path(__file__).parent.parent / "data" / "demo-core.json"
path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("저장:", path, f"({path.stat().st_size // 1024}KB, 기준일 {today})")
