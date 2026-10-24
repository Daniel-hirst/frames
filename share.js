/* Frames: the "share a night" picture. Draws one session onto a canvas in the app's style. Browser only. */
(function (root) {
  'use strict';

  const W = 1080, PAD = 72;
  const C = { bg: '#0E2F25', card: '#154634', line: '#2A6A50', text: '#F4F1E8', muted: '#A8C7B8' };
  const COND = '"Barlow Condensed", sans-serif', BODY = 'Barlow, sans-serif';

  let icon = null;
  function loadIcon() {
    if (!icon) {
      icon = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);   // draw without the logo rather than fail
        img.src = 'icons/icon-512.png';
      });
    }
    return icon;
  }

  // Canvas letterSpacing isn't in every Safari yet, so space letters by hand.
  function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const w = chars.reduce((t, c) => t + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    for (const c of chars) {
      ctx.fillText(c, cx, y);
      cx += ctx.measureText(c).width + spacing;
    }
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function text(ctx, s, x, y, font, colour, align) {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = align || 'left';
    ctx.fillText(s, x, y);
  }

  // night: { date, names:[a,b], colours:[a,b], score:[a,b], best:[a,b], points:[a,b]|null,
  //          frames:[{ winner: 0|1, score:[a,b]|null, breaks:[a,b] }] }
  // Resolves to a PNG blob, 1080 wide, at least 1350 tall (4:5), taller for long nights.
  async function render(night) {
    await Promise.all([
      document.fonts.load('700 100px "Barlow Condensed"'),
      document.fonts.load('600 40px Barlow'),
      document.fonts.load('500 40px Barlow'),
      document.fonts.load('400 40px Barlow')
    ]).catch(() => {});
    const logo = await loadIcon();

    const ROW = 104;
    const listTop = 760;
    const footTop = listTop + night.frames.length * ROW + 48;
    const H = Math.max(1350, footTop + 168 + 136);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    // Header: icon, wordmark, date.
    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(PAD, 72, 96, 96, 24);
      ctx.clip();
      ctx.drawImage(logo, PAD, 72, 96, 96);
      ctx.restore();
    }
    ctx.font = '700 64px ' + COND;
    ctx.fillStyle = C.text;
    spaced(ctx, 'FRAMES', PAD + 96 + 28, 142, 8);
    text(ctx, night.date, W - PAD, 140, '500 36px ' + BODY, C.muted, 'right');

    // Score card.
    const cardY = 224, cardH = 420, mid = [PAD + 936 / 4, W - PAD - 936 / 4];
    roundRect(ctx, PAD, cardY, 936, cardH, 48, C.card);
    for (const i of [0, 1]) {
      ctx.font = '600 40px ' + BODY;
      ctx.fillStyle = night.colours[i];
      spaced(ctx, night.names[i].toUpperCase(), mid[i], cardY + 92, 5, 'center');
      text(ctx, String(night.score[i]), mid[i], cardY + 330, '700 240px ' + COND, night.colours[i], 'center');
    }
    text(ctx, '–', W / 2, cardY + 290, '700 120px ' + COND, C.muted, 'center');
    const [sa, sb] = night.score;
    const result = (sa === sb ? 'Level' : night.names[sa > sb ? 0 : 1] + ' wins the night') +
      (night.points ? '  ·  Points ' + night.points[0] + '–' + night.points[1] : '');
    text(ctx, result, W / 2, cardY + cardH - 40, '500 32px ' + BODY, C.muted, 'center');

    // Frames.
    ctx.font = '600 26px ' + BODY;
    ctx.fillStyle = C.muted;
    spaced(ctx, 'FRAMES', PAD, listTop - 28, 3);
    night.frames.forEach((f, i) => {
      const y = listTop + i * ROW;
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, y, 936, 2);
      text(ctx, 'F' + (i + 1), PAD, y + 64, '500 32px ' + BODY, C.muted);
      ctx.beginPath();
      ctx.arc(PAD + 104, y + 53, 11, 0, Math.PI * 2);
      ctx.fillStyle = night.colours[f.winner];
      ctx.fill();
      text(ctx, night.names[f.winner] + ' won', PAD + 132, f.score ? y + 50 : y + 64, '500 36px ' + BODY, C.text);
      const brk = 'Best breaks ' + f.breaks[0] + ' · ' + f.breaks[1];
      if (f.score) {
        text(ctx, brk, PAD + 132, y + 88, '400 26px ' + BODY, C.muted);
        text(ctx, f.score[0] + ' – ' + f.score[1], W - PAD, y + 72, '700 56px ' + COND, C.text, 'right');
      } else {
        text(ctx, brk, W - PAD, y + 64, '400 28px ' + BODY, C.muted, 'right');
      }
    });
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, listTop + night.frames.length * ROW, 936, 2);

    // Best break of the night, each player.
    const boxW = (936 - 24) / 2;
    for (const i of [0, 1]) {
      const x = PAD + i * (boxW + 24);
      roundRect(ctx, x, footTop, boxW, 168, 36, C.card);
      ctx.font = '600 24px ' + BODY;
      ctx.fillStyle = C.muted;
      spaced(ctx, 'BEST BREAK', x + 36, footTop + 56, 3);
      text(ctx, night.names[i], x + 36, footTop + 128, '600 40px ' + BODY, night.colours[i]);
      text(ctx, String(night.best[i]), x + boxW - 36, footTop + 136, '700 96px ' + COND, C.text, 'right');
    }

    text(ctx, 'Head to head, frame by frame', W / 2, H - 64, '400 28px ' + BODY, C.muted, 'center');

    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
  }

  root.ShareCard = { render };
})(this);
