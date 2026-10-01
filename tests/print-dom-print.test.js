import test from 'node:test';
import assert from 'node:assert/strict';
import { printDoc, printViaIframe, whenPrintReady } from '../src/modules/print/dom-print.js';

// Minimal fake DOM pieces -- just enough surface for whenPrintReady's
// polling logic (document with stylesheet links + a fonts API) and for
// printViaIframe/printDoc's iframe/window creation, since these are pure
// browser-DOM utilities with no legacy-state dependency.

function fakeDoc({ readyLinks = true } = {}) {
  const link = { sheet: readyLinks ? {} : null };
  return {
    querySelectorAll: sel => (sel === 'link[rel="stylesheet"]' ? [link] : []),
    body: { dataset: { fonts: '' } },
    fonts: { load: () => Promise.resolve(), ready: Promise.resolve() },
    open: () => {},
    write: () => {},
    close: () => {},
    getElementById: () => null
  };
}

test('whenPrintReady: calls back once stylesheets report ready', async () => {
  const doc = fakeDoc({ readyLinks: true });
  await new Promise(resolve => {
    whenPrintReady(doc, resolve);
  });
});

test('whenPrintReady: still calls back eventually even if stylesheets never report ready (timeout path)', async () => {
  const doc = fakeDoc({ readyLinks: false });
  let called = false;
  whenPrintReady(doc, () => {
    called = true;
  });
  // The hard fallback fires at 3500ms; this is a correctness check, not a
  // timing assertion, so just wait comfortably past it.
  await new Promise(r => setTimeout(r, 3700));
  assert.equal(called, true);
});

test('whenPrintReady: never calls back twice', async () => {
  const doc = fakeDoc({ readyLinks: true });
  let calls = 0;
  whenPrintReady(doc, () => {
    calls++;
  });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(calls, 1);
});

test('printDoc: writes the given HTML into a newly opened window and triggers print()', async () => {
  let printed = false;
  let writtenHTML = null;
  const fakeWin = {
    document: {
      open: () => {},
      write: html => {
        writtenHTML = html;
      },
      close: () => {},
      querySelectorAll: () => [],
      body: { dataset: { fonts: '' } },
      fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }
    },
    focus: () => {},
    print: () => {
      printed = true;
    }
  };
  const originalOpen = globalThis.window?.open;
  globalThis.window = globalThis.window || {};
  globalThis.window.open = () => fakeWin;
  try {
    printDoc('<html><body>hi</body></html>');
    assert.equal(writtenHTML, '<html><body>hi</body></html>');
    // print() fires from whenPrintReady's callback, which resolves
    // asynchronously (a promise chain plus a short setTimeout) even when
    // the stylesheets are immediately "ready".
    await new Promise(r => setTimeout(r, 300));
    assert.equal(printed, true);
  } finally {
    if (originalOpen) globalThis.window.open = originalOpen;
  }
});

test('printDoc: falls back to printViaIframe when window.open returns nothing', () => {
  const originalOpen = globalThis.window?.open;
  const originalDocument = globalThis.document;
  let iframeAppended = false;
  globalThis.window = globalThis.window || {};
  globalThis.window.open = () => null;
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      contentWindow: {
        document: {
          open: () => {},
          write: () => {},
          close: () => {},
          querySelectorAll: () => [],
          body: { dataset: { fonts: '' } },
          fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }
        },
        focus: () => {},
        print: () => {}
      }
    }),
    body: {
      appendChild: () => {
        iframeAppended = true;
      }
    }
  };
  try {
    printDoc('<p>fallback</p>');
    assert.equal(iframeAppended, true);
  } finally {
    if (originalOpen) globalThis.window.open = originalOpen;
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});

test('printViaIframe: removes a previous print iframe before creating a new one', () => {
  const originalDocument = globalThis.document;
  let removedOld = false;
  const oldIframe = {
    remove: () => {
      removedOld = true;
    }
  };
  globalThis.document = {
    getElementById: id => (id === '__print_iframe__' ? oldIframe : null),
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      contentWindow: {
        document: {
          open: () => {},
          write: () => {},
          close: () => {},
          querySelectorAll: () => [],
          body: { dataset: { fonts: '' } },
          fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }
        },
        focus: () => {},
        print: () => {}
      }
    }),
    body: { appendChild: () => {} }
  };
  try {
    printViaIframe('<p>x</p>');
    assert.equal(removedOld, true);
  } finally {
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});
