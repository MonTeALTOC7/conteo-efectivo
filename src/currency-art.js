const images = import.meta.glob('./currency/*.webp', { eager: true, query: '?url', import: 'default' });

export const currencyImageUrl = id => images['./currency/' + id + '.webp'];

export async function loadCurrencyImages(rows) {
  const entries = await Promise.all(rows.map(async ({id}) => {
    const url = currencyImageUrl(id);
    if (!url) return [id, null];
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      return [id, image];
    } catch {
      return [id, null];
    }
  }));
  return new Map(entries);
}
