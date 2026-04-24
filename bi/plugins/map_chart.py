import altair as alt


def render(df, cfg):
    # Expect cfg.x = longitude column, cfg.y = latitude column
    lon = cfg.get("x")
    lat = cfg.get("y")
    if lon not in df.columns or lat not in df.columns:
        # fallback: try common names
        possible_lon = [c for c in df.columns if "lon" in c.lower() or "lng" in c.lower()]
        possible_lat = [c for c in df.columns if "lat" in c.lower()]
        lon = lon if lon in df.columns else (possible_lon[0] if possible_lon else df.columns[0])
        lat = lat if lat in df.columns else (possible_lat[0] if possible_lat else (df.columns[1] if len(df.columns)>1 else df.columns[0]))

    chart = alt.Chart(df).mark_circle().encode(
        longitude=alt.Longitude(f"{lon}:Q"),
        latitude=alt.Latitude(f"{lat}:Q"),
        size=alt.value(30),
        tooltip=[lon, lat],
    )
    return chart
