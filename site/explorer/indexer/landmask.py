#!/usr/bin/env python3
"""landmask — the land of the network tab's globe as a bitmask, python stdlib only.

reads Natural Earth 1:110m land (public domain; ne_110m_land.geojson from
github.com/nvkelso/natural-earth-vector/geojson) and fills a STEP-degree grid by scanlines (even-odd rule over every
ring): a cell is land when its centre is inside. rows run north to south from 90°, columns west to east from −180°,
bits most significant first. prints the base64 that site/explorer/network.js embeds as LAND.

usage: python3 -I landmask.py ne_110m_land.geojson [step] > /tmp/land.b64
"""
import base64
import json
import sys


def rings(geo):
    for f in geo['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            yield from poly


def main():
    src = sys.argv[1]
    step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    rows, cols = int(round(180 / step)), int(round(360 / step))
    edges = []
    for ring in rings(json.load(open(src))):
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            if y0 != y1:
                edges.append((x0, y0, x1, y1))
    bits = bytearray((rows * cols + 7) // 8)
    for r in range(rows):
        lat = 90 - (r + 0.5) * step
        xs = sorted(x0 + (lat - y0) * (x1 - x0) / (y1 - y0) for x0, y0, x1, y1 in edges if (y0 <= lat) != (y1 <= lat))
        for a, b in zip(xs[0::2], xs[1::2]):
            c0 = max(0, int((a + 180) / step + 0.5))
            c1 = min(cols - 1, int((b + 180) / step - 0.5))
            for c in range(c0, c1 + 1):
                i = r * cols + c
                bits[i >> 3] |= 0x80 >> (i & 7)
    land = sum(bin(b).count('1') for b in bits)
    print(f'{rows}x{cols}, {land} land cells ({land / (rows * cols):.1%})', file=sys.stderr)
    print(base64.b64encode(bytes(bits)).decode())


if __name__ == '__main__':
    main()
