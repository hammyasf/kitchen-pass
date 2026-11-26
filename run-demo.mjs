// node run-demo.mjs — runs the real app in headless Chrome and saves PNGs to run/.
// Uses puppeteer-core with the installed Chrome. PPTR can point at a puppeteer-core install.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PPTR || 'puppeteer-core');
const here = new URL('.', import.meta.url).pathname;
mkdirSync(here + 'run', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto('file://' + here + 'app/index.html');
await sleep(500);
await page.screenshot({ path: here + 'run/plan.png' });
const info = await page.evaluate(() => ({ events: __kp.S.sched.events.length, clashes: __kp.S.sched.clashes.length, clashText: document.querySelector('#clash').innerText }));
console.log('plan:', info);

// rehearsal at x600, jump to just before the turkey comes out
await page.evaluate(() => { document.querySelector('#speed').value = '600'; __kp.setRun('rehearse'); });
const pull = await page.evaluate(() => __kp.S.sched.events.find(e => e.kind === 'pull').t);
await page.evaluate(t => __kp.jump(t - 60000), pull);
await sleep(1200);
await page.screenshot({ path: here + 'run/rehearse-pull.png' });
console.log('rail:', await page.evaluate(() => [...document.querySelectorAll('.chit')].slice(0, 6).map(c => c.querySelector('.kind').textContent + ' ' + c.querySelector('.dish').textContent + (c.classList.contains('due') ? ' (due)' : ''))));
console.log('next:', await page.evaluate(() => document.querySelector('#nextTxt').textContent + ' ' + document.querySelector('#nextIn').textContent));
// run to serve
await page.evaluate(() => __kp.jump(__kp.S.sched.serve - 30000));
await sleep(800);
await page.screenshot({ path: here + 'run/rehearse-serve.png' });
console.log('spiked:', await page.evaluate(() => __kp.S.spiked.size), 'fired:', await page.evaluate(() => __kp.S.fired.size), 'of', await page.evaluate(() => __kp.S.sched.events.length));

// clash view with solve off
await page.evaluate(() => { __kp.setRun('plan'); document.querySelector('#solve').click(); });
await sleep(300);
await (await page.$('.work')).screenshot({ path: here + 'run/clash-unsolved.png' });
await page.evaluate(() => document.querySelector('#solve').click());
await sleep(300);
await (await page.$('.work')).screenshot({ path: here + 'run/clash-solved.png' });

// °C and the ticket
await page.evaluate(() => document.querySelector('#uC').click());
await sleep(200);
await page.screenshot({ path: here + 'run/celsius.png' });
await page.evaluate(() => document.querySelector('#uF').click());
const png = await page.evaluate(() => __kp.ticketCanvas().toDataURL('image/png'));
writeFileSync(here + 'run/ticket.png', Buffer.from(png.split(',')[1], 'base64'));

// share link opens the same menu
const tok = await page.evaluate(() => __kp.C.encodeMenu({ serve: '19:30', title: 'Friendsgiving', dishes: __kp.C.PRESETS.weeknight.dishes }));
await page.goto('about:blank'); await page.goto('file://' + here + 'app/index.html#m=' + tok); await sleep(400);
console.log('shared:', await page.evaluate(() => ({ serve: document.querySelector('#serve').value, dishes: __kp.S.dishes.length, title: __kp.S.title })));

// phone width
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.reload(); await sleep(400);
await page.screenshot({ path: here + 'run/phone.png', fullPage: true });
console.log('phone overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
