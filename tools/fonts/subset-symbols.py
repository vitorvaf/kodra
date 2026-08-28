#!/usr/bin/env python3
"""Subset symbol/emoji fonts to the exact non-ASCII codepoints the kodra
web renderer uses, and emit the @font-face CSS fragment.

Requires: fonttools, brotli, lxml  (pip install fonttools brotli lxml)

Sources (all OF 1.1 except DejaVu Sans — Bitstream Vera license, free to
redistribute with the notice retained):
  - Noto Sans Symbols 2   https://fonts.google.com/noto/specimen/Noto+Sans+Symbols+2
  - Noto Sans Symbols     https://fonts.google.com/noto/specimen/Noto+Sans+Symbols
  - Noto Sans Math        https://fonts.google.com/noto/specimen/Noto+Sans+Math
  - Noto Color Emoji      https://fonts.google.com/noto/specimen/Noto+Color+Emoji
  - DejaVu Sans           https://dejavu-fonts.github.io/

Emoji codepoints (astral planes + VS16 + sparkles) go to Noto Color Emoji;
everything else cascades through the symbol fonts in the order above, first
font that covers a codepoint wins it. Output woff2 files land next to the
text fonts in packages/web/src/assets/fonts/ and the fragment is appended to
src/styles/fonts.css — the --ff-* stacks in tokens.css must list the families
(see fonts.css header note).
"""
import glob
import os
import subprocess
import sys

from fontTools.ttLib import TTFont

WEB = "/mnt/hd2/Projects/kanbots/packages/web"
OUT = f"{WEB}/src/assets/fonts"
PYFT = os.environ.get("PYFTSUBSET", "pyftsubset")
# System DejaVu path differs across distros; override with DEJAVU_TTF.
DEJAVU = os.environ.get(
    "DEJAVU_TTF", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
)

# google/fonts raw URLs (brackets URL-encoded).
SOURCES = [
    ("Noto Sans Symbols 2", "/tmp/opencode/NotoSansSymbols2.ttf",
     "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf"),
    ("Noto Sans Symbols", "/tmp/opencode/NotoSansSymbols.ttf",
     "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf"),
    ("Noto Sans Math", "/tmp/opencode/NotoSansMath.ttf",
     "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansmath/NotoSansMath-Regular.ttf"),
    ("Noto Color Emoji", "/tmp/opencode/NotoColorEmoji.ttf",
     "https://raw.githubusercontent.com/google/fonts/main/ofl/notocoloremoji/NotoColorEmoji-Regular.ttf"),
]

# Codepoints the emoji font must own: astral emoji, VS16, and the
# emoji-first BMP symbols the UI uses decoratively (sparkles).
EMOJI_OWNED = {0x2728}


def collect_codepoints():
    cps = set()
    for pat in (f"{WEB}/src/**/*.tsx", f"{WEB}/src/**/*.ts", f"{WEB}/src/**/*.css"):
        for f in glob.glob(pat, recursive=True):
            try:
                s = open(f, encoding="utf-8").read()
            except OSError:
                continue
            cps.update(ord(ch) for ch in s if ord(ch) > 0x7F)
    return cps


def is_emoji(cp: int) -> bool:
    return cp >= 0x1F000 or cp == 0xFE0F or cp in EMOJI_OWNED


def fmt_ranges(cp_set):
    out, start, prev = [], None, None
    for cp in sorted(cp_set):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ",".join(
        f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in out
    )


def main():
    cps = collect_codepoints()
    emoji_cps = sorted(cp for cp in cps if is_emoji(cp))
    symbol_cps = sorted(cp for cp in cps if not is_emoji(cp))

    for name, path, url in SOURCES:
        if not os.path.exists(path) or os.path.getsize(path) < 10_000:
            r = subprocess.run(["curl", "-sL", "-o", path, url])
            if r.returncode != 0 or os.path.getsize(path) < 10_000:
                sys.exit(f"download failed: {name}")

    emoji_src = SOURCES[-1][1]
    symbol_sources = [(n, p) for n, p, _ in SOURCES[:-1]] + [("DejaVu Sans", DEJAVU)]

    css = ["\n/* Symbol & emoji coverage — subset to the exact codepoints the UI",
           " * uses. The --ff-* stacks in tokens.css list these families AFTER the",
           " * primary text font so glyphs outside the latin subsets resolve",
           " * deterministically on every OS. Regenerate: tools/fonts/subset-symbols.py",
           " * (licenses: OFL for Noto fonts, Bitstream Vera for DejaVu Sans). */"]

    # Emoji pass.
    emoji_out = f"{OUT}/noto-emoji-subset.woff2"
    uni = ",".join(f"U+{cp:04X}" for cp in emoji_cps)
    r = subprocess.run([PYFT, emoji_src, f"--unicodes={uni}", "--flavor=woff2",
                        f"--output-file={emoji_out}", "--layout-features=*",
                        "--drop-tables+=DSIG"], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"pyftsubset failed (emoji): {r.stderr}")
    emoji_map = set(TTFont(emoji_out).getBestCmap().keys())
    covered = sorted(cp for cp in emoji_cps if cp in emoji_map)
    print(f"Noto Color Emoji: {len(covered)}/{len(emoji_cps)} cps, "
          f"{os.path.getsize(emoji_out)/1024:.1f} KB")
    css += ["@font-face {", "  font-family: 'Noto Color Emoji';",
            "  font-style: normal;", "  font-weight: 400;",
            "  font-display: block;",
            f"  src: url('../assets/fonts/noto-emoji-subset.woff2') format('woff2');",
            f"  unicode-range: {fmt_ranges(set(covered))};", "}"]

    # Symbol cascade: first source that covers a codepoint wins it.
    remaining = set(symbol_cps)
    for family, src in symbol_sources:
        if not remaining:
            break
        src_map = set(TTFont(src, lazy=True).getBestCmap().keys())
        mine = sorted(cp for cp in remaining if cp in src_map)
        if not mine:
            continue
        slug = family.lower().replace(" ", "-")
        out = f"{OUT}/{slug}-subset.woff2"
        uni = ",".join(f"U+{cp:04X}" for cp in mine)
        r = subprocess.run([PYFT, src, f"--unicodes={uni}", "--flavor=woff2",
                            f"--output-file={out}", "--layout-features=*",
                            "--drop-tables+=DSIG"], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"pyftsubset failed ({family}): {r.stderr}")
        remaining -= set(mine)
        print(f"{family}: {len(mine)} cps, {os.path.getsize(out)/1024:.1f} KB")
        css += ["@font-face {", f"  font-family: '{family}';",
                "  font-style: normal;", "  font-weight: 400;",
                "  font-display: block;",
                f"  src: url('../assets/fonts/{os.path.basename(out)}') format('woff2');",
                f"  unicode-range: {fmt_ranges(set(mine))};", "}"]

    if remaining:
        print("STILL MISSING:", [hex(c) for c in sorted(remaining)])
        sys.exit(1)

    with open("/tmp/opencode/symbols-fragment.css", "w") as f:
        f.write("\n".join(css) + "\n")
    print("fragment: /tmp/opencode/symbols-fragment.css")


if __name__ == "__main__":
    main()
