# 작가 안내 페이지 빌더 — 캡처 JPEG 을 data URI 로 박아 한 파일로 만든다.
# 사용: python3 scripts/build-guide-page.py
import base64, pathlib, html

SRC = pathlib.Path("docs/assets/photographer-guide/web")
OUT = pathlib.Path("docs/assets/photographer-guide/guide.html")

def img(name, alt):
    b = base64.b64encode((SRC / f"{name}.jpg").read_bytes()).decode()
    return f'<figure class="shot"><img src="data:image/jpeg;base64,{b}" alt="{html.escape(alt)}" loading="lazy"></figure>'

PARTS = [
    {
        "n": "1부",
        "title": "고객이 오기까지",
        "lead": "고객은 작가를 검색해서 오지 않습니다. 사진 한 장을 보고 들어와 채팅방에서 작가님을 만나고, "
                "예약서를 주고받아 입금까지 마칩니다. 화면을 한 번도 벗어나지 않습니다.",
        "figs": [
            ("fig-1-1-photo-detail", "사진 상세 화면과 두 개의 상담 버튼"),
            ("fig-1-2-bot-answering", "안내봇이 답하고 작가에게 인계하는 대화"),
            ("fig-1-3-propose-either-side", "채팅방 헤더의 예약 작성 버튼과 예약서"),
            ("fig-1-4-booking-proposal", "받은 쪽에 보이는 예약 제안 카드"),
            ("fig-1-5-deposit-dialog", "수락 직후의 입금 안내 다이얼로그"),
            ("fig-1-6-booking-paid", "입금 완료 후의 예약 카드"),
        ],
        "note": ("<b>고객 연락처는 끝까지 작가님께 공개되지 않습니다.</b> 대신 대화·예약·입금·환불이 "
                 "전부 사매 안에 기록으로 남습니다. 분쟁이 생겼을 때 근거가 되는 것이 이 기록입니다."),
    },
    {
        "n": "2부",
        "title": "연락처 전달",
        "lead": "촬영 준비를 하다 보면 결국 직접 연락이 필요합니다. 그래서 연락처를 주고받는 정해진 경로를 "
                "만들었습니다. <b>작가님이 보내고, 고객이 안내를 읽고 동의해야 받습니다.</b> "
                "고객이 받는 순간 청약철회 100% 구간이 닫히므로, 이 절차를 건너뛰면 환불 판정의 근거가 사라집니다.",
        "figs": [
            ("fig-2-1-contact-methods", "스튜디오 프로필의 연락 수단 등록"),
            ("fig-2-2-send-contact-card", "예약 카드의 연락처 보내기 버튼"),
            ("fig-2-3-plus-menu", "채팅 입력창 플러스 메뉴"),
            ("fig-2-4-contact-consent", "고객이 보는 연락처 수신 동의 카드"),
            ("fig-2-5-contact-received", "전달된 연락처 카드"),
            ("fig-2-6-contact-refund-notice", "연락처 수령 후 채팅에 남는 환불 조건 안내"),
        ],
        "note": ("채팅창에 전화번호·오픈채팅 링크·계좌번호를 <b>직접 적는 것은 막혀 있습니다.</b> "
                 "돌려서 적는 것도 마찬가지입니다. 위 절차 밖에서 오간 연락은 사매가 기록할 수 없고, "
                 "그러면 환불·분쟁에서 작가님을 보호할 수 없습니다."),
    },
    {
        "n": "3부",
        "title": "작가님 화면",
        "lead": "스튜디오에서는 방이 어느 단계인지 한눈에 보이고, 예약서는 촬영비와 출장비를 나눠 적습니다. "
                "손이 필요한 방부터 처리하면 됩니다.",
        "figs": [
            ("fig-3-1-studio-chat-list", "스튜디오 채팅 목록과 방 상태"),
            ("fig-3-2-fee-split", "촬영비와 출장비 입력란"),
        ],
        "note": None,
    },
]

