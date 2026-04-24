from streamlit_extras.dataframe_explorer import dataframe_explorer
import streamlit as st

# vega_datasets is optional (sample data). If missing, disable sample-data UI.
try:
    from vega_datasets import data as vega_data
    from vega_datasets import local_data
    has_vega = True
except Exception:
    vega_data = None
    local_data = None
    has_vega = False
from logic import (
    load_data, get_columns, process_topn_sort, get_sort_rule, get_chart_cfg, swap_xy,
     render_main_chart
)
import altair as alt
from core.data_loader import load_for_cleaning
from core.table_tools import (
    table_join, groupby_agg, multi_pivot, fillna_column, drop_duplicates, convert_column_type, add_calc_column, table_concat, export_csv, export_excel
)


st.set_page_config(page_title="BI工具", layout="wide")
st.title("📊 BI 分析工具")

#   边栏部分
def filter_df(df):
    df_filter = dataframe_explorer(df, case=False)
    return df_filter

with st.sidebar:
    # (甘特图作为独立页面已加入模式选择中)

    # ===== 数据加载 =====
    st.markdown("**数据加载**\n---")
    # st.markdown("**(1) 数据源**")
    # 支持使用内置测试数据或上传文件
    if has_vega:
        use_sample = st.sidebar.checkbox("测试数据", value=False)

        @st.cache_data
        def get_sample(ds_name):
            return vega_data(ds_name)

        if use_sample:
            sample_list = local_data.list_datasets()
            sample_name = st.selectbox("选择测试数据集", sample_list)
            df = get_sample(sample_name)
            file = None
        else:
            file = st.file_uploader("上传数据", type=["csv", "xlsx"])
    else:
        st.sidebar.info("安装 vega_datasets 可启用测试数据：pip install vega_datasets")
        use_sample = False
        file = st.file_uploader("上传数据", type=["csv", "xlsx"])
    # show data source summary after variables are defined
    try:
        if use_sample:
            data_status = f"已选样例: {sample_name}" if 'sample_name' in locals() else "已选样例: (未选择)"
        else:
            data_status = f"已选文件: {file.name}" if file else "已选文件: (未上传)"
    except Exception:
        data_status = "已选文件: (未知)"
    # st.markdown(f"**1. 数据加载** — {data_status}\n---")

    if not use_sample:
        if not file:
            st.info("请上传数据")
            st.stop()
        df = load_data(file)
        st.success("数据加载成功")
    else:
        st.success(f"已加载测试数据: {sample_name}")
    # ===== 模式切换（替代 pages ✔）=====
    st.markdown("**功能选择**\n---")
    mode = st.radio(
        "功能选择",
        [
            "⬇️ 清洗导出",
            "📊 EDA数据探索",
            "📊 图表分析",
            "🔢 Pivot分析",
            "🔄 逆透视分析",
            "🔗 表格Join",
            "🧮 分组聚合",
            "➕ 计算列",
        ]
    )
    # quick status: show currently selected mode
    # st.markdown(f"**已选功能：** {mode}")


 # =========================

    if mode == "📊 图表分析":
        st.markdown("**图表参数**\n---")
        st.header("图表分析参数设置")
        # st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        col1, col2 = st.columns(2)
        cols = get_columns(df_filter)
        # st.markdown("**2) 参数**")
        with st.container():
            with col1:
                x = st.selectbox("X轴", cols)
                y = st.selectbox("Y轴", cols)
            with col2:
                color = st.selectbox("Color", ["无"] + cols)
                chart_type = st.selectbox(
                    "图表类型",
                    [
                        "bar_chart",
                        "line_chart",
                        "scatter_chart",
                        "heatmap_chart",
                        "histogram_chart",
                        "boxplot_chart",
                        "area_chart",
                        "pie_chart",
                        "density_chart",
                        "distribute_density_chart",
                        "map_chart",
                    ]
                )
                pass
        # st.markdown("**3) 输出**")
        sort_mode = st.selectbox("排序依据", ["自动", "按X", "按Y", "无"])
        sort_order = st.radio("排序方向", ["升序", "降序"], horizontal=True)
        topn_mode = st.selectbox("TopN", ["关闭", "TopN", "BottomN"])
        topn_value = st.number_input("N值", 1, 1000, 10, key="topn_value")
        swap_flag = st.radio("X/Y互换", ["否", "是"], horizontal=True)
        # show quick selection summary for chart parameters
        st.caption(f"已选: X={x}, Y={y}, Color={color}, 图表={chart_type}")

    # ===== EDA: 探索性数据分析面板（放在图表分析前面） =====
    if mode == "📊 EDA数据探索":
        st.markdown("**EDA 探索**\n---")
        st.subheader("EDA 数据探索")
        # st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        # st.markdown("**2) 参数**")

            

    elif mode == "🔢 Pivot分析":
        st.markdown("**透视分析**\n---")
        st.header("多维透视分析")
        st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        st.markdown("**2) 参数**")
        rows = st.multiselect("行分组", cols)
        columns = st.multiselect("列分组", cols)
        values = st.multiselect("值字段", cols)
        aggs = st.multiselect("聚合方式", ["sum", "mean", "count", "min", "max"])
        st.markdown("**3) 输出**")

    elif mode == "🔄 逆透视分析":
        st.markdown("**逆透视/Unpivot**\n---")
        st.header("逆透视（melt/unpivot）分析")
        st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        st.markdown("**2) 参数**")
        id_vars = st.multiselect("保留字段（id_vars）", cols)
        value_vars = st.multiselect("需要逆透视的字段（value_vars）", [c for c in cols if c not in id_vars])
        var_name = st.text_input("变量名（var_name）", value="variable")
        value_name = st.text_input("值名（value_name）", value="value")
        st.markdown("**3) 输出**")

    elif mode == "🧮 分组聚合":
        st.markdown("**分组聚合**\n---")
        st.header("分组聚合分析（GroupBy）")
        st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        st.markdown("**2) 参数**")
        group_cols = st.multiselect("分组字段", cols)
        agg_col = st.selectbox("聚合字段", cols)
        agg_func = st.selectbox("聚合方式", ["sum", "mean", "count", "min", "max"])
        st.markdown("**3) 输出**")

    

    elif mode == "➕ 计算列":
        st.markdown("**计算列**\n---")
        st.header("自定义计算列")
        st.markdown("**1) 数据选择**")
        cols = get_columns(df)
        df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
        cols = get_columns(df_filter)
        st.markdown("**2) 参数**")
        expr = st.text_input("输入pandas表达式（如: A + B 或 A * 2）")
        new_col = st.text_input("新列名", value="new_col")
        st.markdown("**3) 输出**")

    elif mode == "⬇️ 清洗导出":
        # st.markdown(f"**清洗与导出** — {data_status}\n---")
        st.header("数据清洗与导出")
        # st.markdown("**1) 数据选择**")
        st.write("选择要导出的数据、格式，并下载文件")

        dataset_option = st.selectbox("选择导出数据", ["原始数据", "交互筛选数据", "清洗后数据"])

        if dataset_option == "原始数据":
            df_out = df

        elif dataset_option == "交互筛选数据":
            st.write("使用交互筛选选择要导出的数据子集：")
            cols = get_columns(df)
            df_filter = df[st.multiselect("数据列过滤（可选）", cols, default=cols)]
            df_out = filter_df(df_filter)

        else:  # 清洗后数据
            st.write("在导出前对数据应用清洗规则：先掐头/掐尾并可指定表头，然后选择列并执行后续清洗。")

            # 先：掐头/掐尾，并允许指定掐头后相对的 header 行
            max_rows = len(df)
            skip_head = st.number_input("跳过开头行数 (掐头)", min_value=0, max_value=max_rows, value=0, step=1, key="clean_skip_head")
            skip_tail = st.number_input("跳过末尾行数 (掐尾)", min_value=0, max_value=max_rows, value=0, step=1, key="clean_skip_tail")
            header_row = st.number_input("指定 header 行（相对于掐头后的数据，-1 表示不改变）", min_value=-1, max_value=max_rows - skip_head - skip_tail if (max_rows - skip_head - skip_tail) > 0 else 0, value=-1, step=1, key="clean_header_row")

            # If using uploaded file, prefer centralized load_for_cleaning (handles header=None).
            # If using sample data (or file is None), slice the in-memory DataFrame instead.
            if use_sample or file is None:
                start = int(skip_head)
                end = None if int(skip_tail) == 0 else -int(skip_tail)
                try:
                    df_sliced = df.iloc[start:end].copy()
                except Exception:
                    df_sliced = df.copy()
            else:
                try:
                    df_sliced = load_for_cleaning(file, skip_head=int(skip_head), skip_tail=int(skip_tail), header_row=int(header_row))
                except Exception as e:
                    st.warning(f"重新加载并处理文件失败，改用内存中的数据切片：{e}")
                    start = int(skip_head)
                    end = None if int(skip_tail) == 0 else -int(skip_tail)
                    try:
                        df_sliced = df.iloc[start:end].copy()
                    except Exception:
                        df_sliced = df.copy()

            # 基于切片后的数据提供列选择
            cols = get_columns(df_sliced)
            chosen_cols = st.multiselect("数据列过滤（可选）", cols, default=cols)
            df_out = df_sliced[chosen_cols].copy()
            df_out = filter_df(df_out).copy()  # 应用交互式过滤器后再进行清洗
            # 后续清洗选项（顺序：填充缺失 → 去重 → trim → 查找替换 → 类型转换）
            fillna_col = st.selectbox("选择要填充缺失值的列", ["(不处理)"] + chosen_cols)
            fillna_val = st.text_input("填充值", value="")
            drop_dup_cols = st.multiselect("选择去重的列（不选则全行去重）", chosen_cols)

            # 批量去除列前后空格
            cols_trim = st.multiselect("选择去除前后空格的列", chosen_cols)

            # 多列查找替换
            fr_cols = st.multiselect("选择要查找替换的列", chosen_cols)
            find_text = st.text_input("查找文本", value="")
            replace_text = st.text_input("替换为", value="")
            regex_flag = st.checkbox("使用正则表达式进行替换", value=False)

            # 类型转换
            type_col = st.selectbox("选择要转换类型的列", ["(不处理)"] + chosen_cols)
            type_target = st.selectbox("目标类型", ["int", "float", "str", "datetime", "date"]) 

            # 应用清洗
            if fillna_col != "(不处理)":
                df_out = fillna_column(df_out, fillna_col, fillna_val)
            if drop_dup_cols:
                df_out = drop_duplicates(df_out, drop_dup_cols)

            if cols_trim:
                for c in cols_trim:
                    if c in df_out.columns:
                        df_out[c] = df_out[c].astype(str).str.strip()

            if fr_cols and find_text != "":
                for c in fr_cols:
                    if c in df_out.columns:
                        try:
                            df_out[c] = df_out[c].astype(str).str.replace(find_text, replace_text, regex=regex_flag)
                        except Exception as e:
                            st.warning(f"列 {c} 替换失败: {e}")

            if type_col != "(不处理)":
                df_out = convert_column_type(df_out, type_col, type_target)

        st.write(f"导出数据预览（共 {len(df_out)} 行）")
        # st.dataframe(df_out.head(100), use_container_width=True)

        fmt = st.selectbox("文件格式", ["CSV", "Excel (.xlsx)"])
        include_index = st.checkbox("包含索引", value=False)
        file_name = st.text_input("文件名", value="export")

        if fmt == "CSV":
            data = export_csv(df_out, include_index=include_index)
            st.download_button("下载 CSV", data=data, file_name=f"{file_name}.csv", mime="text/csv")
        else:
            try:
                data = export_excel(df_out, include_index=include_index)
            except Exception as e:
                st.error(f"导出 Excel 失败：{e}。请确认已安装 openpyxl。")
            else:
                st.download_button("下载 Excel", data=data, file_name=f"{file_name}.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")



