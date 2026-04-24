import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    if x not in df.columns:
        x = df.columns[0]

    chart = alt.Chart(df).mark_arc().encode(
        theta=alt.Theta("count():Q", title="count"),
        color=alt.Color(f"{x}:N", title=x),
    )
    return chart.interactive()
