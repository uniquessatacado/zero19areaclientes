"""Read-only QA of app-generated PDF; render pages for visual inspection."""
import json
import pathlib
import sys
import fitz

source = pathlib.Path(sys.argv[1])
doc = fitz.open(source)
assert len(doc) == 4, 'Expected four views, one page each'
report = []
for index, page in enumerate(doc):
    assert abs(page.rect.width - 595.28) < .1
    assert abs(page.rect.height - 841.89) < .1
    images = page.get_images(full=True)
    assert len(images) == 1, 'Each page must contain one full view'
    assert images[0][2] == 1600, 'The source JPEG should retain its 1600px width'
    image_rect = page.get_image_rects(images[0][0])[0]
    assert page.rect.contains(image_rect), 'No clipped image'
    assert image_rect.width > 500, 'View should make good use of page width'
    png = source.parent / f'presentation-page-{index + 1}.png'
    page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(png)
    report.append({'page': index + 1, 'sourceWidth': images[0][2], 'sourceHeight': images[0][3], 'imageRect': list(image_rect), 'rendered': str(png)})
assert not doc.is_repaired, 'PDF cross-reference table should be valid'
assert not doc.embfile_count(), 'No embedded files or scripts'
print(json.dumps({'ok': True, 'pages': report}, ensure_ascii=False))
