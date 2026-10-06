(() => {
  const isImage = a => ['image/png', 'image/jpeg'].includes(a?.mime_type);
  function url(a, conversationId) {
    if (!isImage(a)) return null;
    if (a.source_event_id && conversationId) return '/api/conclave?action=image&conversation=' + encodeURIComponent(conversationId) + '&event=' + encodeURIComponent(a.source_event_id);
    if (typeof a.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(a.data)) return `data:${a.mime_type};base64,${a.data}`;
    return null;
  }
  const hash = async buffer => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
  const dataURL = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('Could not read this image.')); reader.readAsDataURL(blob);
  });
  async function prepare(file) {
    if (!/\.(png|jpe?g)$/i.test(file.name) || file.type && !['image/png', 'image/jpeg'].includes(file.type)) throw Error('Choose a JPEG or PNG image.');
    if (file.size > 10000000 || !file.size) throw Error('Choose an image up to 10 MB.');
    const raw = await file.arrayBuffer(), bytes = new Uint8Array(raw);
    const png = bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    if (!png && !jpeg) throw Error('This file is not a valid JPEG or PNG.');
    if (png !== /\.png$/i.test(file.name)) throw Error('Image filename and format must match.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw Error('This image could not be decoded. Try another JPEG or PNG.'); }
    try {
      const canvas = document.createElement('canvas');
      let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)), blob;
      // Preserve PNG transparency; reduce dimensions if a lossless PNG is too large.
      for (let attempt = 0; attempt < 10; attempt++) {
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', .85));
        if (blob && blob.size <= 512000) break;
        scale *= .75;
      }
      if (!blob || blob.size > 512000) throw Error('Could not fit this image. Try a smaller image.');
      const encoded = await dataURL(blob);
      return { attachment_id: 'att_' + crypto.randomUUID(), name: file.name, mime_type: png ? 'image/png' : 'image/jpeg',
        data: encoded.split(',')[1], width: canvas.width, height: canvas.height, byte_length: blob.size,
        sha256: await hash(await blob.arrayBuffer()), source_sha256: await hash(raw) };
    } finally { bitmap.close(); }
  }
  function card(a, conversationId) {
    const src = url(a, conversationId); if (!src) return null;
    const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption'), link = document.createElement('a');
    figure.className = 'image-attachment'; image.src = src; image.alt = a.name; image.loading = 'lazy';
    link.href = src; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Open image ' + a.name); link.append(image);
    caption.textContent = `${a.name} · ${a.width} × ${a.height}`; figure.append(link, caption); return figure;
  }
  function mode(enabled) {
    const picker = document.querySelector('#markdown-file'), upload = document.querySelector('#upload');
    picker.accept = enabled ? '.md,.markdown,.png,.jpg,.jpeg,text/markdown,image/png,image/jpeg' : '.md,.markdown,text/markdown';
    picker.setAttribute('aria-label', enabled ? 'Choose a Markdown file or image' : 'Choose Markdown file');
    upload.setAttribute('aria-label', enabled ? 'Attach a Markdown file or image' : 'Attach a Markdown file');
    upload.title = enabled ? 'Attach Markdown (200 KB) or JPEG/PNG (10 MB; resized for the model)' : 'Attach a Markdown file (up to 200 KB)';
  }
  window.imageUploads = { isImage, url, prepare, card, mode };
})();
