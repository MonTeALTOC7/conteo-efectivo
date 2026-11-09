import { MAX_PNG, money, quantity, showDate, summarize } from './model.js';

const width = 960;
const pad = 49;
const inner = width - pad * 2;
const colors = { ink:'#1a3a30', muted:'#426052', pale:'#ecf4ed', rule:'#dbe8df', green:'#21533f' };
const family = 'Arial, sans-serif';

function text(ctx, value, x, y, { size = 24, weight = 500, color = colors.ink, align = 'left' } = {}) {
  ctx.font = weight + ' ' + size + 'px ' + family;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function wrap(ctx, value, maxWidth, size, weight = 500) {
  ctx.font = weight + ' ' + size + 'px ' + family;
  const lines = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const joined = line ? line + ' ' + word : word;
      if (ctx.measureText(joined).width <= maxWidth) { line = joined; continue; }
      if (line) lines.push(line);
      line = '';
      for (const part of Array.from(word)) {
        if (ctx.measureText(line + part).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += part;
      }
    }
    lines.push(line);
  }
  return lines;
}
function box(ctx, x, y, w, h, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}
function section(ctx, label, lines, y, size) {
  text(ctx, label, pad, y, { size: 17, weight: 700, color: colors.muted });
  y += 36;
  for (const line of lines) {
    text(ctx, line, pad, y, { size });
    y += size + 10;
  }
  return y + 4;
}

function draw(record, scale) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const totals = summarize(record.counts);
  const title = wrap(ctx, record.name, inner, 33, 700);
  const destination = record.destination ? wrap(ctx, record.destination, inner, 24) : [];
  const paragraphs = record.notes.split(/\r?\n+/);
  const noteText = [...paragraphs.slice(0, 15), paragraphs.slice(15).join(' ')].filter(Boolean).join('\n');
  const notes = noteText ? wrap(ctx, noteText, inner, 24) : [];
  const titleHeight = title.length * 43;
  const expectedHeight = record.expectedCents === null ? 0 : 64;
  const destinationHeight = destination.length ? 40 + destination.length * 34 : 0;
  const notesHeight = notes.length ? 40 + notes.length * 34 : 0;
  const height = 446 + titleHeight + expectedHeight + destinationHeight + notesHeight + totals.rows.length * 41;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#173e32';
  ctx.fillRect(0, 0, width, 10);
  text(ctx, 'CONTEO DE EFECTIVO', pad, 62, { size: 21, weight: 700, color: colors.green });
  text(ctx, showDate(record.date) + '  ·  NIO', width-pad, 62, { size: 20, align: 'right', color: colors.muted });
  let y = 115;
  for (const line of title) {
    text(ctx, line, pad, y, { size: 33, weight: 700 });
    y += 43;
  }
  const hero = ctx.createLinearGradient(pad, y, width-pad, y + 100);
  hero.addColorStop(0, '#143e32');
  hero.addColorStop(1, '#25634b');
  box(ctx, pad, y - 20, inner, 123, 21, hero);
  text(ctx, 'TOTAL CONTADO', pad + 26, y + 15, { size: 17, weight: 700, color: '#d0f0d4' });
  text(ctx, money(totals.total), pad + 26, y + 74, { size: 54, weight: 700, color: '#ffffff' });
  y += 137;
  text(ctx, quantity(totals.billPieces) + ' billetes · ' + money(totals.billTotal), pad, y, { size: 21, weight: 700 });
  text(ctx, quantity(totals.coinPieces) + ' monedas · ' + money(totals.coinTotal), width-pad, y, { size: 21, weight: 700, align:'right' });
  y += 33;
  if (record.expectedCents !== null) {
    const delta = totals.total - record.expectedCents;
    box(ctx, pad, y - 9, inner, 48, 10, delta < 0 ? '#fdf0e6' : colors.pale);
    text(ctx, 'Previsto  ' + money(record.expectedCents), pad + 14, y + 22, { size: 21 });
    text(ctx, delta === 0 ? 'Monto completo' : (delta < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(delta)), width-pad-14, y + 22, { size: 21, weight: 700, align:'right' });
    y += 64;
  }
  if (destination.length) y = section(ctx, 'DESTINO DEL EFECTIVO', destination, y + 5, 24) - 5;
  if (notes.length) y = section(ctx, 'NOTAS', notes, y + 5, 24) - 5;
  y += 18;
  box(ctx, pad, y - 7, inner, 37, 8, colors.pale);
  text(ctx, 'DENOMINACIÓN', pad + 12, y + 17, { size: 16, weight: 700, color: colors.muted });
  text(ctx, 'CANTIDAD', 563, y + 17, { size: 16, weight: 700, align:'right', color: colors.muted });
  text(ctx, 'SUBTOTAL', width-pad-12, y + 17, { size: 16, weight: 700, align:'right', color: colors.muted });
  y += 30;
  for (const row of totals.rows) {
    text(ctx, row.label + '  ·  ' + (row.kind === 'bill' ? 'Billete' : 'Moneda'), pad + 12, y + 25, { size: 20 });
    text(ctx, quantity(row.count), 563, y + 25, { size: 20, align:'right' });
    text(ctx, money(row.subtotal), width-pad-12, y + 25, { size: 20, weight: 700, align:'right' });
    ctx.fillStyle = colors.rule;
    ctx.fillRect(pad, y + 40, inner, 1);
    y += 41;
  }
  text(ctx, 'Registro de efectivo preparado para depósito o pago.', pad, y + 37, { size: 17, color: colors.muted });
  text(ctx, record.id.slice(0, 8).toUpperCase(), width-pad, y + 37, { size: 16, align:'right', color: colors.muted });
  if (y + 40 > height) throw new Error('El comprobante excede su área de impresión.');
  return canvas;
}
const blobFromCanvas = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.')), type, quality);
});
export async function createPng(record) {
  for (const scale of [1, .9, .78, .67]) {
    const blob = await blobFromCanvas(draw(record, scale), 'image/png');
    if (blob.size <= MAX_PNG) return blob;
  }
  throw new Error('La imagen excede el tamaño de sincronización. Acortá las notas e intentá de nuevo.');
}
export async function createPdf(png) {
  const image = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  image.close();
  const bytes = new Uint8Array(await (await blobFromCanvas(canvas, 'image/jpeg', .92)).arrayBuffer());
  const pageWidth = 595;
  const pageHeight = 842;
  const scale = Math.min((pageWidth-40)/canvas.width, (pageHeight-40)/canvas.height);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const command = 'q\n' + w + ' 0 0 ' + h + ' ' + (pageWidth-w)/2 + ' ' + (pageHeight-h-20) + ' cm\n/Receipt Do\nQ\n';
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let size = 0;
  function add(part) {
    const data = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(data);
    size += data.length;
  }
  function object(id, ...body) {
    offsets.push(size);
    add(id + ' 0 obj\n');
    for (const part of body) add(part);
    add('\nendobj\n');
  }
  add('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Receipt 4 0 R >> >> /Contents 5 0 R >>');
  object(4, '<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Width ' + canvas.width + ' /Height ' + canvas.height + ' /Length ' + bytes.length + ' >>\nstream\n', bytes, '\nendstream');
  object(5, '<< /Length ' + command.length + ' >>\nstream\n' + command + 'endstream');
  const xref = size;
  add('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) add(String(offset).padStart(10, '0') + ' 00000 n \n');
  add('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type:'application/pdf' });
}
