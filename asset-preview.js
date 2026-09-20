// Display-only helpers. Never use a thumbnail as production/export input.
export function assetPreviewPath(asset) {
  return asset?.thumbnail_path || asset?.processed_path || asset?.original_path || '';
}

// Parse into inert template content, then move matching image nodes before the
// new markup enters the document. Selection/search must not restart decoding.
// The pool is local to this container/update: no account or asset cache survives.
export function replacePreviewMarkup(container, markup) {
  if (!container) return;
  const template = container.ownerDocument.createElement('template');
  template.innerHTML = markup;
  const images = new Map();
  for (const image of container.querySelectorAll('img[src]')) {
    const source = image.getAttribute('src');
    if (!images.has(source)) images.set(source, []);
    images.get(source).push(image);
  }
  for (const image of template.content.querySelectorAll('img[src]')) {
    const previous = images.get(image.getAttribute('src'))?.shift();
    if (!previous) continue;
    // Preserve identity, decoded bitmap and listeners, but update display attrs.
    for (const attribute of [...previous.attributes]) if (!image.hasAttribute(attribute.name)) previous.removeAttribute(attribute.name);
    for (const attribute of [...image.attributes]) if (previous.getAttribute(attribute.name) !== attribute.value) previous.setAttribute(attribute.name, attribute.value);
    image.replaceWith(previous);
  }
  container.replaceChildren(template.content);
}
