"""Draw the README figures from results/<matter>.json, in light and dark.

Usage: python scripts/figures.py [matter-short-name]   (default: hartford)
"""
import json, sys, textwrap
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parent.parent
short = sys.argv[1] if len(sys.argv) > 1 else "hartford"
R = json.loads((ROOT / "results" / f"{short}.json").read_text(encoding="utf8"))
REASONS = json.loads((ROOT / "results" / f"{short}-court-reasons.json").read_text(encoding="utf8"))["reasons"]
OUT = ROOT / "docs" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

THEMES = {
    "light": dict(bg="#ffffff", ink="#1f2328", quiet="#59636e", rule="#d1d9e0", accent="#0969da", base="#8c959f", bad="#cf222e"),
    "dark": dict(bg="#0d1117", ink="#e6edf3", quiet="#9198a1", rule="#3d444d", accent="#4493f8", base="#656c76", bad="#f85149"),
}
plt.rcParams.update({"font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 12})
S = 1.35  # type scale: the figures shrink to about 40% on a phone


def canvas(t, w, h):
    fig = plt.figure(figsize=(w, h), dpi=200, facecolor=t["bg"])
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, w); ax.set_ylim(0, h); ax.axis("off")
    return fig, ax


def save(fig, name, theme):
    fig.savefig(OUT / f"{name}-{theme}.png", facecolor=fig.get_facecolor()); plt.close(fig)


def scoreboard(t, theme):
    """The court's deciding reasons, one square each: found by the red team on filing day, or missed."""
    n, k = R["courtReasons"], R["courtReasonsFlaggedByTwin"]
    fig, ax = canvas(t, 10, 3.0)
    ax.text(0.3, 2.6, f"The court's {n} deciding reasons, and how many the AI found from filing-day papers", color=t["ink"], fontsize=13.5*S, weight="bold", va="center")
    for i in range(n):
        ax.add_patch(FancyBboxPatch((0.3 + i * 0.95, 0.75), 0.8, 0.8, boxstyle="round,pad=0,rounding_size=0.1",
                                    fc=t["accent"] if i < k else t["rule"], ec="none"))
    ax.text(0.3 + n * 0.95 + 0.25, 1.15, f"{k} of {n}", color=t["ink"], fontsize=30*S, weight="bold", va="center")
    ax.text(0.3, 0.38, "found", color=t["accent"], fontsize=11*S, weight="bold", va="center")
    ax.text(0.3 + (n - 1) * 0.95, 0.38, "missed", color=t["quiet"], fontsize=11*S, va="center")
    save(fig, "scoreboard", theme)


def seams(t, theme):
    """Of the court's reasons the red team found, which ones it found by attacking an assumption the brief never states."""
    k, n = R["courtReasonsOnUnstated"], R["courtReasonsFlaggedByTwin"]
    fig, ax = canvas(t, 10, 2.6)
    ax.text(0.3, 2.2, "Where the reasons it found were hiding", color=t["ink"], fontsize=13.5*S, weight="bold", va="center")
    for i in range(n):
        x = 0.3 + i * 0.95
        if i < k:  # hollow, dashed: an assumption the brief relies on but never states
            ax.add_patch(FancyBboxPatch((x, 0.75), 0.8, 0.8, boxstyle="round,pad=0,rounding_size=0.1", fc="none", ec=t["bad"], lw=3, ls=(0, (3, 2))))
        else:
            ax.add_patch(FancyBboxPatch((x, 0.75), 0.8, 0.8, boxstyle="round,pad=0,rounding_size=0.1", fc=t["base"], ec="none"))
    ax.text(0.3 + n * 0.95 + 0.25, 1.15, f"{k} of {n}", color=t["ink"], fontsize=30*S, weight="bold", va="center")
    ax.text(0.3, 0.38, "in an assumption the brief never states", color=t["bad"], fontsize=11*S, weight="bold", va="center")
    ax.text(0.3 + (n - 1) * 0.95 + 0.8, 0.38, "in a stated claim", color=t["quiet"], fontsize=11*S, va="center", ha="right")
    save(fig, "seams", theme)


def scorecard(t, theme):
    """Each of the court's reasons, with the red team's rank on filing day."""
    rows = REASONS
    h = 1.9 + 0.78 * len(rows)
    fig, ax = canvas(t, 10, h)
    ax.text(0.3, h - 0.42, f"The court's {len(rows)} deciding reasons", color=t["ink"], fontsize=13.5*S, weight="bold", va="center")
    ax.text(8.95, h - 1.05, f"Place in the red\nteam's list of {R['attacks']}", color=t["quiet"], fontsize=10*S, ha="center", va="center")
    for i, r in enumerate(rows):
        y = h - 1.75 - i * 0.78
        ax.plot([0.3, 9.7], [y - 0.39] * 2, color=t["rule"], lw=0.8)
        ax.text(0.3, y, textwrap.fill(r["text"].replace('"', "“", 1).replace('"', "”", 1), 56), color=t["ink"], fontsize=11.5*S, va="center", linespacing=1.15)
        if r["twinRank"]:
            ax.add_patch(FancyBboxPatch((8.55, y - 0.17), 0.8, 0.34, boxstyle="round,pad=0,rounding_size=0.08", fc=t["accent"], ec="none"))
            ax.text(8.95, y, f"#{r['twinRank']}", color=t["bg"], fontsize=11.5*S, weight="bold", ha="center", va="center")
        else:
            ax.text(8.95, y, "missed", color=t["quiet"], fontsize=11*S, ha="center", va="center")
    save(fig, "scorecard", theme)


def rewritten(t, theme):
    """The court's reasons replayed against the rewritten brief."""
    n, k = R["hardenedReplayReasons"], R["hardenedReplayStillOpen"]
    fig, ax = canvas(t, 10, 2.2)
    ax.text(0.3, 1.85, "The court's deciding reasons, replayed against the edited brief", color=t["ink"], fontsize=13.5*S, weight="bold", va="center")
    for i in range(n):
        ax.add_patch(FancyBboxPatch((0.3 + i * 0.62, 0.58), 0.5, 0.5, boxstyle="round,pad=0,rounding_size=0.08", fc=t["bad"] if i < k else t["rule"], ec="none"))
    ax.text(0.3 + n * 0.62 + 0.25, 0.83, f"{k} of {n} deciding reasons still beat the brief\nafter {R['redlineEditsApplied']} AI edits", color=t["ink"], fontsize=12*S, va="center")
    save(fig, "rewritten", theme)


def readers(t, theme):
    """A frontier model calls each of the brief's claims: from the brief alone, with the red team's attacks, and with the AI judge's rulings too."""
    n, r = R["claims"], R["readers"]
    rows = [("Brief alone", r["briefOnly"]), ("+ red team's attacks", r["withAttacks"]), ("+ AI judge's rulings", r["withRulings"])]
    fig, ax = canvas(t, 10, 3.6)
    ax.text(0.3, 3.2, f"The brief's {n} claims an AI called the same way as the court", color=t["ink"], fontsize=13.5*S, weight="bold", va="center")
    for j, (label, k) in enumerate(rows):
        y = 2.25 - j * 0.78
        ax.text(0.3, y, label, color=t["ink"] if j else t["quiet"], fontsize=11*S, weight="bold" if j else "normal", va="center")
        for i in range(n):
            ax.add_patch(FancyBboxPatch((3.25 + i * 0.4, y - 0.16), 0.32, 0.32, boxstyle="round,pad=0,rounding_size=0.05", fc=t["accent"] if i < k else t["rule"], ec="none"))
        ax.text(3.25 + n * 0.4 + 0.15, y, f"{k} of {n}", color=t["ink"], fontsize=13*S, weight="bold", va="center")
    save(fig, "readers", theme)


for theme, t in THEMES.items():
    scoreboard(t, theme); seams(t, theme); scorecard(t, theme); rewritten(t, theme); readers(t, theme)
print("figures written to", OUT)
