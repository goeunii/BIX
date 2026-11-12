# 돈워리택스

소상공인들을 위한 세무 도움 웹/앱 Mockup

BIX 2026 세무 팀의 **발표용 웹 프로토타입**이에요. 질문 다섯 개에 답하면 낼 세금, 받을 수 있는 혜택, 마감일을 보여 줘요.

- PC에서는 왼쪽 메뉴, 폰에서는 아래 탭으로 바뀌어요 (반응형).
- 로그인·가입은 화면만 있는 가짜예요. 가입하면 그 브라우저에만 기억해요.
- 세금 계산은 TAX 모듈(`BIX2026/TAX`)의 계산 엔진을 그대로 써요. 계산 기준·근거·연도는 TAX 저장소 `근거/README.md`에 있어요.

## 파일
| 파일 | 하는 일 |
|---|---|
| `src.html` | 화면 원본 (여기를 고쳐요) |
| `build.py` | TAX 계산 엔진을 `src.html`에 끼워 `index.html`을 만들어요 |
| `index.html` | 실제로 열리는 페이지 (자동 생성, 직접 고치지 않기) |
| `api/core.js` | Vercel 서버 함수. 팀 키를 서버에만 두고 Core에 대신 물어봐요 |
| `vercel.json` | 서버 함수 설정 |

## 고친 뒤 다시 만들기
```bash
python3 build.py              # 옆 폴더 ../TAX/index.html 의 엔진을 씀
git add -A && git commit -m "무엇을 바꿨는지 한 줄" && git push
```
push 하면 Vercel이 자동으로 새로 배포해요.

## 데이터는 어디서 오나요?
| 상황 | 데이터 |
|---|---|
| Vercel에 올리고 `CORE_KEY`를 넣었을 때 | **Core 실시간 자료** (시뮬레이션 가게만) |
| 키가 없거나, 파일로 열었거나, 주소 끝에 `?demo` | **데모 데이터** (해운대 바삭치킨·광안 소금빵) |

서버 함수가 지키는 것:
- 읽기만 해요: `ping`, `tags.list`, `business.list`, `records.read`, `ai.ask`만 통과. `purchases.add`(저장) 등은 막아요.
- 시뮬레이션 가게(`is_sim`)만 보여 주고 읽게 해요.
- AI 질문: 600자 이하, 사진 1장, 접속한 곳마다 1시간 30번 (`AI_LIMIT_PER_HOUR`로 바꿀 수 있어요).

## Vercel에 올리기 (처음 한 번)
1. https://vercel.com 에 GitHub 계정으로 로그인
2. **Add New → Project** → 이 저장소(`goeunii/BIX`) **Import**
3. Framework Preset은 **Other** 그대로, 다른 설정은 건드리지 않기
4. **Environment Variables**에 추가
   - `CORE_KEY` = 세무 팀 키 (Core에서 받은 키. 코드·채팅·단체방에 붙여 넣지 말 것)
5. **Deploy** → `https://<프로젝트이름>.vercel.app` 주소가 생겨요. 이 링크를 누구에게나 보내면 돼요.

키를 바꾸려면 Vercel → Project → Settings → Environment Variables에서 고치고 **Redeploy** 해요.

## 발표 바로가기
| 주소 끝 | 화면 |
|---|---|
| `/` | 첫 화면 |
| `#/start` | 질문 시작 |
| `#/home` | 홈 대시보드 (샘플: 해운대 바삭치킨) |
| `#/tax/vat` · `#/tax/income` · `#/tax/wh` | 부가세 · 종합소득세 · 원천세 |
| `#/ben/now` · `#/ben/past` | 올해 혜택 · 작년에 놓친 혜택 |
| `#/cal` · `#/risk` · `#/report` | 일정·영수증 · 위험 점검 · 세무사 보고서 |

계산은 참고용이며 신고 전 세무사 확인이 필요해요.
