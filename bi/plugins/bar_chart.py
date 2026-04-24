import altair as alt

def render(df, cfg):
    encoding = {
        "x": alt.X(cfg["x"], sort=cfg["sort"]),
        "y": cfg["y"]
    }
    if "color" in cfg and cfg["color"]:
        encoding["color"] = cfg["color"]
    return alt.Chart(df).mark_bar().encode(**encoding).interactive()