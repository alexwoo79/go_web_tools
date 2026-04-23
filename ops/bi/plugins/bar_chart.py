import altair as alt

def render(df, cfg):
    return alt.Chart(df).mark_bar().encode(
        x=alt.X(cfg["x"], sort=cfg["sort"]),
        y=cfg["y"],
        color=cfg.get("color")
    ).interactive()