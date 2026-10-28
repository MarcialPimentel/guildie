#!/usr/bin/env python3
"""Check WCAG contrast for a palette.

Usage:
  python contrast.py palette.json
  python contrast.py '#10323A' '#E3F2EF'        (one pair)

palette.json looks like:
  {"day":   {"backgrounds": {"bg": "#E3F2EF", "panel": "#F8FCFB"},
             "text": {"ink": "#10323A", "teal": "#12706D"}},
   "night": {"backgrounds": {...}, "text": {...}}}

Every text color is checked against every background in its set.
AA needs 4.5:1 for body text and 3:1 for large text (24px+, or 19px+ bold).
Exit code is 1 if any pair is below 4.5.
"""
import json
import sys


def luminance(hex_color):
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    def channel(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(h[i:i + 2]) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def grade(r):
    return 'AA' if r >= 4.5 else 'large-only' if r >= 3 else 'FAIL'


def main(argv):
    if len(argv) == 3 and argv[1].startswith('#'):
        r = ratio(argv[1], argv[2])
        print(f'{argv[1]} on {argv[2]}: {r:.2f}:1 {grade(r)}')
        return 0 if r >= 4.5 else 1
    if len(argv) != 2:
        print(__doc__)
        return 2
    data = json.load(open(argv[1]))
    worst = 99
    for set_name, s in data.items():
        print(f'== {set_name}')
        for tname, t in s['text'].items():
            parts = []
            for bname, b in s['backgrounds'].items():
                r = ratio(t, b)
                worst = min(worst, r)
                parts.append(f'{bname} {r:5.2f} {grade(r)}')
            print(f'  {tname:14} {t}  ' + ' | '.join(parts))
    print(f'Lowest ratio: {worst:.2f}')
    return 0 if worst >= 4.5 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
