import { MAX_PNG, money, quantity, showDate, summarize } from './model.js';
import { loadCurrencyImages } from './currency-art.js';

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
  box(ctx, pad, y, inner, 40 + lines.length * (size + 10), 14, '#f5f9f6');
  text(ctx, label, pad + 18, y + 24, { size: 16, weight: 700, color: colors.muted });
  y += 53;
  for (const line of lines) {
    text(ctx, line, pad + 18, y, { size });
    y += size + 10;
  }
  return y - 1;
}

function draw(record, totals, images, scale) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const title = wrap(ctx, record.name, inner, 40, 700);
  const destination = record.destination ? wrap(ctx, record.destination, inner - 36, 23) : [];
  const paragraphs = record.notes.split(/\r?\n+/);
  const noteText = [...paragraphs.slice(0, 15), paragraphs.slice(15).join(' ')].filter(Boolean).join('\n');
  const notes = noteText ? wrap(ctx, noteText, inner - 36, 23) : [];
  const rowHeight = 76;
  const detailHeight = lines => lines.length ? 52 + lines.length * 33 : 0;
  const height = 539 + title.length * 48 + (record.expectedCents === null ? 0 : 78)
    + detailHeight(destination) + detailHeight(notes) + totals.rows.length * rowHeight;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#1c5542';
  ctx.fillRect(0, 0, width, 8);
  box(ctx, pad, 34, 39, 39, 10, colors.green);
  text(ctx, 'C$', pad + 19.5, 60, { size: 19, weight: 700, align: 'center', color: '#ffffff' });
  text(ctx, 'CONTEO DE EFECTIVO', pad + 53, 51, { size: 19, weight: 700, color: colors.green });
  text(ctx, 'COMPROBANTE DE CONTEO', pad + 53, 72, { size: 13, weight: 700, color: colors.muted });
  text(ctx, showDate(record.date), width-pad, 51, { size: 20, weight: 700, align: 'right' });
  text(ctx, 'CÓRDOBAS · NIO', width-pad, 73, { size: 13, weight: 700, align: 'right', color: colors.muted });
  ctx.fillStyle = colors.rule;
  ctx.fillRect(pad, 89, inner, 1);
  let y = 104;
  for (const line of title) {
    text(ctx, line, pad, y + 37, { size: 40, weight: 700 });
    y += 48;
  }
  y += 14;
  const hero = ctx.createLinearGradient(pad, y, width-pad, y + 132);
  hero.addColorStop(0, '#153c31');
  hero.addColorStop(1, '#286e54');
  box(ctx, pad, y, inner, 132, 20, hero);
  text(ctx, 'TOTAL CONTADO', pad + 24, y + 36, { size: 17, weight: 700, color: '#d0f0d4' });
  text(ctx, money(totals.total), pad + 24, y + 97, { size: 56, weight: 700, color: '#ffffff' });
  y += 148;
  const card = (inner - 14) / 2;
  for (const [label, pieces, amount, x] of [
    ['BILLETES', totals.billPieces, totals.billTotal, pad],
    ['MONEDAS', totals.coinPieces, totals.coinTotal, pad + card + 14]
  ]) {
    box(ctx, x, y, card, 75, 13, colors.pale);
    text(ctx, label + ' · ' + quantity(pieces), x + 16, y + 26, { size: 15, weight: 700, color: colors.muted });
    text(ctx, money(amount), x + 16, y + 58, { size: 27, weight: 700 });
  }
  y += 91;
  if (record.expectedCents !== null) {
    const delta = totals.total - record.expectedCents;
    const shade = delta < 0 ? '#903e23' : colors.green;
    box(ctx, pad, y, inner, 62, 13, delta < 0 ? '#fdf0e6' : colors.pale);
    text(ctx, 'MONTO PREVISTO', pad + 16, y + 22, { size: 13, weight: 700, color: colors.muted });
    text(ctx, money(record.expectedCents), pad + 16, y + 46, { size: 23, weight: 700 });
    text(ctx, delta === 0 ? 'Monto completo' : (delta < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(delta)), width-pad-16, y + 39, { size: 23, weight: 700, align:'right', color: shade });
    y += 78;
  }
  if (destination.length) y = section(ctx, 'DESTINO DEL EFECTIVO', destination, y, 23);
  if (notes.length) y = section(ctx, 'NOTAS', notes, y, 23);
  y += 8;
  text(ctx, 'Desglose por denominación', pad, y + 19, { size: 22, weight: 700 });
  box(ctx, pad, y + 31, inner, 42, 10, colors.pale);
  text(ctx, 'DENOMINACIÓN', pad + 16, y + 57, { size: 15, weight: 700, color: colors.muted });
  text(ctx, 'CANTIDAD', 583, y + 57, { size: 15, weight: 700, align:'right', color: colors.muted });
  text(ctx, 'SUBTOTAL', width-pad-16, y + 57, { size: 15, weight: 700, align:'right', color: colors.muted });
  y += 73;
  for (const [index, row] of totals.rows.entries()) {
    if (index % 2) box(ctx, pad, y, inner, rowHeight, 0, '#f8faf8');
    const photo = images.get(row.id);
    if (photo) {
      const ratio = Math.min(128 / photo.naturalWidth, 59 / photo.naturalHeight);
      const w = photo.naturalWidth * ratio, h = photo.naturalHeight * ratio;
      ctx.drawImage(photo, pad + 16 + (128 - w) / 2, y + (rowHeight - h) / 2, w, h);
    } else {
      box(ctx, pad + 54, y + 11, 54, 54, 27, row.tone[1]);
      text(ctx, String(row.mark), pad + 81, y + 45, { size: 20, weight: 700, align:'center', color: row.tone[0] });
    }
    text(ctx, row.label, pad + 162, y + 33, { size: 25, weight: 700 });
    text(ctx, row.kind === 'bill' ? 'Billete' : 'Moneda', pad + 162, y + 54, { size: 16, color: colors.muted });
    text(ctx, quantity(row.count), 583, y + 46, { size: 23, align:'right' });
    text(ctx, money(row.subtotal), width-pad-16, y + 46, { size: 23, weight: 700, align:'right' });
    ctx.fillStyle = colors.rule;
    ctx.fillRect(pad, y + rowHeight - 1, inner, 1);
    y += rowHeight;
  }
  text(ctx, 'Registro de efectivo preparado para depósito o pago.', pad, y + 35, { size: 16, color: colors.muted });
  text(ctx, 'By Carlos Tijerino', pad, y + 64, { size: 17, weight: 700, color: colors.green });
  text(ctx, 'ID ' + record.id.slice(0, 8).toUpperCase(), width-pad, y + 64, { size: 16, align:'right', color: colors.muted });
  if (y + 64 > height) throw new Error('El comprobante excede su área de impresión.');
  return canvas;
}
const blobFromCanvas = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.')), type, quality);
});
export async function createPng(record) {
  const totals = summarize(record.counts);
  const images = await loadCurrencyImages(totals.rows);
  for (const scale of [1, .9, .78, .67]) {
    const blob = await blobFromCanvas(draw(record, totals, images, scale), 'image/png');
    if (blob.size <= MAX_PNG) return blob;
  }
  throw new Error('La imagen excede el tamaño máximo de exportación. Acortá las notas e intentá de nuevo.');
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