REFUND_ROWS = [
    ("촬영 7일 이상 남음 · 결제 후 7일 이내", "100% 환불", "법정 청약철회 — 위약금을 물릴 수 없습니다", "law"),
    ("촬영 7일 이상 남음 · 결제 후 7일 경과", "50% 환불", "사매 약정", ""),
    ("작가 연락처를 받은 이후", "50% 환불", "중개 용역이 끝난 것으로 봅니다", "mark"),
    ("촬영 7일 이내", "환불 없음", "작가님이 그 날짜를 비워두시기 때문입니다", ""),
    ("천재지변 — 교통 마비급 · 양측 모두에 영향", "100% 환불 또는 날짜 변경", "작가님 귀책이 아닙니다", ""),
    ("작가가 약속을 깬 경우", "100% 환불 또는 날짜 변경", "작가 패널티가 함께 적용됩니다", ""),
    ("고객 노쇼", "환불 없음", "작가님이 허락하면 날짜 변경 1회", ""),
]

def part_html(p):
    figs = "\n".join(img(n, a) for n, a in p["figs"])
    note = f'<aside class="note">{p["note"]}</aside>' if p["note"] else ""
    return f"""<section class="part" id="{p['n']}">
  <header class="part-head">
    <span class="part-n">{p['n']}</span>
    <h2>{p['title']}</h2>
    <p class="lead">{p['lead']}</p>
  </header>
  <div class="gallery">{figs}</div>
  {note}
</section>"""

rows = "\n".join(
    f'<tr class="{c}"><td>{s}</td><td class="amt">{r}</td><td class="why">{w}</td></tr>'
    for s, r, w, c in REFUND_ROWS
)

