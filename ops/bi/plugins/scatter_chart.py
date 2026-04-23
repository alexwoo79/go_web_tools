import altair as alt

def render(df, cfg):
    return alt.Chart(df).mark_point().encode(
        x=cfg["x"],
        y=cfg["y"],
        color=cfg.get("color")
    ).interactive()