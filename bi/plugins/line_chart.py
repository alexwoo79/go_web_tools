import altair as alt


def render(df, cfg):
    x = cfg.get("x")
    y = cfg.get("y")
    color = cfg.get("color")

    # Fallback to existing columns if requested ones are missing
    if x not in df.columns:
        x = df.columns[0]
    if y not in df.columns:
        y = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    # determine x type (temporal if datetime-like)
    x_dtype = str(df[x].dtype).lower()
    x_type = "T" if "datetime" in x_dtype or "date" in x_dtype else "Q"

    ax_x = f"{x}:{x_type}"
    ax_y = f"{y}:Q"

    # build base encoding
    encoding = [alt.X(ax_x, title=x), alt.Y(ax_y, title=y)]
    if color and color in df.columns:
        encoding.append(alt.Color(color))

    # interactive nearest selection + rule + labels (参考 data_chart 折线实现)
    nearest = alt.selection(type="single", nearest=True, on="mouseover", fields=[x], empty="none")

    line = alt.Chart(df).mark_line().encode(*encoding)

    selectors = (
        alt.Chart(df)
        .mark_point()
        .encode(x=alt.X(ax_x), opacity=alt.value(0))
        .add_selection(nearest)
    )

    points = line.mark_point().encode(opacity=alt.condition(nearest, alt.value(1), alt.value(0)))

    text = line.mark_text(align="left", dx=5, dy=-5, size=14).encode(text=alt.condition(nearest, ax_y, alt.value(" ")))

    rules = (
        alt.Chart(df)
        .mark_rule(color="gray", size=1)
        .encode(x=alt.X(ax_x))
        .transform_filter(nearest)
    )

    chart = alt.layer(line, selectors, points, rules, text)
    try:
        chart = chart.configure_mark(tooltip=alt.TooltipContent("encoding"))
    except Exception:
        pass

    return chart.interactive()