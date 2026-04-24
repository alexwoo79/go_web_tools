import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    y = cfg.get("y")
    color = cfg.get("color")

    if x not in df.columns:
        x = df.columns[0]
    if y not in df.columns:
        y = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    # For heatmap, aggregate counts by binned x/y
    chart = (
        alt.Chart(df)
        .mark_rect()
        .encode(
            x=alt.X(f"{x}:Q", bin=alt.Bin(maxbins=30), title=x),
            y=alt.Y(f"{y}:Q", bin=alt.Bin(maxbins=30), title=y),
            color=alt.Color("count():Q", title="count") if not color else alt.Color(color),
        )
    )
    return chart.interactive()
import altair as alt

def render(df, cfg):
    encoding = {
        "x": cfg["x"],
        "y": cfg["y"]
    }
    if "color" in cfg:
        encoding["color"] = cfg["color"]
    else:
        encoding["color"] = cfg["y"]
    return alt.Chart(df).mark_rect().encode(**encoding)