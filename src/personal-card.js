const key = 'conteo-efectivo:personal-portrait';
const portrait = document.getElementById('personalPortrait');
const fileInput = document.getElementById('personalFile');
const choose = document.getElementById('personalChoose');
const remove = document.getElementById('personalRemove');
const status = document.getElementById('personalStatus');

function show(src) {
  portrait.hidden = !src;
  if (src) portrait.src = src;
  else portrait.removeAttribute('src');
  choose.textContent = src ? 'Cambiar foto' : 'Agregar foto';
  remove.hidden = !src;
}

try { show(localStorage.getItem(key)); } catch { show(null); }
choose.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  fileInput.value = '';
  if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    status.textContent = 'Elegí una imagen PNG, JPG o WebP de hasta 8 MB.';
    return;
  }
  choose.disabled = remove.disabled = true;
  try {
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 420 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const src = canvas.toDataURL('image/webp', .85);
    localStorage.setItem(key, src);
    show(src);
    status.textContent = 'Foto guardada en este dispositivo.';
  } catch {
    status.textContent = 'No se pudo guardar la foto.';
  } finally {
    choose.disabled = remove.disabled = false;
  }
});
remove.addEventListener('click', () => {
  try {
    localStorage.removeItem(key);
    show(null);
    status.textContent = 'Foto retirada.';
  } catch {
    status.textContent = 'No se pudo quitar la foto.';
  }
});