# 右侧容器
# 🔥 图表可视化
with st.container():

# (数据清洗功能已合并到“导出结果”面板，不再单独展示)


# =========================
# 📊 图表分析
# =========================
    # (甘特图通过独立页面/插件运行，不在此处调用)
    if mode == "📊 图表分析":
        st.subheader("数据可视化")
        st.expander("数据预览", expanded=True).write(df_filter)
       
        # st.info("可通过上方过滤器筛选数据")
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
        st.expander("数据预览", expanded=True).write(df_filter)
        if rows and columns and values and aggs:
            pivot_df = multi_pivot(df_filter, rows, columns, values, aggs)
            st.dataframe(pivot_df, use_container_width=True)
            st.download_button("下载透视表CSV", data=export_csv(pivot_df), file_name="pivot_table.csv", mime="text/csv")
        else:
            st.info("请在左侧选择行、列、值和聚合方式")
# =========================
# 🔢 UnPivot 分析
# =========================
    if mode == "🔄 逆透视分析":
        st.subheader("逆透视（melt）结果")
        st.expander("数据预览", expanded=True).write(df_filter)
        if id_vars and value_vars:
            df_melt = df_filter.melt(id_vars=id_vars, value_vars=value_vars, var_name=var_name, value_name=value_name)
            st.expander("逆透视结果预览", expanded=True).write(df_melt)
            # st.dataframe(df_melt, use_container_width=True)
            st.download_button("下载逆透视结果CSV", data=export_csv(df_melt), file_name="melted_data.csv", mime="text/csv")
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
        # 用于拼接的多文件上传
        file_multi = st.sidebar.file_uploader("上传多表（用于拼接）", type=["csv", "xlsx"], accept_multiple_files=True, key="concat")
        
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
                st.download_button("下载合并结果CSV", data=export_csv(df_join), file_name="joined_data.csv", mime="text/csv")

        # 如果上传了多文件，提供拼接（concat）按钮
        if file_multi:
            if st.sidebar.button("执行拼接", key="concat_exec"):
                dfs = [load_data(f) for f in file_multi]
                try:
                    df_concat = table_concat(dfs)
                except Exception as e:
                    st.sidebar.error(f"拼接失败: {e}")
                else:
                    with st.expander("拼接结果", expanded=True):
                        st.dataframe(df_concat, use_container_width=True)
                    st.download_button("下载拼接结果CSV", data=export_csv(df_concat), file_name="concat_data.csv", mime="text/csv")

