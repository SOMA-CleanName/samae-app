// 안내문서 캡처용 임시 헬퍼 — 화면의 한 조각만 잘라내 설명을 붙인 '그림'으로 만든다.
// docs/33 참고. 캡처가 끝나면 public/_fig.js 를 지운다.
(() => {
  const SERIF = "Georgia,'Times New Roman',serif";
  const svg = (s) => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);

  // 문서에 실을 수 없는 것들(실명·실사진)을 사매 로고로 바꾼다
  const LOGO_PHOTO = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">` +
      `<rect width="600" height="800" fill="#F2EFEC"/>` +
      `<text x="300" y="418" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="104" fill="#E5484D">samae</text>` +
      `</svg>`
  );
  const LOGO_AVATAR = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
      `<rect width="120" height="120" fill="#FBEAE8"/>` +
      `<text x="60" y="86" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="66" fill="#E5484D">s</text>` +
      `</svg>`
  );

  const NAMES = [
    ['Hyun', '사매작가 1'],
    ['임세현', '사매작가 1'],
    ['베라치노', '사매작가 2'],
  ];

  const st = document.getElementById('figstyle') || document.createElement('style');
  st.id = 'figstyle';
  st.textContent = 'nextjs-portal{display:none!important}';
  document.head.appendChild(st);

  // 실명을 지우고 프로필 이미지를 로고로 — 복제 전에 원본에 적용한다(되돌리지 않는다;
  // 새로고침하면 원래대로 돌아온다).
  window.__anon = () => {
    let names = 0;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walk.nextNode()) {
      const t = walk.currentNode;
      if (NAMES.some(([from]) => t.nodeValue.includes(from))) hits.push(t);
    }
    for (const t of hits) {
      for (const [from, to] of NAMES) t.nodeValue = t.nodeValue.split(from).join(to);
      names++;
    }
    // 아바타 — 이미지든 이니셜이든 로고로 갈아끼운다
    let avatars = 0;
    document.querySelectorAll('span').forEach((s) => {
      const c = (s.className || '').toString();
      if (!c.includes('rounded-full') || !c.includes('place-items-center') || !c.includes('overflow-hidden')) return;
      s.style.background = '#FBEAE8';
      s.innerHTML = '<img src="' + LOGO_AVATAR + '" alt="" style="height:100%;width:100%;object-fit:cover">';
      avatars++;
    });
    return { names, avatars };
  };

  // 사진을 사매 로고 이미지로 — 사진 상세처럼 실사진을 실을 수 없는 자리에
  window.__logoPhoto = (sel) => {
    const imgs = [...document.querySelectorAll(sel)];
    imgs.forEach((i) => {
      i.removeAttribute('srcset');
      i.src = LOGO_PHOTO;
      i.style.objectFit = 'contain';
      i.style.background = '#F2EFEC';
    });
    return imgs.length;
  };

  // 이 요소를 빨간 링으로 강조한다 (복제본에서 찾을 수 있게 표시만 해둔다)
  window.__mark = (el) => {
    document.querySelectorAll('[data-fig-mark]').forEach((e) => e.removeAttribute('data-fig-mark'));
    if (el) el.setAttribute('data-fig-mark', '1');
    return !!el;
  };

  const cloneInto = (box, el, opts) => {
    const c = el.cloneNode(true);
    c.style.position = 'static';
    c.style.transform = 'none';
    c.style.margin = '0';
    c.style.maxHeight = opts.maxH || 'none';
    if (opts.maxH) c.style.overflow = 'hidden';
    c.style.inset = 'auto';
    box.appendChild(c);
  };

  window.__fig = (sel, n, title, cap, opts) => {
    opts = opts || {};
    document.getElementById('fig')?.remove();
    const nodes = typeof sel === 'string' ? [...document.querySelectorAll(sel)] : sel;
    if (!nodes.length) return 'NOT FOUND: ' + sel;
    const W = 350;
    const BW = opts.w || 350;

    const w = document.createElement('div');
    w.id = 'fig';
    w.style.cssText =
      'position:fixed;top:0;left:0;width:390px;box-sizing:border-box;background:#F4F5F6;' +
      'padding:20px 20px 24px;z-index:2147483647;';

    const h = document.createElement('div');
    h.style.cssText =
      'display:flex;gap:10px;align-items:flex-start;width:' + W + 'px;box-sizing:border-box;margin-bottom:14px;';
    h.innerHTML =
      '<div style="flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:#E5484D;color:#fff;' +
      'font:700 14px/26px -apple-system,system-ui,sans-serif;text-align:center">' + n + '</div>' +
      '<div style="flex:1 1 auto;min-width:0;max-width:' + (W - 36) + 'px">' +
      '<div style="font:700 17px/1.35 -apple-system,system-ui,sans-serif;color:#111;word-break:keep-all;' +
      'overflow-wrap:anywhere">' + title + '</div>' +
      '<div style="margin-top:5px;font:400 13px/1.6 -apple-system,system-ui,sans-serif;color:#6B7280;' +
      'word-break:keep-all;overflow-wrap:anywhere">' + cap + '</div></div>';
    w.appendChild(h);

    // 복제본 안의 fixed/sticky 자손은 뷰포트 기준으로 떠서 제목 위에 겹쳐 찍힌다.
    // 복제본은 문서 밖이라 getComputedStyle 이 비어 있으므로, 원본에서 미리 숨겨 복제한 뒤 되돌린다.
    const stashed = [];
    for (const el of nodes) {
      el.querySelectorAll('*').forEach((d) => {
        const pos = getComputedStyle(d).position;
        if (pos === 'fixed' || pos === 'sticky') {
          stashed.push([d, d.style.display]);
          d.style.display = 'none';
        }
      });
    }

    const boxCss =
      'width:' + BW + 'px;box-sizing:border-box;border-radius:16px;background:' + (opts.bg || '#fff') +
      ';box-shadow:0 8px 30px rgba(0,0,0,.13);overflow:hidden;' + (opts.boxCss || '');

    if (opts.panels) {
      // 순서가 있는 두 장면 — 각각 카드로 두고 사이에 화살표를 넣는다
      const stack = document.createElement('div');
      stack.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;';
      nodes.forEach((el, i) => {
        if (i > 0) {
          const arrow = document.createElement('div');
          arrow.style.cssText =
            'width:' + BW + 'px;text-align:center;color:#E5484D;font:700 26px/1 -apple-system,sans-serif;' +
            'padding:12px 0 10px;';
          arrow.textContent = '↓';
          stack.appendChild(arrow);
        }
        const box = document.createElement('div');
        box.style.cssText = boxCss;
        cloneInto(box, el, { maxH: (opts.maxHs || [])[i] || null });
        stack.appendChild(box);
      });
      w.appendChild(stack);
    } else {
      const box = document.createElement('div');
      box.style.cssText = boxCss;
      for (const el of nodes) cloneInto(box, el, opts);
      w.appendChild(box);
    }

    for (const [d, v] of stashed) d.style.display = v;
    document.body.appendChild(w);

    // 강조 링 — 복제본 쪽에만 그린다
    w.querySelectorAll('[data-fig-mark]').forEach((m) => {
      m.style.outline = '3px solid #E5484D';
      m.style.outlineOffset = '3px';
      m.style.borderRadius = '999px';
    });

    // 페이지의 고정 요소(뒤로가기 버튼·탭바·토스트)가 그림 위에 겹치는 걸 막는다
    document.querySelectorAll('[data-fig-hidden]').forEach((e) => {
      e.style.visibility = '';
      e.removeAttribute('data-fig-hidden');
    });
    document.querySelectorAll('body *').forEach((e) => {
      if (e === w || w.contains(e)) return;
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') {
        e.setAttribute('data-fig-hidden', '1');
        e.style.visibility = 'hidden';
      }
    });
    return Math.ceil(w.getBoundingClientRect().height);
  };
})();
