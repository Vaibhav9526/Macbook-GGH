// Corner-probe v3: transparent + titleBarStyle:'hidden' + titleBarOverlay —
// does the caption overlay still draw, does a CSS radius round the window,
// and does the phantom-titlebar-on-blur bug still fire on Electron 33?
//   bunx electron scripts/corner-probe.cjs

const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 300;
const H = 200;
// Module-scope pin: Electron destroys a window whose JS wrapper is GC'd.
const keepAlive = [];

// E: the proposed panel config — transparent, hidden titlebar, native
// overlay buttons, page paints a 12px-radius card.
// F: a plain opaque window used to steal focus (phantom-titlebar test).
const ROUNDED_PAGE =
  'data:text/html,' +
  encodeURIComponent(
    '<body style="margin:0;background:transparent">' +
      '<div style="height:100%;background:#ff0000;border-radius:12px;overflow:hidden"></div>' +
      '</body>',
  );

function mk(extra, x, y, page, label) {
  const win = new BrowserWindow({
    x, y, width: W, height: H,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    title: label,
    autoHideMenuBar: true,
    ...extra,
  });
  win.loadURL(page);
  keepAlive.push(win);
  return win;
}

process.on('uncaughtException', (e) => {
  const result = `uncaught: ${e && e.stack ? e.stack : e}`;
  try {
    fs.writeFileSync(path.join(__dirname, 'corner-probe-result.txt'), result);
  } catch {}
  console.log(result);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  const result = `unhandledRejection: ${e && e.stack ? e.stack : e}`;
  try {
    fs.writeFileSync(path.join(__dirname, 'corner-probe-result.txt'), result);
  } catch {}
  console.log(result);
  process.exit(1);
});

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const { x: ox, y: oy } = d.workArea;

  const ex = ox + 40;
  const ey = oy + 320;
  const e = mk(
    {
      transparent: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0f0f11', symbolColor: '#f5f5f7' },
    },
    ex, ey, 'E',
    ROUNDED_PAGE,
  );
  const f = mk({ backgroundColor: '#0000ff' }, ox + 400, oy + 320,
    'data:text/html,<body style="margin:0;background:#00f"></body>', 'F');

  await sleep(1600);

  const grab = async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: d.size.width, height: d.size.height },
    });
    const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
    return { bmp: src.thumbnail.getBitmap(), iw: src.thumbnail.getSize().width };
  };

  const sample = ({ bmp, iw }, x, y) => {
    const sx = iw / d.size.width;
    const ix = Math.round(x * sf * sx);
    const iy = Math.round(y * sf * sx);
    const o = (iy * iw + ix) * 4;
    return [bmp[o + 2], bmp[o + 1], bmp[o]];
  };
  const isRed = ([r, g, b]) => r > 180 && g < 90 && b < 90;

  const shot1 = await grab();
  const row1 = (y) => sample(shot1, ex + 60, ey + y);

  // steal focus -> if the phantom-titlebar bug exists, E's top strip turns
  // into a light/system bar on the second shot
  let focusNote = 'ok';
  try {
    f.focus();
  } catch (err) {
    focusNote = `focus failed: ${err && err.message}`;
  }
  await sleep(900);
  const shot2 = await grab();
  const row2 = (y) => sample(shot2, ex + 60, ey + y);

  const strip = (label, row) =>
    [2, 8, 16, 28].map((y) => `${label}@${y}=${row(y)}`).join(' ');

  const tl = sample(shot1, ex + 2, ey + 2);
  const inner = sample(shot1, ex + 40, ey + 80);
  const caption = sample(shot1, ex + W - 10, ey + 8);
  const bl = sample(shot1, ex + 2, ey + H - 3);
  const br = sample(shot1, ex + W - 3, ey + H - 3);

  const result = [
    `sf=${sf}`,
    `E corners: TL=${tl} BL=${bl} BR=${br} inner=${inner}`,
    `  -> rounded where !red && inner red: TL ${!isRed(tl) && isRed(inner) ? 'ROUND' : 'square/other'}`,
    `E caption corner (WCO button zone): ${caption} -> ${!isRed(caption) ? 'overlay buttons DRAWN' : 'not drawn / red page'}`,
    `focus steal: ${focusNote}`,
    `E top strip focused : ${strip('f', row1)}`,
    `E top strip blurred : ${strip('b', row2)}`,
  ].join('\n');

  fs.writeFileSync(path.join(__dirname, 'corner-probe-result.txt'), result);
  console.log(result);
  e.destroy();
  f.destroy();
  app.quit();
});
