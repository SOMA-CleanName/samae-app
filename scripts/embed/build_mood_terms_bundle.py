"""정리된 검색어를 화면이 읽을 한 파일로 묶는다.

out/ 은 Git 제외라 계산한 PC 에만 있다. 다른 데서 화면이 비지 않도록
다른 세 번들과 같은 방식으로 저장소에 커밋한다 (§9-6).
"""
import json
from pathlib import Path

EMBED = Path(__file__).resolve().parent
SRC = EMBED / "out" / "mood-vocabulary" / "normalized-terms.jsonl"
BUNDLE = EMBED / "mood-terms-bundle.json"


def main():
    rows = [json.loads(line) for line in SRC.read_text(encoding="utf-8").splitlines() if line.strip()]
    order = {g["head"]: i for i, g in
             enumerate(json.loads((EMBED / "mood-axes-bundle.json").read_text(encoding="utf-8"))["groups"])}
    rows.sort(key=lambda r: order.get(r["head"], 1 << 30))

    seen = {}
    for row in rows:
        for term in row["terms"]:
            seen.setdefault(term, []).append(row["head"])
    bundle = {
        "rows": rows,
        "terms": sum(len(r["terms"]) for r in rows),
        "aliases": sum(len(r["aliases"]) for r in rows),
        # 서로 다른 묶음이 같은 검색어로 끝난 경우. 이건 뭉쳐야 할 후보다.
        "collisions": {t: hs for t, hs in seen.items() if len(hs) > 1},
    }
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "rows": len(rows), "terms": bundle["terms"], "aliases": bundle["aliases"],
        "collisions": len(bundle["collisions"]),
        "odd": sum(1 for r in rows if r["odd"]),
        "replaced": sum(1 for r in rows if r["head"] in r["aliases"]),
        "size_mb": round(BUNDLE.stat().st_size / 1_048_576, 2),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
