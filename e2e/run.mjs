// Browser tests (real Chrome, built app from dist/). Run: npm run build && npm run test:e2e
//
// Covers what unit tests cannot: the back button (history), in-app dialogs stacked over forms, keyboard handling,
// Arabic-aware search and readable error text -- for the doctor shell and the secretary shell.
// The app is driven fully offline: every request to Supabase/Cloudinary is aborted and a staff session plus a few
// records are seeded into localStorage (all fake; no real patient data, no credentials).
// Uses the Chrome already installed on the machine / GitHub runner (playwright-core, no browser download).
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const server = await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' });
const BASE = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
let failed = 0;

async function session(role, body) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, locale: 'ar-EG' });
  await ctx.route(/supabase\.co|cloudinary\.com/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [], nativeDialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { nativeDialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript(role => {
    if (localStorage.getItem('e2e_seeded')) return;
    localStorage.setItem('e2e_seeded', '1');
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const b64 = o => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'u1', email: 'staff@e2e.test', exp, role: 'authenticated' }) + '.x';
    localStorage.setItem('iapp_sb_auth', JSON.stringify({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: 'u1', email: 'staff@e2e.test', aud: 'authenticated', role: 'authenticated' } }));
    localStorage.setItem('iapp_users', JSON.stringify([{ id: 1, email: 'staff@e2e.test', username: 'staff@e2e.test', name: 'E2E Staff', role }]));
    localStorage.setItem('iapp_alerts_day', new Date().toDateString());
    localStorage.setItem('iapp_patients', JSON.stringify([
      { id: 1700000000000, name: 'أحمد مصطفى', patientCode: 'P-0001', phone: '01012345678' },
      { id: 1700000000001, name: 'فاطمة علي', patientCode: 'P-0002', phone: '01199999999' }
    ]));
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('iapp_appointments', JSON.stringify([{ id: 5, patient: 'أحمد مصطفى', patientId: 1700000000000, date: today, time: '10:00', type: 'كشف' }]));
  }, role);
  const h = {
    page,
    text: () => page.evaluate(() => document.body.innerText),
    has: (s, yes = true) => page.waitForFunction(([s, yes]) => document.body.innerText.includes(s) === yes, [s, yes], { timeout: 8000 }),
    dialogs: n => page.waitForFunction(n => document.querySelectorAll('[role=dialog]').length === n, n, { timeout: 8000 }),
    nav: label => page.locator('button', { hasText: new RegExp(label + '$') }).last().click(),
    back: () => page.goBack(),
    step: async (name, fn) => {
      try { await fn(); console.log('ok   [' + role + '] ' + name); }
      catch (e) { failed += 1; console.log('FAIL [' + role + '] ' + name + ' -- ' + String(e && e.message || e).split('\n')[0]); }
    }
  };
  await page.goto(BASE);
  await body(h);
  await h.step('no page errors and no native browser dialog', async () => {
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    if (nativeDialogs.length) throw new Error('native dialogs: ' + nativeDialogs.join(' | '));
  });
  await ctx.close();
}

