import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    y = cfg.get("y")

    if x not in df.columns:
        x = df.columns[0]
    if y not in df.columns:
        y = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    chart = alt.Chart(df).mark_boxplot().encode(
        x=alt.X(f"{x}:N", title=x),
        y=alt.Y(f"{y}:Q", title=y),
    )
    return chart.interactive()