# =========================
# "🧮 分组聚合"
# =========================
    if mode == "🧮 分组聚合":
        st.subheader("分组聚合")
        st.expander("数据预览", expanded=True).write(df_filter)
        if st.sidebar.button("执行分组聚合"):
            if group_cols and agg_col:
                df_group = groupby_agg(df, group_cols, agg_col, agg_func)
                st.dataframe(df_group, use_container_width=True)
                st.download_button("下载分组聚合结果CSV", data=export_csv(df_group), file_name="grouped_data.csv", mime="text/csv")
            else:
                st.warning("请选择分组字段和聚合字段")

# =========================
# "➕ 计算列"
# =========================
    if mode == "➕ 计算列":
        st.subheader("计算列结果预览")
        st.expander("数据预览", expanded=True).write(df_filter)
        if st.sidebar.button("执行计算"):
            if expr and new_col:
                try:
                    df_calc = add_calc_column(df_filter, expr, new_col)
                except Exception as e:
                    st.sidebar.error(f"计算失败: {e}")
                else:
                    st.dataframe(df_calc, use_container_width=True)
                    st.download_button("下载计算结果CSV", data=export_csv(df_calc), file_name="calculated_data.csv", mime="text/csv")
            else:
                st.warning("请输入计算表达式和新列名")

