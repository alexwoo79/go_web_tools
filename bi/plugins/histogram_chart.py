import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    if x not in df.columns:
        x = df.columns[0]

    if df[x].dtype.kind in "biufc":
        x_type = "Q"
    else:
        x_type = "Q"

    chart = (
        alt.Chart(df)
        .mark_bar()
        .encode(
            alt.X(f"{x}:{x_type}", bin=alt.Bin(maxbins=30), title=x),
            y="count()",
        )
    )
    return chart.interactive()
