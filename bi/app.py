from streamlit_extras.dataframe_explorer import dataframe_explorer
import streamlit as st
from logic import (
    load_data, get_columns, process_topn_sort, get_sort_rule, get_chart_cfg, swap_xy,
    run_pivot_analysis, get_pivot_chart, render_main_chart
)
from core.table_tools import (
    table_join, groupby_agg, multi_pivot, fillna_column, drop_duplicates, convert_column_type, add_calc_column, export_csv
)


st.set_page_config(page_title="BI工具", layout="wide")
st.title("📊 BI 分析工具")

#   边栏部分
def filter_df(df):
    df_filter = dataframe_explorer(df, case=False)
    return df_filter

with st.sidebar:
    # ===== 数据加载 =====
    file = st.file_uploader("上传数据", type=["csv", "xlsx"])
    if not file:
        st.info("请上传数据")
        st.stop()
    df = load_data(file)
    st.success("数据加载成功")


    # ===== 模式切换（替代 pages ✔）=====
    mode = st.radio(
        "功能选择",
        [
            "📊 图表分析",
            "🔢 Pivot分析",
            "🔄 逆透视分析",
            "🔗 表格Join",
            "🧮 分组聚合",
            "🧹 数据清洗",
            "➕ 计算列",
            "⬇️ 导出结果"
        ]
    )



    if mode == "📊 图表分析":
        st.header("图表分析参数设置")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        col1, col2 = st.columns(2)
        cols = get_columns(df_filter)
        with col1:
            x = st.selectbox("X轴", cols)
            y = st.selectbox("Y轴", cols)
        with col2:
            color = st.selectbox("Color", ["无"] + cols)
            chart_type = st.selectbox(
                "图表类型",
                ["bar_chart", "line_chart", "scatter_chart", "heatmap_chart"]
            )
        sort_mode = st.selectbox("排序依据", ["自动", "按X", "按Y", "无"])
        sort_order = st.radio("排序方向", ["升序", "降序"])
        topn_mode = st.selectbox("TopN", ["关闭", "TopN", "BottomN"])
        topn_value = st.number_input("N值", 1, 1000, 10)
        swap_flag = st.radio("X/Y互换", ["否", "是"])

    elif mode == "🔢 Pivot分析":
        st.header("多维透视分析")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        rows = st.multiselect("行维度", cols)
        columns = st.multiselect("列维度", cols)
        values = st.multiselect("值字段", cols)
        aggs = st.multiselect("聚合方式", ["sum", "mean", "count", "min", "max"])

    elif mode == "🔄 逆透视分析":
        st.header("逆透视（melt/unpivot）分析")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        id_vars = st.multiselect("保留字段（id_vars）", cols)
        value_vars = st.multiselect("需要逆透视的字段（value_vars）", [c for c in cols if c not in id_vars])
        var_name = st.text_input("变量名（var_name）", value="variable")
        value_name = st.text_input("值名（value_name）", value="value")

    elif mode == "🧮 分组聚合":
        st.header("分组聚合分析（GroupBy）")
        cols = get_columns(df)
        group_cols = st.multiselect("分组字段", cols)
        agg_col = st.selectbox("聚合字段", cols)
        agg_func = st.selectbox("聚合方式", ["sum", "mean", "count", "min", "max"])

    elif mode == "🧹 数据清洗":
        st.header("数据清洗/转换")
        cols = get_columns(df)
        st.write("1. 缺失值处理")
        fillna_col = st.selectbox("选择要填充缺失值的列", ["(不处理)"] + cols)
        fillna_val = st.text_input("填充值", value="")
        st.write("2. 去重")
        st.write("3. 类型转换")
        type_col = st.selectbox("选择要转换类型的列", ["(不处理)"] + cols)
        type_target = st.selectbox("目标类型", ["int", "float", "str"])

    elif mode == "➕ 计算列":
        st.header("自定义计算列")
        cols = get_columns(df)
        expr = st.text_input("输入pandas表达式（如: A + B 或 A * 2）")
        new_col = st.text_input("新列名", value="new_col")

    elif mode == "⬇️ 导出结果":
        st.header("导出分析结果")
        st.write("可将当前数据导出为CSV文件")
        csv = export_csv(df)
        st.download_button("下载CSV", data=csv, file_name="export.csv", mime="text/csv")



# 右侧容器
# 🔥 图表可视化
with st.container():
    if mode == "📊 图表分析":
        st.subheader("数据可视化")
       
        st.info("可通过上方过滤器筛选数据")
        # 字段处理
        use_x, use_y = swap_xy(x, y, swap_flag)
        # TopN和排序
        df_plot, sort_field = process_topn_sort(df_filter, sort_mode, sort_order, topn_mode, topn_value, use_x, use_y)
        # Altair排序规则
        sort_rule = get_sort_rule(sort_mode, sort_field, sort_order)
        # 配置
        cfg = get_chart_cfg(use_x, use_y, color, sort_rule)
        # 渲染
        chart = render_main_chart(chart_type, df_plot, cfg)
        st.altair_chart(chart, use_container_width=True)

# =========================
# 🔢 Pivot 分析
# =========================
    if mode == "🔢 Pivot分析":
        st.subheader("多指标/多聚合 透视表")
        if rows and columns and values and aggs:
            pivot_df = multi_pivot(df_filter, rows, columns, values, aggs)
            st.dataframe(pivot_df, use_container_width=True)
        else:
            st.info("请在左侧选择行、列、值和聚合方式")
# =========================
# 🔢 UnPivot 分析
# =========================
    if mode == "🔄 逆透视分析":
        st.subheader("逆透视（melt）结果")
        if id_vars and value_vars:
            df_melt = df_filter.melt(id_vars=id_vars, value_vars=value_vars, var_name=var_name, value_name=value_name)
            st.dataframe(df_melt, use_container_width=True)
        else:
            st.warning("请至少选择一个保留字段和一个需要逆透视的字段")


# =========================
# "🔗 表格Join"
# =========================
    if mode == "🔗 表格Join":
        st.header("表格 Join/合并")
        st.write("上传两份数据，选择连接字段和连接方式，合并后展示结果。")
        
        
        file1 = st.sidebar.file_uploader("上传主表", type=["csv", "xlsx"], key="main")
        file2 = st.sidebar.file_uploader("上传副表", type=["csv", "xlsx"], key="sub")
        
        if file1 and file2:
            df1 = load_data(file1)
            df2 = load_data(file2)
            col1, col2 = st.columns(2)
            with col1:
                with st.expander("数据预览", expanded=True):
                    st.write("主表", df1)
            with col2:
                with st.expander("数据预览", expanded=True):
                    st.write("副表", df2)
            cols1 = get_columns(df1)
            cols2 = get_columns(df2)
            left_on = st.sidebar.selectbox("主表连接字段", cols1)
            right_on = st.sidebar.selectbox("副表连接字段", cols2)
            how = st.sidebar.selectbox("连接方式", ["inner", "left", "right", "outer"])
            if st.sidebar.button("执行合并"):
                df_join = table_join(df1, df2, left_on, right_on, how)
                with st.expander("合并结果", expanded=True):
                    st.dataframe(df_join, use_container_width=True)

# =========================
# "🧮 分组聚合"
# =========================
    if mode == "🧮 分组聚合":
        st.subheader("分组聚合")
        if st.sidebar.button("执行分组聚合"):
            if group_cols and agg_col:
                df_group = groupby_agg(df, group_cols, agg_col, agg_func)
                st.dataframe(df_group, use_container_width=True)
            else:
                st.warning("请选择分组字段和聚合字段")