BODY = f"""<title>채팅에서 촬영까지</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Nanum+Myeongjo:wght@700;800&display=swap">
<style>
:root {{
  --paper:#FBF9F7; --surface:#FFFFFF; --panel:#F3F1EE;
  --ink:#1B1714; --muted:#79706A; --faint:#A79E97;
  --rule:#E7E1DA; --accent:#C6362F; --accent-soft:#FBEAE8;
  --shadow:0 1px 2px rgba(27,23,20,.05), 0 12px 28px -18px rgba(27,23,20,.35);
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --paper:#141211; --surface:#1C1918; --panel:#221E1C;
    --ink:#EFEAE4; --muted:#9C938C; --faint:#6E6560;
    --rule:#2F2A26; --accent:#F0736A; --accent-soft:#2B1A18;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 28px -18px rgba(0,0,0,.8);
  }}
}}
:root[data-theme="dark"] {{
  --paper:#141211; --surface:#1C1918; --panel:#221E1C;
  --ink:#EFEAE4; --muted:#9C938C; --faint:#6E6560;
  --rule:#2F2A26; --accent:#F0736A; --accent-soft:#2B1A18;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 28px -18px rgba(0,0,0,.8);
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:"IBM Plex Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
  font-size:16px; line-height:1.75; word-break:keep-all;
  -webkit-font-smoothing:antialiased;
}}
.wrap {{ max-width:960px; margin:0 auto; padding:0 24px 96px; }}

/* ── 표지 ── */
.cover {{ padding:88px 0 56px; border-bottom:1px solid var(--rule); }}
.eyebrow {{
  font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:var(--accent); margin:0 0 20px;
}}
.cover h1 {{
  font-family:"Nanum Myeongjo", serif; font-weight:800;
  font-size:clamp(38px,7vw,64px); line-height:1.18; letter-spacing:-.02em;
  margin:0 0 20px; text-wrap:balance; max-width:16ch;
}}
.cover p {{ margin:0; max-width:62ch; color:var(--muted); font-size:17px; }}
.cover strong {{ color:var(--ink); font-weight:600; }}

/* ── 무엇이 바뀌었나 ── */
.changes {{ display:grid; gap:1px; background:var(--rule); border:1px solid var(--rule);
  border-radius:14px; overflow:hidden; margin:44px 0 0; grid-template-columns:1fr; }}
@media (min-width:720px) {{ .changes {{ grid-template-columns:repeat(3,1fr); }} }}
.change {{ background:var(--surface); padding:22px 22px 24px; }}
.change h3 {{ margin:0 0 6px; font-size:15px; font-weight:600; }}
.change p {{ margin:0; font-size:14px; line-height:1.7; color:var(--muted); }}
.change .was {{ color:var(--faint); text-decoration:line-through; }}

/* ── 목차 ── */
nav.toc {{ position:sticky; top:0; z-index:10; background:var(--paper);
  border-bottom:1px solid var(--rule); margin:0 0 0; }}
nav.toc ul {{ display:flex; gap:28px; list-style:none; margin:0 auto; padding:14px 24px;
  max-width:960px; overflow-x:auto; }}
nav.toc a {{ color:var(--muted); text-decoration:none; font-size:14px; font-weight:500;
  white-space:nowrap; padding-bottom:2px; border-bottom:2px solid transparent; }}
nav.toc a:hover, nav.toc a:focus-visible {{ color:var(--ink); border-bottom-color:var(--accent); }}

/* ── 부 ── */
.part {{ padding:72px 0 0; scroll-margin-top:60px; }}
.part-head {{ max-width:66ch; }}
.part-n {{ display:inline-block; font-family:"Nanum Myeongjo",serif; font-weight:700;
  font-size:13px; letter-spacing:.18em; color:var(--accent); margin-bottom:10px; }}
.part-head h2 {{ font-family:"Nanum Myeongjo",serif; font-weight:800;
  font-size:clamp(26px,4vw,36px); line-height:1.3; margin:0 0 14px; letter-spacing:-.01em; }}
.lead {{ margin:0; color:var(--muted); font-size:16.5px; }}
.lead b {{ color:var(--ink); font-weight:600; }}

/* 그리드로 둔다 — column-count 는 위에서 아래로 흘러서 1·2·3 순서가 깨진다 */
.gallery {{ margin:36px 0 0; display:grid; gap:20px; align-items:start;
  grid-template-columns:repeat(auto-fill, minmax(232px, 1fr)); }}
.shot {{ margin:0; border-radius:14px; overflow:hidden;
  background:var(--panel); box-shadow:var(--shadow); }}
.shot img {{ display:block; width:100%; height:auto; }}

.note {{ margin:34px 0 0; padding:20px 22px; border-left:3px solid var(--accent);
  background:var(--accent-soft); border-radius:0 12px 12px 0; font-size:15px; line-height:1.75; }}
.note b {{ font-weight:600; }}

/* ── 규정 ── */
.rules {{ padding:80px 0 0; }}
.rules h2 {{ font-family:"Nanum Myeongjo",serif; font-weight:800; font-size:clamp(24px,3.6vw,32px);
  margin:0 0 8px; }}
.rules .lead {{ margin-bottom:28px; max-width:66ch; }}
.tablewrap {{ overflow-x:auto; border:1px solid var(--rule); border-radius:14px; background:var(--surface); }}
table {{ border-collapse:collapse; width:100%; min-width:560px; font-size:14.5px; }}
th, td {{ text-align:left; padding:14px 18px; border-bottom:1px solid var(--rule); vertical-align:top; }}
thead th {{ font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  color:var(--faint); background:var(--panel); }}
tbody tr:last-child td {{ border-bottom:0; }}
td.amt {{ font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }}
td.why {{ color:var(--muted); font-size:13.5px; }}
/* 강조는 이 문서의 요지인 두 줄에만 — 법정 100% 구간과, 연락처를 받아 그게 닫히는 지점 */
tr.law td.amt, tr.mark td.amt {{ color:var(--accent); }}

.calc {{ margin:34px 0 0; padding:24px; border:1px solid var(--rule); border-radius:14px;
  background:var(--surface); }}
.calc h3 {{ margin:0 0 14px; font-size:15px; font-weight:600; }}
.calc dl {{ margin:0; display:grid; grid-template-columns:auto 1fr; gap:8px 18px; font-size:14.5px; }}
.calc dt {{ color:var(--muted); }}
.calc dd {{ margin:0; font-variant-numeric:tabular-nums; }}
.calc .formula {{ margin-top:16px; padding-top:16px; border-top:1px solid var(--rule);
  color:var(--muted); font-size:13.5px; }}

footer {{ margin-top:80px; padding-top:28px; border-top:1px solid var(--rule);
  color:var(--faint); font-size:13px; }}
@media (prefers-reduced-motion:no-preference) {{
  a {{ transition:color .15s ease, border-color .15s ease; }}
}}
</style>

<nav class="toc"><ul>
  <li><a href="#1부">1부 · 고객이 오기까지</a></li>
  <li><a href="#2부">2부 · 연락처 전달</a></li>
  <li><a href="#3부">3부 · 작가님 화면</a></li>
  <li><a href="#규정">환불·수수료</a></li>
</ul></nav>

<div class="wrap">
  <header class="cover">
    <p class="eyebrow">samae · 작가 안내</p>
    <h1>채팅에서 촬영까지</h1>
    <p>문의가 들어오는 순간부터 촬영이 끝날 때까지, <strong>작가님과 고객이 실제로 보는 화면</strong> 그대로 정리했습니다.
       화면마다 그 자리에서 무슨 일이 일어나는지 한 줄씩 붙여두었습니다.</p>
    <div class="changes">
      <div class="change"><h3>리드를 사지 않습니다</h3>
        <p><span class="was">문의를 열어보려면 결제</span> 문의는 그냥 채팅방으로 옵니다. 사매는 예약이 성사돼야 수수료를 받습니다.</p></div>
      <div class="change"><h3>돈은 사매를 거칩니다</h3>
        <p>고객은 사매 계좌로 입금하고, 운영진이 확인한 뒤 수수료를 뺀 금액이 작가님께 정산됩니다.</p></div>
      <div class="change"><h3>연락처에 절차가 생겼습니다</h3>
        <p>작가님이 보내고 고객이 동의해야 전달됩니다. 채팅에 직접 적는 것은 막혀 있습니다.</p></div>
    </div>
  </header>

{chr(10).join(part_html(p) for p in PARTS)}

  <section class="rules" id="규정">
    <h2>환불과 수수료</h2>
    <p class="lead">시계가 두 개입니다. 하나는 <b>결제일</b>에서 출발하고(법이 정한 청약철회), 하나는 <b>촬영일</b>을 향해
      다가옵니다(취소 위약금). 둘이 부딪히면 법이 이깁니다.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>상황</th><th>고객에게</th><th>이유</th></tr></thead>
        <tbody>
{rows}
        </tbody>
      </table>
    </div>
    <p class="lead" style="margin-top:20px;font-size:14.5px">환불 금액은 고객이 실제로 낸 총액(촬영비 + 출장비) 기준입니다.
      <b>사매 수수료는 환불되지 않으므로, 50% 환불이 발생하면 그 부담은 작가님이 집니다.</b></p>

    <div class="calc">
      <h3>정산 예시 — 촬영비 100,000원 · 출장비 20,000원 · 수수료율 10%</h3>
      <dl>
        <dt>고객이 낸 금액</dt><dd>120,000원</dd>
        <dt>사매 수수료</dt><dd>10,000원 <span style="color:var(--muted)">(촬영비의 10% — 출장비에는 붙지 않습니다)</span></dd>
        <dt>작가님 수령액</dt><dd><b>110,000원</b></dd>
      </dl>
      <p class="formula">수수료는 예약을 보낸 시점의 설정으로 굳습니다. 나중에 요율이 바뀌어도 지난 거래 금액은 흔들리지 않습니다.
        현재는 건당 정액 6,000원이며, 작가님별 정률로 순차 전환됩니다.</p>
    </div>
  </section>

  <footer>
    화면은 2026년 8월 31일 기준입니다. 기능이 바뀌면 이 문서도 다시 만듭니다.<br>
    환불·연락처 절차의 원문은 사내 문서 <code>docs/32-refund-policy.md</code> 를 따릅니다.
  </footer>
</div>
"""

OUT.write_text(BODY, encoding="utf-8")
print(f"{OUT} — {OUT.stat().st_size/1024/1024:.2f} MB")
