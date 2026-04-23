import streamlit as st
from core.chart_engine import render_chart

def run():
    df = st.session_state.get("df")
    if df is None:
        st.warning("请先上传数据")
        return

    st.header("📊 图表分析")

    cols = df.columns.tolist()

    x = st.selectbox("X轴", cols)
    y = st.selectbox("Y轴", cols)
    color = st.selectbox("Color", ["无"] + cols)

    chart_type = st.selectbox(
        "图表类型",
        ["bar_chart", "line_chart", "scatter_chart", "heatmap_chart"]
    )

    sort = st.radio("排序", ["ascending", "descending", None])

    cfg = {
        "x": x,
        "y": y,
        "color": None if color == "无" else color,
        "sort": sort
    }

    chart = render_chart(chart_type, df, cfg)

    st.altair_chart(chart, use_container_width=True)