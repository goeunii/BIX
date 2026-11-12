# TAX 저장소 index.html의 계산 엔진(tx* 함수)과 data/demo-core.json(데모 자료)을 src.html에 끼워 index.html 한 파일로 만들어요.
# 사용: python3 build.py [TAX/index.html 경로]
#   경로를 안 주면 이 폴더 옆의 ../TAX/index.html 을 써요.
#   TAX 모듈 계산을 고친 뒤 다시 실행하면 이 사이트도 같은 계산을 써요.
import sys
from pathlib import Path

here = Path(__file__).parent
tax = Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent / "TAX" / "index.html"
mod = tax.read_text(encoding="utf-8").split("\n")


def cut(start, end):
    i = next(k for k, l in enumerate(mod) if l.startswith(start))
    j = next(k for k in range(i, len(mod)) if mod[k].startswith(end))
    return "\n".join(mod[i:j])


engine = "\n".join([
    cut("const TX_RULES = {", "const txLawLink"),   # 기준값·데이터 읽기·진단·혜택·일정·부가세·소득세·위험
    cut("function txIncomeYear(", "const txTodoLi"),  # 다음 세금·할 일·짧은 제목
])
src = (here / "src.html").read_text(encoding="utf-8")
assert "/*@@ENGINE@@*/" in src and "/*@@DEMO@@*/" in src
# 데모 자료: tools/snapshot.py 로 Core에서 받아 둔 샘플 가게 자료 (</script> 가 섞여도 안전하게)
demo = (here / "data" / "demo-core.json").read_text(encoding="utf-8").replace("</", "<\\/")
# 직원 월급 원천세: 근로소득 간이세액표(2026.2.27 개정) 원본 표
wage = (here / "data" / "wage-table-2026.json").read_text(encoding="utf-8")
assert "/*@@WAGE@@*/" in src
(here / "index.html").write_text(src.replace("/*@@ENGINE@@*/", engine).replace("/*@@DEMO@@*/null", demo).replace("/*@@WAGE@@*/null", wage), encoding="utf-8")
print("index.html 생성:", len(engine.splitlines()), "줄 엔진 포함 (출처:", tax, ")")
