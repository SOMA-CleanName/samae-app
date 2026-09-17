"""Read-only photo retrieval pilot; never writes photos or declares human approval."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import sys

import numpy as np
import purpose_backfill as db
from backfill_client import BackfillClient
import siglip


def rank_diverse(scores, photos, count=6, per_album=2):
    selected, albums = [], {}
    for i in np.argsort(-scores, kind='stable'):
        row = photos[int(i)]
        key = row.get('album_id') or row['id']
        if albums.get(key, 0) >= per_album:
            continue
        selected.append(int(i))
        albums[key] = albums.get(key, 0) + 1
        if len(selected) == count:
            break
    return selected


def render(candidates, photos, results, destination):
    by_photo = {p['id']: p for p in photos}
    by_candidate = {}
    for row in results:
        by_candidate.setdefault(row['candidate_id'], []).append(row)
    esc = html.escape
    parts = ['<!doctype html><meta charset="utf-8"><title>무드 후보 140개 · 사진 검증</title>',
             '<style>body{background:#171717;color:#eee;font:16px system-ui;margin:30px}input,select{padding:12px;margin:8px;background:#292929;color:white;border:1px solid #666}section{border-top:1px solid #555;padding:18px 0}.grid{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:180px}img{width:180px;height:220px;object-fit:cover;border-radius:10px}small{color:#bbb}h2{margin:8px 0}</style>',
             '<h1>무드 대표 후보 · 사진 검증</h1><p>편집·AI 제안 140개. 사용 빈도 순위가 아닙니다. 검색 상위 결과이며, 적합 판정은 아직 하지 않았습니다.</p>',
             '<p>점수는 코사인 유사도입니다. 정확도·확률이 아니며 단어 사이 점수 비교에는 적합하지 않습니다. 포트폴리오당 최대 2장입니다.</p>',
             '<input id="query" placeholder="무드 검색"><select id="axis"><option value="">전체 축</option>']
    parts += [f'<option>{esc(a)}</option>' for a in dict.fromkeys(c['axis'] for c in candidates)]
    parts += ['</select>']
    for c in candidates:
        parts.append(f'<section data-label="{esc(c["label"], quote=True)}" data-axis="{esc(c["axis"], quote=True)}"><h2>{esc(c["label"])}</h2><small>{esc(c["axis"])} · 사람 검수 대기</small><div class="grid">')
        for result in by_candidate.get(c['id'], []):
            photo = by_photo[result['photo_id']]
            url = photo.get('thumb_url') or photo.get('src_url') or ''
            if not url.startswith(('https://', 'http://')):
                url = ''
            parts.append(f'<figure><img loading="lazy" src="{esc(url, quote=True)}" alt="{esc(c["label"], quote=True)} 후보"><figcaption>{result["rank"]} · {result["cosine"]:.3f}<br><small>{esc(photo["id"][:8])}</small></figcaption></figure>')
        parts.append('</div></section>')
    parts.append("<script>const q=document.querySelector('#query'),a=document.querySelector('#axis');function filter(){document.querySelectorAll('section').forEach(s=>s.hidden=!(s.dataset.label.includes(q.value)&&(!a.value||s.dataset.axis===a.value)))}q.oninput=filter;a.onchange=filter;</script>")
    destination.write_text('\n'.join(parts), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--env-stdin', action='store_true')
    args = parser.parse_args()
    env = json.load(sys.stdin) if args.env_stdin else db.load_env()
    collection = json.loads(args.input.read_text(encoding='utf-8'))
    candidates = [c for c in collection['candidates'] if c['selection_status'] == 'shortlisted']
    if not 100 <= len(candidates) <= 200:
        raise ValueError('Expected 100–200 shortlisted candidates')
    request = lambda method, path, body=None, extra=None: db.api_request(env, method, path, body, extra)
    photos = db.fetch_pages(request, 'photos?select=id,album_id,thumb_url,src_url,embedding,embedding_model&visibility=eq.published&embedding=not.is.null&order=id.asc')
    photos = [p for p in photos if (p.get('embedding_model') or '').startswith(db.EMBEDDING_PREFIX)]
    if not photos:
        raise RuntimeError('No compatible public photos')
    image_vectors = np.stack([db.parse_embedding(p['embedding']) for p in photos])
    # Local read-only pilot supports an unconfigured development server as well.
    # A protected server still rejects an absent/wrong token; never change server auth.
    token = env.get('PERSONA_SERVICE_TOKEN') or os.environ.get('PERSONA_SERVICE_TOKEN', '')
    client = BackfillClient('http://127.0.0.1:8077', token, 256)
    client.check_health()
    vectors = np.asarray(client.embed_texts([c['english_prompt'] for c in candidates]))
    scores = image_vectors @ vectors.T
    # Include actual vectors and prompts in identity so a changed corpus cannot overwrite a prior run.
    digest = hashlib.sha256(image_vectors.tobytes() + vectors.tobytes() +
                            json.dumps([p['id'] for p in photos]).encode() +
                            json.dumps(candidates, sort_keys=True).encode()).hexdigest()
    run_id = 'mood-pilot-v1-' + digest
    results = []
    for column, candidate in enumerate(candidates):
        for rank, index in enumerate(rank_diverse(scores[:, column], photos), 1):
            results.append({'run_id': run_id, 'candidate_id': candidate['id'], 'photo_id': photos[index]['id'],
                            'rank': rank, 'cosine': float(np.clip(scores[index, column], -1, 1))})
    output = {'run': {'id': run_id, 'model': siglip.MODEL_ID, 'candidate_count': len(candidates),
                     'photo_count': len(photos), 'metadata': {'metric': 'cosine similarity, not probability',
                     'human_review': 'pending', 'per_album_limit': 2, 'top_n': 6,
                     'source_ids': [s['id'] for s in collection['sources']], 'corpus_and_prompt_hash': digest}}, 'results': results}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'validation.json').write_text(json.dumps(output, ensure_ascii=False), encoding='utf-8')
    render(candidates, photos, results, args.output / 'review.html')
    print(json.dumps({'candidate_count': len(candidates), 'photo_count': len(photos),
                      'validation_pairs': len(results), 'human_review': 'pending'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
