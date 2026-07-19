#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file for sharing.

Inlines the stylesheet (with the Inter font as a base64 data URI), the
logo SVG, and all scripts, and bakes in a snapshot of the latest real
Ethereum block so the hero animation streams genuine chain data even
where outbound requests are blocked (e.g. a hosted preview page).

Output is a body-only fragment (no doctype/html/head/body wrapper),
ready for hosts that wrap content themselves.

Usage: python3 build-share.py [output_path]
"""

import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "share" / "artifact-systems-preview.html"

RPC_ENDPOINTS = [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
]


def fetch_snapshot_pool():
    """Mirror of buildPool() in js/ascii-hero.js, run at build time."""
    body = json.dumps({
        "jsonrpc": "2.0", "id": 1,
        "method": "eth_getBlockByNumber", "params": ["latest", True],
    }).encode()
    block = None
    for url in RPC_ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=body, headers={
                "Content-Type": "application/json",
                # Some public endpoints reject urllib's default UA.
                "User-Agent": "Mozilla/5.0 (artifact-systems-build)",
            })
            with urllib.request.urlopen(req, timeout=10) as res:
                block = json.load(res).get("result")
            if block:
                break
        except Exception:
            continue
    if not block:
        return []

    def dec(h):
        try:
            return str(int(h, 16))
        except (TypeError, ValueError):
            return ""

    p = [
        f"ETH MAINNET  BLOCK {dec(block['number'])}  TS {dec(block['timestamp'])}",
        f"HASH {block['hash']}",
        f"PARENT {block['parentHash']}",
    ]
    if block.get("stateRoot"):
        p.append(f"STATEROOT {block['stateRoot']}")
    if block.get("miner"):
        p.append(f"PROPOSER {block['miner']}")
    p.append(f"GASUSED {dec(block['gasUsed'])}  GASLIMIT {dec(block['gasLimit'])}")
    if block.get("baseFeePerGas"):
        p.append(f"BASEFEE {int(block['baseFeePerGas'], 16) / 1e9:.2f} GWEI")
    for tx in (block.get("transactions") or [])[:80]:
        if isinstance(tx, str):
            p.append(f"TX {tx}")
            continue
        if tx.get("hash"):
            p.append(f"TX {tx['hash']}")
        if tx.get("from"):
            to = f"  TO {tx['to']}" if tx.get("to") else "  CONTRACT CREATION"
            p.append(f"FROM {tx['from']}{to}")
        if tx.get("value") and tx["value"] != "0x0":
            eth = int(tx["value"], 16) / 1e18
            if eth > 0:
                p.append(f"VALUE {eth:.4f} ETH")
    return p


def main():
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "css" / "style.css").read_text()

    # Inline the font as a data URI.
    font_b64 = base64.b64encode((ROOT / "fonts" / "InterVariable.woff2").read_bytes()).decode()
    css = css.replace(
        'url("../fonts/InterVariable.woff2") format("woff2")',
        f'url("data:font/woff2;base64,{font_b64}") format("woff2")',
    )

    # Body markup, minus the script tags.
    body = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]
    body = re.sub(r'\s*<script src="[^"]+"[^>]*></script>', "", body)

    # Logo SVG, with explicit dimensions for canvas rasterization.
    logo = (ROOT / "assets" / "ArtifactSystems_White_Logo.svg").read_text()
    logo = logo.replace("<svg ", '<svg width="528" height="80.32" ', 1)

    snapshot = fetch_snapshot_pool()
    scripts = "\n".join([
        # Theme boot (mirrors the head script in index.html).
        '(function () { var t = null; try { t = localStorage.getItem("as-theme"); } catch (e) {}'
        ' document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark"); })();',
        f"window.ARTIFACT_LOGO_SVG = {json.dumps(logo)};",
        f"window.ARTIFACT_SNAPSHOT_POOL = {json.dumps(snapshot)};",
        (ROOT / "js" / "rpc-config.js").read_text(),
        (ROOT / "js" / "main.js").read_text(),
        (ROOT / "js" / "ascii-hero.js").read_text(),
    ])

    fragment = (
        "<title>Artifact Systems Preview</title>\n"
        f"<style>\n{css}\n</style>\n"
        f"{body}\n"
        f"<script>\n{scripts}\n</script>\n"
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(fragment)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, "
          f"snapshot entries: {len(snapshot)})")

    # Full standalone document: open this one directly in a browser
    # (the fragment above is for hosts that wrap content themselves,
    # and renders in quirks mode if opened raw).
    standalone = OUT.parent / "artifact-systems-standalone.html"
    standalone.write_text(
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
        "<meta charset=\"UTF-8\" />\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n"
        "<title>Artifact Systems Preview</title>\n"
        f"<style>\n{css}\n</style>\n"
        "</head>\n<body>\n"
        f"{body}\n"
        f"<script>\n{scripts}\n</script>\n"
        "</body>\n</html>\n"
    )
    print(f"wrote {standalone} ({standalone.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
