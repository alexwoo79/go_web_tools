import streamlit as st
from core.data_loader import load_file

st.set_page_config(page_title="BI工具", layout="wide")

st.title("📊 BI 分析平台")

file = st.sidebar.file_uploader("上传数据", type=["csv", "xlsx"])

if file:
    df = load_file(file)
    st.session_state["df"] = df
    st.success("数据加载成功")

page = st.sidebar.radio("功能", ["Pivot分析", "图表分析"])

if page == "Pivot分析":
    from pages.pivot_table import run
    run()
else:
    from pages.dashboard import run
    run()