// ---- doctor / admin shell -------------------------------------------------------------------------------------
await session('admin', async ({ page, text, has, dialogs, nav, back, step }) => {
  const search = () => page.locator('input[type=search]');
  await step('shell loads', async () => { await has('المزيد'); });
  await step('tabs: patients -> appointments, back returns to patients', async () => {
    await nav('المرضى'); await has('P-0001');
    await nav('المواعيد'); await has('P-0002', false);
    await back(); await has('P-0002');
  });
  await step('patient file: back closes it and returns to the list', async () => {
    await page.getByText('الملف الكامل').first().click();
    await has('P-0002', false);
    await back(); await has('P-0002');
  });
  await step('search: Ctrl+K opens; "احمد مصطفي" finds "أحمد مصطفى"', async () => {
    await page.keyboard.press('Control+k');
    await search().fill('احمد مصطفي');
    await page.waitForFunction(() => document.querySelector('input[type=search]').parentElement.parentElement.innerText.includes('أحمد مصطفى'));
  });
  await step('search: phone typed in Arabic-Indic digits matches', async () => {
    await search().fill('٠١١٩٩');
    await page.waitForFunction(() => document.querySelector('input[type=search]').parentElement.parentElement.innerText.includes('فاطمة علي'));
  });
  await step('search: back closes it; Escape closes it', async () => {
    await back(); await search().waitFor({ state: 'detached' }); await has('P-0001');
    await page.keyboard.press('Control+k'); await search().waitFor();
    await page.keyboard.press('Escape'); await search().waitFor({ state: 'detached' });
  });
  await step('search: an appointment result opens the patient file (also while already on the Patients tab)', async () => {
    await page.keyboard.press('Control+k'); await search().fill('احمد');
    await page.getByText('10:00').first().click();
    await search().waitFor({ state: 'detached' });
    await has('P-0002', false);
  });
  await step('readable error: no raw "Failed to fetch" / TypeError on screen', async () => {
    await has('لا يوجد اتصال بالخادم');
    const t = await text();
    if (/failed to fetch|typeerror/i.test(t)) throw new Error('raw technical error is visible');
  });
  await step('unsaved form: Escape asks in an in-app dialog; Escape again keeps the form', async () => {
    await page.getByText('تعديل الملف').first().click(); await dialogs(1);
    await page.locator('[role=dialog] input').first().fill('أحمد مصطفى معدل');
    await page.keyboard.press('Escape'); await dialogs(2);
    await page.keyboard.press('Escape'); await dialogs(1); // only the question closed
  });
  await step('unsaved form: back asks again; confirming closes the form and stays in the file', async () => {
    await back(); await dialogs(2);
    await page.locator('[role=dialog]').last().getByRole('button', { name: 'تأكيد' }).click();
    await dialogs(0);
    await has('تعديل الملف'); await has('P-0002', false);
    await back(); await has('P-0002'); // one back: file -> list (no dead history entries left by the dialogs)
  });
  await step('validation message is an in-app notice (imaging centre: save with no patient)', async () => {
    await nav('المزيد'); await page.getByText('مركز الصور').first().click();
    await page.getByText('حفظ الفحص والتقرير').first().click();
    await dialogs(1); await has('اختر المريض أولاً');
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
    await page.locator('[role=dialog]').getByRole('button', { name: 'موافق' }).click(); await dialogs(0);
    await back(); await has('P-0001'); // back from the imaging tab to the patients tab
  });
  await step('More sheet: back closes it', async () => { await nav('المزيد'); await has('الإعدادات'); await back(); await has('الإعدادات', false); });
  await step('logout asks first; back cancels and the session stays', async () => {
    await page.locator('[aria-label="تسجيل الخروج"]').first().click();
    await has('هل تريد تسجيل الخروج؟'); await back();
    await has('هل تريد تسجيل الخروج؟', false); await has('المزيد');
  });
  await step('reload keeps the current tab', async () => { await page.reload(); await has('P-0001'); });
});

// ---- secretary shell ------------------------------------------------------------------------------------------
await session('secretary', async ({ page, has, dialogs, back, step }) => {
  await step('shell loads', async () => { await has('الانتظار'); });
  await step('tab change, then back', async () => { await page.getByText('الانتظار').last().click(); await back(); await has('الانتظار'); });
  await step('new-appointment dialog: back closes it', async () => {
    await page.locator('button').filter({ hasText: /جديد/ }).first().click(); await dialogs(1);
    await back(); await dialogs(0);
  });
  await step('logout asks first; Escape cancels', async () => {
    await page.locator('button[aria-label]').filter({ hasText: '⏻' }).click();
    await has('هل تريد تسجيل الخروج؟');
    await page.keyboard.press('Escape'); await has('هل تريد تسجيل الخروج؟', false);
  });
});

await browser.close();
await new Promise(r => server.httpServer.close(r));
console.log(failed ? `\ne2e: ${failed} step(s) FAILED` : '\ne2e: all passed');
process.exit(failed ? 1 : 0);
