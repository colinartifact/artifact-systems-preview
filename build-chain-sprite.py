#!/usr/bin/env python3
"""Generate the chain-logo sprite + marquee from assets/chains/*.svg and
splice both into index.html between marker comments.

Every logo is a monochrome SVG normalized to fill="currentColor", so the
marquee renders black in light mode and white in dark mode via CSS color.

Usage: python3 build-chain-sprite.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).parent
CHAINS_DIR = ROOT / "assets" / "chains"
INDEX = ROOT / "index.html"

LOGO_HEIGHT = 40  # px, marquee row height

# (slug, display name) in display order.
CHAINS = [
    ("agoric", "Agoric"), ("aleo", "Aleo"), ("allora", "Allora"),
    ("aptos", "Aptos"), ("arbitrum-nova", "Arbitrum Nova"),
    ("arbitrum-one", "Arbitrum One"), ("arweave", "Arweave"),
    ("avalanche", "Avalanche C-Chain"), ("axelar", "Axelar"),
    ("babylon", "Babylon"), ("base", "Base"), ("berachain", "Berachain"),
    ("bitcoin", "Bitcoin"), ("bitcoin-cash", "Bitcoin Cash"),
    ("bnb", "BNB Smart Chain"), ("celestia", "Celestia"),
    ("cosmos", "Cosmos Hub"), ("creator", "Creator"),
    ("dogecoin", "Dogecoin"), ("dydx", "dYdX"), ("ethereum", "Ethereum"),
    ("flow", "Flow"), ("fogo", "Fogo"), ("fuel", "Fuel"),
    ("gnosis", "Gnosis"), ("gonka", "Gonka"),
    ("hyperliquid", "Hyperliquid"), ("injective", "Injective"),
    ("kyve", "Kyve"), ("linea", "Linea"), ("litecoin", "Litecoin"),
    ("mantle", "Mantle"), ("mantra", "Mantra"), ("mezo", "Mezo"),
    ("monad", "Monad"), ("morph", "Morph"), ("movement", "Movement"),
    ("near", "NEAR"), ("nexus", "Nexus"), ("oasis", "Oasis"),
    ("optimism", "Optimism"), ("osmosis", "Osmosis"),
    ("pharos", "Pharos"), ("plume", "Plume"), ("polygon", "Polygon"),
    ("polygon-zkevm", "Polygon zkEVM"), ("provenance", "Provenance"),
    ("scroll", "Scroll"), ("seda", "Seda"), ("sei", "Sei"),
    ("solana", "Solana"), ("somnia", "Somnia"), ("sonic", "Sonic"),
    ("starknet", "Starknet"), ("stellar", "Stellar"), ("story", "Story"),
    ("stride", "Stride"), ("sui", "Sui"), ("ton", "TON"),
    ("tron", "TRON"), ("unichain", "Unichain"),
    ("world-chain", "World Chain"), ("xdc", "XDC"), ("xion", "Xion"),
    ("x-layer", "X Layer"), ("xrpl", "XRP Ledger"),
    ("zksync", "ZKsync Era"),
]


def load_symbol(slug: str) -> tuple[str, float]:
    svg = (CHAINS_DIR / f"{slug}.svg").read_text()
    vb_m = re.search(r'viewBox="([^"]+)"', svg)
    if not vb_m:
        raise ValueError(f"{slug}: missing viewBox")
    vb = vb_m.group(1)
    parts = [float(x) for x in vb.replace(",", " ").split()]
    aspect = parts[2] / parts[3]
    inner_m = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
    inner = inner_m.group(1).strip()
    symbol = f'<symbol id="ch-{slug}" viewBox="{vb}">{inner}</symbol>'
    return symbol, aspect


def build() -> tuple[str, str]:
    symbols, items = [], []
    for slug, name in CHAINS:
        symbol, aspect = load_symbol(slug)
        symbols.append(symbol)
        width = round(LOGO_HEIGHT * aspect, 1)
        items.append(
            f'<span class="chain-logo" title="{name}">'
            f'<svg style="width:{width}px" aria-hidden="true">'
            f'<use href="#ch-{slug}"/></svg></span>'
        )
    sprite = (
        '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">'
        "<defs>" + "".join(symbols) + "</defs></svg>"
    )
    logos = "\n            ".join(items)
    marquee = f"""<div class="chain-marquee reveal" role="img" aria-label="Logos of blockchain networks supported by Artifact Systems">
          <div class="chain-track">
            <div class="chain-set">
            {logos}
            </div>
            <div class="chain-set" aria-hidden="true">
            {logos}
            </div>
          </div>
        </div>"""
    return sprite, marquee


def splice(html: str, start: str, end: str, content: str) -> str:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    replacement = f"{start}\n{content}\n{end}"
    if not pattern.search(html):
        raise ValueError(f"markers not found: {start}")
    return pattern.sub(lambda _: replacement, html)


def main() -> None:
    sprite, marquee = build()
    html = INDEX.read_text()
    html = splice(html, "<!-- chain-sprite:start -->", "<!-- chain-sprite:end -->", sprite)
    html = splice(html, "<!-- chain-marquee:start -->", "<!-- chain-marquee:end -->", marquee)
    INDEX.write_text(html)
    print(f"spliced {len(CHAINS)} chain logos into index.html")


if __name__ == "__main__":
    main()
