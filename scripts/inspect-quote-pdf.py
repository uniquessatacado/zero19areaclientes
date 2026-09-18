"""Validate and render actual application quote PDFs, without editing them."""
import json
import pathlib
import sys
import fitz

report = []
for filename in sys.argv[1:]:
    source = pathlib.Path(filename)
    doc = fitz.open(source)
    assert not doc.is_repaired, 'Invalid cross-reference table'
    text = '\n'.join(page.get_text() for page in doc)
    assert 'ORÇAMENTO' in text
    assert 'TOTAL DO ORÇAMENTO' in text
    if 'paid' in source.stem:
        assert len(doc) == 1
        assert 'PAGO' in text and 'PENDENTE' not in text
        assert '81,17' in text and '59,97' in text and '21,20' in text
        assert 'Café São João' in text and 'D’Ávila' in text
    else:
        assert len(doc) >= 4
        assert 'PENDENTE' in text and 'Página 4 de ' in text
        assert '6293,70' in text.replace('.', '').replace('\u00a0', ' ')
    for index, page in enumerate(doc):
        assert page.get_images(full=True), 'Official logo missing'
        assert f'Página {index + 1} de {len(doc)}' in page.get_text()
        for block in page.get_text('dict')['blocks']:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    rect = fitz.Rect(span['bbox'])
                    assert rect.x0 >= 30 and rect.x1 <= 565, (source.name, index, span['text'], list(rect))
                    assert rect.y0 >= 25 and rect.y1 <= 817, (source.name, index, span['text'], list(rect))
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(source.parent / f'{source.stem}-page-{index + 1}.png')
    report.append({'file': str(source), 'pages': len(doc), 'searchableText': True, 'totalVerified': True, 'logoOnEveryPage': True})
print(json.dumps({'ok': True, 'documents': report}, ensure_ascii=False))
