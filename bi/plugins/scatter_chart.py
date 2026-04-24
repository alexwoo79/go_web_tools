import altair as alt

def render(df, cfg):
    encoding = {
        "x": cfg["x"],
        "y": cfg["y"]
    }
    if "color" in cfg:
        encoding["color"] = cfg["color"]
    return alt.Chart(df).mark_point().encode(**encoding).interactive()