"""Rebuild Moonclock's install icons using only Python's standard library."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'icons'
ROOT.mkdir(parents=True, exist_ok=True)
BACKGROUND = (35, 75, 71)
GOLD = (235, 216, 157)


def png(size, name):
    rows = []
    samples = 3
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            color = [0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    px = (x + (sx + .5) / samples) / size
                    py = (y + (sy + .5) / samples) / size
                    moon = math.hypot(px - .47, py - .5) < .25 and math.hypot(px - .56, py - .43) > .235
                    dx, dy = abs(px - .66), abs(py - .37)
                    star = dx / .045 + dy / .06 < 1
                    chosen = GOLD if moon or star else BACKGROUND
                    for i in range(3):
                        color[i] += chosen[i]
            row.extend(round(value / samples ** 2) for value in color)
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

    content = b'\x89PNG\r\n\x1a\n'
    content += chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0))
    content += chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    (ROOT / name).write_bytes(content)


for dimension, filename in [(192, 'moonclock-192.png'), (512, 'moonclock-512.png'), (512, 'moonclock-maskable-512.png'), (180, 'apple-touch-icon.png')]:
    png(dimension, filename)
