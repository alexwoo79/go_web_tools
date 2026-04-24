import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    y = cfg.get("y")
    color = cfg.get("color")

    # Fallbacks
    if x not in df.columns:
        x = df.columns[0]
    if y not in df.columns:
        y = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    chart = alt.Chart(df).mark_bar().encode(
        x=alt.X(f"{x}:O", title=x),
        y=alt.Y(f"{y}:Q", title=y),
    )
    if color and color in df.columns:
        chart = chart.encode(color=alt.Color(color))
    return chart.interactive()
import altair as alt

def render(df, cfg):
    encoding = {
        "x": alt.X(cfg["x"], sort=cfg["sort"]),
        "y": cfg["y"]
    }
    if "color" in cfg and cfg["color"]:
        encoding["color"] = cfg["color"]
    return alt.Chart(df).mark_bar().encode(**encoding).interactive()