import streamlit as st
from core.pivot_engine import run_pivot

def run():
    df = st.session_state.get("df")
    if df is None:
        st.warning("请先上传数据")
        return

    st.header("🔢 Pivot 多维分析")

    cols = df.columns.tolist()

    rows = st.multiselect("行维度", cols)
    columns = st.multiselect("列维度", cols)
    values = st.selectbox("值字段（可选）", [""] + cols)

    agg = st.selectbox("聚合函数", ["sum", "mean", "count"])

    pivot_df = run_pivot(
        df,
        rows,
        columns,
        values if values else None,
        agg
    )

    st.dataframe(pivot_df, use_container_width=True)