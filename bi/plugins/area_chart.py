import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    y = cfg.get("y")
    color = cfg.get("color")

    if x not in df.columns:
        x = df.columns[0]
    if y not in df.columns:
        y = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    chart = alt.Chart(df).mark_area(opacity=0.6).encode(
        x=alt.X(f"{x}:T" if "date" in str(df[x].dtype).lower() else f"{x}:Q", title=x),
        y=alt.Y(f"{y}:Q", title=y),
    )
    if color and color in df.columns:
        chart = chart.encode(color=alt.Color(color))
    return chart.interactive()
