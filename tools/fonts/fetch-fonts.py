#!/usr/bin/env python3
"""Download variable woff2 fonts from Google Fonts and generate fonts.css."""
import re, os, subprocess, sys

OUT_FONTS = "/mnt/hd2/Projects/kanbots/packages/web/src/assets/fonts"
OUT_CSS = "/mnt/hd2/Projects/kanbots/packages/web/src/styles/fonts.css"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
KEEP_SUBSETS = {"latin", "latin-ext"}

FAMILIES = [
    # (css2 family param, file prefix)
    ("Inter+Tight:ital,wght@0,100..900;1,100..900", "inter-tight"),
    ("JetBrains+Mono:ital,wght@0,100..800;1,100..800", "jetbrains-mono"),
    ("Instrument+Serif:ital@0;1", "instrument-serif"),
]

os.makedirs(OUT_FONTS, exist_ok=True)

def fetch_css(fam):
    url = f"https://fonts.googleapis.com/css2?family={fam}&display=swap"
    r = subprocess.run(["curl", "-s", "-A", UA, url], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"curl failed for {fam}: {r.stderr}")
    return r.stdout

# Google CSS format: /* subset */\n@font-face { ... }
block_re = re.compile(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", re.DOTALL)
prop_re = {
    "family": re.compile(r"font-family:\s*'([^']+)'"),
    "style": re.compile(r"font-style:\s*(\w+)"),
    "weight": re.compile(r"font-weight:\s*([\d ]+)"),
    "url": re.compile(r"url\((https://[^)]+\.woff2)\)"),
    "range": re.compile(r"unicode-range:\s*([^;]+);"),
}

css_out = [
    "/* Kodra — bundled web fonts (system-independent rendering).",
    " * Source: Google Fonts (fonts.google.com), SIL Open Font License 1.1.",
    " * Variable fonts: a single file covers the full weight range declared below.",
    " * Subsets: latin, latin-ext. Regenerate with tools/fonts/fetch (see OFL.txt).",
    " */",
    "",
]

downloaded = []
for fam, prefix in FAMILIES:
    css = fetch_css(fam)
    seen = set()
    for subset, body in block_re.findall(css):
        if subset not in KEEP_SUBSETS:
            continue
        style = prop_re["style"].search(body).group(1)
        weight = prop_re["weight"].search(body).group(1).strip()
        url = prop_re["url"].search(body).group(1)
        urange = prop_re["range"].search(body).group(1).strip()
        fname = f"{prefix}-{subset}{'-italic' if style == 'italic' else ''}.woff2"
        if fname in seen:
            continue
        seen.add(fname)
        dest = os.path.join(OUT_FONTS, fname)
        r = subprocess.run(["curl", "-sL", "-o", dest, url])
        if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) < 1000:
            sys.exit(f"download failed: {fname}")
        downloaded.append((fname, os.path.getsize(dest)))
        css_out.append("@font-face {")
        css_out.append(f"  font-family: '{prop_re['family'].search(body).group(1)}';")
        css_out.append(f"  font-style: {style};")
        css_out.append(f"  font-weight: {weight};")
        css_out.append(f"  font-display: swap;")
        css_out.append(f"  src: url('../assets/fonts/{fname}') format('woff2');")
        css_out.append(f"  unicode-range: {urange};")
        css_out.append("}")
        css_out.append("")

with open(OUT_CSS, "w") as f:
    f.write("\n".join(css_out))

for name, size in downloaded:
    print(f"  {name}: {size/1024:.1f} KB")
print(f"total: {sum(s for _, s in downloaded)/1024:.1f} KB in {len(downloaded)} files")
