// Phase 8, batch 14 — exact copies of printDoc/printViaIframe/whenPrintReady
// from public/legacy/app-runtime.js. These are pure browser-DOM utilities
// (window.open, an invisible iframe, document.write) with no dependency on
// any other legacy state, so they move as a self-contained trio.

export function whenPrintReady(doc, cb) {
  let done = false;
  const go = () => {
    if (!done) {
      done = true;
      cb();
    }
  };
  const started = Date.now();
  const poll = () => {
    if (done) return;
    try {
      const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
      const cssReady = links.every(l => l.sheet);
      if (cssReady || Date.now() - started > 2000) {
        const fams = (doc.body && doc.body.dataset.fonts || '').split(',').filter(Boolean);
        Promise.all(
          fams.map(f => doc.fonts.load("16px '" + f + "'").catch(() => {}))
            .concat(fams.map(f => doc.fonts.load("700 16px '" + f + "'").catch(() => {})))
        ).then(() => doc.fonts.ready).then(() => setTimeout(go, 120)).catch(go);
        return;
      }
    } catch (e) {
      go();
      return;
    }
    setTimeout(poll, 120);
  };
  setTimeout(poll, 50);
  setTimeout(go, 3500);
}

export function printDoc(html) {
  let win = null;
  try {
    win = window.open('', '_blank');
  } catch (e) {
    win = null;
  }
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    whenPrintReady(win.document, () => {
      try {
        win.print();
      } catch (e) {
        printViaIframe(html);
      }
    });
    return;
  }
  printViaIframe(html);
}

export function printViaIframe(html) {
  const old = document.getElementById('__print_iframe__');
  if (old) old.remove();
  const iframe = document.createElement('iframe');
  iframe.id = '__print_iframe__';
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden'
  });
  document.body.appendChild(iframe);
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const fw = iframe.contentWindow;
      fw.focus();
      fw.print();
    } catch (e) {
      alert('تعذر فتح نافذة الطباعة على هذا الجهاز');
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (e) {}
    }, 60000);
  };
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  whenPrintReady(doc, triggerPrint);
}
