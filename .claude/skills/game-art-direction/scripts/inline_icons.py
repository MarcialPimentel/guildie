#!/usr/bin/env python3
"""Inline SVG icons into an HTML template.

Usage: python inline_icons.py template.html icons_dir output.html

Every {{ICON:name}} in the template is replaced by the contents of
icons_dir/name.svg. role/aria-label are swapped for aria-hidden, because the
page shows the item name next to each icon.
"""
import pathlib
import re
import sys


def main(template, icons_dir, output):
    icons = {f.stem: f.read_text().strip() for f in pathlib.Path(icons_dir).glob('*.svg')}
    src = pathlib.Path(template).read_text()
    missing = sorted(set(re.findall(r'\{\{ICON:(\w+)\}\}', src)) - icons.keys())
    if missing:
        sys.exit(f'Missing icons: {", ".join(missing)}')
    out = re.sub(
        r'\{\{ICON:(\w+)\}\}',
        lambda m: re.sub(r' role="img" aria-label="[^"]*"', ' aria-hidden="true"', icons[m.group(1)]),
        src,
    )
    pathlib.Path(output).write_text(out)
    print(f'Wrote {output} ({len(out):,} bytes, {len(icons)} icons available)')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
