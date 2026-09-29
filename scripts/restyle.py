"""One-off migration of Tailwind classes from the old navy/cyan palette to semantic tokens."""
import re, sys, pathlib

SKIP = {"primitives.tsx", "AppShell.tsx", "overlays.tsx", "PageHeader.tsx", "Logo.tsx", "markers.tsx"}
B = r"(?<![\w\-\[])"   # token start
E = r"(?![\w\-/\[])"   # token end (no further suffix)

rules = [
    # scrims
    (B + r"bg-ink-950/(35|55)" + E, "bg-black/25"),
    # neutrals
    (B + r"bg-ink-950(/\d+)?" + E, "bg-surface"),
    (B + r"bg-ink-900(/\d+)?" + E, "bg-surface"),
    (B + r"bg-ink-850" + E, "bg-surface-2"),
    (B + r"bg-ink-(800|750)" + E, "bg-surface-3"),
    (B + r"bg-ink-700" + E, "bg-line"),
    (B + r"bg-ink-600" + E, "bg-line-strong"),
    (B + r"border-ink-(700|800)(/\d+)?" + E, "border-line"),
    (B + r"border-ink-(600|500)" + E, "border-line-strong"),
    (B + r"divide-ink-700(/\d+)?" + E, "divide-line"),
    (B + r"text-slate-(100|200)" + E, "text-fg"),
    (B + r"text-slate-300" + E, "text-fg-2"),
    (B + r"text-slate-400" + E, "text-fg-3"),
    (B + r"text-slate-(500|600|700)" + E, "text-fg-4"),
    (B + r"fill-slate-300" + E, "fill-fg-2"),
    (B + r"fill-slate-(400|500)" + E, "fill-fg-4"),
    (B + r"text-white" + E, "text-fg"),
    # accent (was cyan)
    (B + r"text-ink-950" + E, "text-white"),
    (B + r"hover:bg-cyan-300" + E, "hover:bg-accent-hover"),
    (B + r"bg-cyan-400/[\w\.\[\]]+" + E, "bg-accent-subtle"),
    (B + r"bg-cyan-400(/\d+)?" + E, "bg-accent"),
    (B + r"bg-cyan-(500|600)(/\d+)?" + E, "bg-accent"),
    (B + r"text-cyan-(100|200|300|400|500)(/\d+)?" + E, "text-accent"),
    (B + r"border-cyan-(300|400|500)/\d+" + E, "border-accent/40"),
    (B + r"border-cyan-(300|400|500)" + E, "border-accent"),
    (B + r"ring-cyan-400(/\d+)?" + E, "ring-accent"),
    (B + r"accent-cyan-400" + E, "accent-[var(--accent)]"),
    (B + r"decoration-red-400/\d+" + E, "decoration-danger/50"),
    # status
    (B + r"text-red-(200|300|400)(/\d+)?" + E, "text-danger"),
    (B + r"text-amber-(100|200|300|400)(/\d+)?" + E, "text-warn"),
    (B + r"text-emerald-(200|300|400)(/\d+)?" + E, "text-ok"),
    (B + r"text-(violet|sky|blue)-(200|300)(/\d+)?" + E, "text-accent"),
    (B + r"bg-red-(500|950)/[\w\.\[\]]+" + E, "bg-danger-subtle"),
    (B + r"bg-amber-(400|500)/[\w\.\[\]]+" + E, "bg-warn-subtle"),
    (B + r"bg-emerald-(400|500|950)/[\w\.\[\]]+" + E, "bg-ok-subtle"),
    (B + r"bg-violet-400/\d+" + E, "bg-accent-subtle"),
    (B + r"border-red-(400|500)/\d+" + E, "border-danger/40"),
    (B + r"border-red-(400|500)" + E, "border-danger"),
    (B + r"border-amber-(400|500)/\d+" + E, "border-warn/40"),
    (B + r"border-emerald-500/\d+" + E, "border-ok/50"),
    (B + r"border-emerald-500" + E, "border-ok"),
    (B + r"border-violet-400/\d+" + E, "border-accent/40"),
    (B + r"bg-red-600" + E, "bg-danger"),
    (B + r"bg-emerald-500" + E, "bg-ok"),
    (B + r"hover:bg-emerald-400" + E, "hover:opacity-90"),
    (B + r"hover:bg-red-500" + E, "hover:opacity-90"),
    # remove decorative flourishes
    (B + r"bg-gradient-to-[a-z]+" + E, ""),
    (B + r"from-[\w\-]+/\[[\d\.]+\]" + E, ""),
    (B + r"to-transparent" + E, ""),
    (B + r"uppercase" + E, ""),
    (B + r"tracking-\[[^\]]+\]" + E, ""),
    (B + r"tracking-(wider|widest|wide)" + E, ""),
    (B + r"blink-soft" + E, ""),
    (B + r"backdrop-blur(-\[[^\]]+\])?" + E, ""),
    (B + r"shadow-\[[^\]]+\]" + E, ""),
    (B + r"shadow-(2xl|xl)" + E, "shadow-float"),
    (B + r"font-extrabold" + E, "font-semibold"),
    (B + r"font-bold" + E, "font-semibold"),
    (B + r"rounded-(2xl|xl|lg)" + E, "rounded"),
    (B + r"text-\[(9|9\.5|10)px\]" + E, "text-[11px]"),
    (B + r"text-\[(10\.5|11|11\.5)px\]" + E, "text-xs"),
]

def fix_classes(src: str) -> str:
    for pat, rep in rules:
        src = re.sub(pat, rep, src)
    # tidy whitespace inside quoted class strings
    src = re.sub(r'className="([^"]*)"', lambda m: 'className="' + " ".join(m.group(1).split()) + '"', src)
    src = re.sub(r'(cx\([^)]*?)"\s+([^"]*?)\s+"', lambda m: m.group(0), src)
    return src

root = pathlib.Path("src")
changed = 0
for p in root.rglob("*.tsx"):
    if p.name in SKIP:
        continue
    s = p.read_text(encoding="utf-8")
    t = fix_classes(s)
    # also tidy double spaces inside "..." strings that look like class lists in cx(...)
    t = re.sub(r'"([a-z\-:\[\]\./0-9 %#(),_]+)"', lambda m: '"' + " ".join(m.group(1).split()) + '"' if "  " in m.group(1) or m.group(1).startswith(" ") or m.group(1).endswith(" ") else m.group(0), t)
    if t != s:
        p.write_text(t, encoding="utf-8")
        changed += 1
        print("restyled", p)
print("files changed:", changed)
