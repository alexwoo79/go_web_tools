import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    color = cfg.get("color")
    if x not in df.columns:
        x = df.columns[0]

    extent = [float(df[x].min()), float(df[x].max())] if df[x].dropna().shape[0] > 0 else None
    if color and color in df.columns:
        chart = (
            alt.Chart(df)
            .transform_density(x, as_=[x, "density"], extent=extent, groupby=[color])
            .mark_area(opacity=0.6)
            .encode(alt.X(f"{x}:Q", title=x), alt.Y("density:Q", title="Density"), color=alt.Color(color))
        )
    else:
        chart = (
            alt.Chart(df)
            .transform_density(x, as_=[x, "density"], extent=extent)
            .mark_area()
            .encode(alt.X(f"{x}:Q", title=x), alt.Y("density:Q", title="Density"))
        )
    return chart.interactive()