# =========================
# "⬇️ 导出结果" 相关逻辑已在边栏实现，这里不再重复
# =========================
    if mode == "⬇️ 清洗导出":
        st.subheader("导出结果预览")
        st.expander("数据预览", expanded=True).write(df_out)
        st.info("请在左侧选择要导出的数据和格式，下载文件") 


# ========================
# EDA 数据探索相关逻辑已在边栏实现，这里不再重复
# ========================
    if mode == "📊 EDA数据探索":
        with st.expander("数据预览", expanded=True):
            st.write(df_filter)

        numerical_columns = df_filter.select_dtypes(include=["number"]).columns.tolist()
        categorical_columns = df_filter.select_dtypes(include=["object", "category"]).columns.tolist()

        eda_option = st.radio(
            "选择 EDA 图表类型",
            [
                "数据轴概要",
                "数据轴交叉",
                "空值统计",
                "数据分布",
                "数值关系",
                "分类计数bar",
                "分类计数circle",
            ],
            horizontal=True,
        )

        try:
            if eda_option == "数据轴概要":
                if not numerical_columns:
                    st.warning("数据中没有数值列可用于概要展示")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_bar()
                        .encode(
                            alt.X(alt.repeat(), type="quantitative", bin=alt.Bin(maxbins=25)),
                            y="count()",
                        )
                        .properties(height=150)
                        .repeat(numerical_columns)
                    )
            elif eda_option == "数据轴交叉":
                if len(numerical_columns) < 2:
                    st.warning("需要至少两个数值列进行交叉散点矩阵")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_point(size=10)
                        .encode(
                            alt.X(alt.repeat("column"), type="quantitative"),
                            alt.Y(alt.repeat("row"), type="quantitative"),
                        )
                        .properties(width=200, height=150)
                        .repeat(column=numerical_columns, row=numerical_columns)
                    )
            elif eda_option == "空值统计":
                alt.data_transformers.disable_max_rows()
                nan_df = (
                    df_filter.isna().reset_index().melt(id_vars="index", var_name="column", value_name="NaN")
                )
                chart = (
                    alt.Chart(nan_df)
                    .mark_bar()
                    .encode(
                        x=alt.X("column:O", title="column"),
                        y=alt.Y("sum(NaN)", title="NaN Count"),
                        color=alt.Color("column", title="Columns"),
                        tooltip=["column", "sum(NaN)"],
                    )
                    .interactive()
                )
            elif eda_option == "数据分布":
                if not numerical_columns:
                    st.warning("没有数值列用于分布图")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_rect()
                        .encode(
                            alt.X(alt.repeat("column"), type="quantitative", bin=alt.Bin(maxbins=30)),
                            alt.Y(alt.repeat("row"), type="quantitative", bin=alt.Bin(maxbins=30)),
                            alt.Color("count()", title=None),
                        )
                        .properties(width=200, height=150)
                        .repeat(column=numerical_columns, row=numerical_columns)
                    ).resolve_scale(color="independent")
            elif eda_option == "数值关系":
                if not numerical_columns or not categorical_columns:
                    st.warning("需要数值和分类列以生成数值关系/箱线图")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_boxplot()
                        .encode(
                            alt.X(alt.repeat("column"), type="quantitative"),
                            alt.Y(alt.repeat("row"), type="nominal", title=""),
                        )
                        .properties(width=150)
                        .repeat(column=numerical_columns, row=categorical_columns)
                    )
            elif eda_option == "分类计数bar":
                if not categorical_columns:
                    st.warning("没有分类列用于计数条形图")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_bar()
                        .encode(alt.X("count()"), alt.Y(alt.repeat(), type="nominal", sort="x"))
                        .properties(width=200, height=150)
                        .repeat(categorical_columns)
                    )
            else:  # 分类计数circle
                if not categorical_columns:
                    st.warning("没有分类列用于circle计数图")
                else:
                    chart = (
                        alt.Chart(df_filter)
                        .mark_circle()
                        .encode(
                            alt.X(alt.repeat("column"), type="nominal", sort="-size", title=None),
                            alt.Y(alt.repeat("row"), type="nominal", sort="size", title=None),
                            alt.Color("count()", title=None),
                            alt.Size("count()", title=None),
                        )
                        .repeat(row=categorical_columns, column=categorical_columns)
                        .resolve_scale(color="independent", size="independent")
                    )

            # display chart if created
            if "chart" in locals():
                try:
                    chart = chart.configure_mark(tooltip=alt.TooltipContent("encoding"))
                    st.altair_chart(chart, use_container_width=True)
                except Exception as e:
                    st.error(f"创建 EDA 图表时出错: {e}")
        except Exception as e:
            st.error(f"生成 EDA 时出错: {e}")
        # stop here to avoid rendering the main chart
        st.stop()