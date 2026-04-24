import io
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st
from streamlit_extras.dataframe_explorer import dataframe_explorer

alt.data_transformers.disable_max_rows()

st.set_page_config(page_title="甘特图 (Altair)", layout="wide")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def get_demo_data() -> pd.DataFrame:
    """Load the bundled demo.csv as demo data."""
    demo_path = Path(__file__).parent / "demo.csv"
    df = pd.read_csv(demo_path)
    return df


def filter_data(df: pd.DataFrame) -> pd.DataFrame:
    """Render a preview/filter panel and return the filtered dataframe."""
    with st.expander("展开预览或过滤数据"):
        filtered_df = dataframe_explorer(df, case=False)
        st.data_editor(filtered_df, use_container_width=True)
    return filtered_df


# ---------------------------------------------------------------------------
# Sidebar configuration
# ---------------------------------------------------------------------------

def build_sidebar(df: pd.DataFrame):
    """Return all sidebar-selected config values."""
    st.sidebar.header("⚙️ 图表配置")

    all_cols = list(df.columns)
    date_cols = [c for c in all_cols if "date" in c.lower() or "start" in c.lower() or "end" in c.lower() or "time" in c.lower()]

    # Column selectors
    default_start = next((c for c in all_cols if "start" in c.lower()), all_cols[0])
    default_end   = next((c for c in all_cols if "end"   in c.lower()), all_cols[min(1, len(all_cols)-1)])
    default_task  = next((c for c in all_cols if "task"  in c.lower()), all_cols[min(2, len(all_cols)-1)])

    start_col = st.sidebar.selectbox("开始日期列", all_cols, index=all_cols.index(default_start))
    end_col   = st.sidebar.selectbox("结束日期列", all_cols, index=all_cols.index(default_end))
    task_col  = st.sidebar.selectbox("任务名称列", all_cols, index=all_cols.index(default_task))

    # Milestone columns  
    st.sidebar.markdown("---")
    st.sidebar.subheader("里程碑设置")
    non_date_cols = [c for c in all_cols if c not in [start_col, end_col]]
    milestone_col = st.sidebar.selectbox(
        "里程碑名称列 (可选,留空则不显示)",
        ["(不显示)"] + non_date_cols
    )
    milestone_col = None if milestone_col == "(不显示)" else milestone_col

    milestone_date_col = None
    if milestone_col:
        remaining_cols = [c for c in all_cols if c not in [start_col, end_col, task_col, milestone_col]]
        milestone_date_col = st.sidebar.selectbox(
            "里程碑日期列 (可选,留空则使用开始日期)",
            ["(使用开始日期)"] + remaining_cols
        )
        milestone_date_col = None if milestone_date_col == "(使用开始日期)" else milestone_date_col

    # Color / grouping
    st.sidebar.markdown("---")
    st.sidebar.subheader("颜色分组")
    color_options = [c for c in all_cols if c not in [start_col, end_col]]
    default_color = next((c for c in color_options if "project" in c.lower()), color_options[0] if color_options else None)
    color_col_choice = st.sidebar.selectbox(
        "颜色分组列 (可选,留空则使用默认色)",
        ["(不分组)"] + color_options,
        index=(["(不分组)"] + color_options).index(default_color) if default_color in color_options else 0
    )
    color_col = None if color_col_choice == "(不分组)" else color_col_choice

    # Project summary
    st.sidebar.markdown("---")
    st.sidebar.subheader("Project 汇总图")
    show_project_summary = st.sidebar.checkbox("显示 Project 整体时间横道图", value=True)
    group_col = None
    if show_project_summary:
        group_options = [c for c in all_cols if c not in [start_col, end_col, task_col]]
        if group_options:
            default_group = next((c for c in group_options if "project" in c.lower()), group_options[0])
            group_col = st.sidebar.selectbox(
                "Project 分组列",
                group_options,
                index=group_options.index(default_group)
            )

    # Time granularity
    st.sidebar.markdown("---")
    granularity_options = ["日 (Day)", "周 (Week)", "月 (Month)", "季度 (Quarter)", "年 (Year)"]
    time_granularity = st.sidebar.selectbox("时间粒度", granularity_options, index=2)

    # Show duration
    show_duration = st.sidebar.checkbox("显示任务周期(天)", value=True)

    # Description column & auto-number
    st.sidebar.markdown("---")
    st.sidebar.subheader("描述与编号")
    desc_options = [c for c in all_cols if c not in [start_col, end_col]]
    desc_col_choice = st.sidebar.selectbox(
        "任务描述列 (显示在柱体内)",
        ["(不显示)"] + desc_options,
    )
    desc_col = None if desc_col_choice == "(不显示)" else desc_col_choice
    show_task_number = st.sidebar.checkbox("任务自动编号 (01 02...)", value=False)

    # Task sort order
    st.sidebar.markdown("---")
    st.sidebar.subheader("任务排序")
    sort_by_start = st.sidebar.checkbox("组内按开始时间排序（先开始的在上方）", value=False)

    # Planned dates (baseline)
    st.sidebar.markdown("---")
    st.sidebar.subheader("计划日期（基准线）")
    plan_start_choice = st.sidebar.selectbox(
        "计划开始日期列 (可选)",
        ["(不显示)"] + all_cols,
    )
    plan_start_col = None if plan_start_choice == "(不显示)" else plan_start_choice
    plan_end_choice = st.sidebar.selectbox(
        "计划结束日期列 (可选)",
        ["(不显示)"] + all_cols,
    )
    plan_end_col = None if plan_end_choice == "(不显示)" else plan_end_choice

    # Visual style
    st.sidebar.markdown("---")
    st.sidebar.subheader("显示风格")
    hierarchical_view = st.sidebar.checkbox(
        "层级视图 (Project + Task 合并显示)", value=True
    )
    dark_theme = st.sidebar.checkbox("深色主题", value=False)
    show_task_details = st.sidebar.checkbox(
        "任务详情显示在横道图内", value=True
    )
    all_non_date_cols = [c for c in all_cols if c not in [start_col, end_col]]
    owner_col_choice = st.sidebar.selectbox(
        "负责人列 (显示在项目条上方)",
        ["(不显示)"] + all_non_date_cols,
    )
    owner_col = None if owner_col_choice == "(不显示)" else owner_col_choice

    return (
        start_col, end_col, task_col,
        milestone_col, milestone_date_col,
        color_col, show_project_summary, group_col,
        time_granularity, show_duration,
        desc_col, show_task_number, sort_by_start,
        plan_start_col, plan_end_col,
        hierarchical_view, dark_theme, show_task_details, owner_col,
    )


# ---------------------------------------------------------------------------
# Altair granularity helpers
# ---------------------------------------------------------------------------

GRANULARITY_CONFIG = {
    "日 (Day)":       {"format": "%Y-%m-%d", "tickCount": "day"},
    "周 (Week)":      {"format": "%Y/%V周",   "tickCount": "week"},
    "月 (Month)":     {"format": "%Y-%m",    "tickCount": "month"},
    "季度 (Quarter)": {"format": "%Y Q%q",   "tickCount": "month"},
    "年 (Year)":      {"format": "%Y",       "tickCount": "year"},
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    st.title("📊 甘特图 (Altair 版本)")

    # Data source
    use_demo = st.sidebar.checkbox("使用演示数据", value=True)
    if use_demo:
        raw_df = get_demo_data()
        st.info('当前使用演示数据。取消勾选"使用演示数据"可上传自定义文件。')
    else:
        uploaded = st.sidebar.file_uploader("上传 CSV / Excel 文件", type=["csv", "xlsx", "xls"])
        if uploaded is None:
            st.warning('请上传数据文件，或勾选"使用演示数据"。')
            return
        if uploaded.name.endswith(".csv"):
            raw_df = pd.read_csv(uploaded)
        else:
            raw_df = pd.read_excel(uploaded)

    (
        start_col, end_col, task_col,
        milestone_col, milestone_date_col,
        color_col, show_project_summary, group_col,
        time_granularity, show_duration,
        desc_col, show_task_number, sort_by_start,
        plan_start_col, plan_end_col,
        hierarchical_view, dark_theme, show_task_details, owner_col,
    ) = build_sidebar(raw_df)

    try:
        gantt_df = filter_data(raw_df).copy()

        if gantt_df.empty:
            st.warning("过滤后无可用数据，请调整筛选条件。")
            return

        # Parse dates
        gantt_df[start_col] = pd.to_datetime(gantt_df[start_col], errors="coerce")
        gantt_df[end_col]   = pd.to_datetime(gantt_df[end_col],   errors="coerce")
        gantt_df = gantt_df.dropna(subset=[start_col, end_col]).reset_index(drop=True)

        if gantt_df.empty:
            st.warning("筛选后的数据缺少有效的开始/结束日期，无法生成甘特图。")
            return

        # Duration
        gantt_df["Duration"] = (
            (gantt_df[end_col] - gantt_df[start_col]).dt.total_seconds() / (24 * 3600)
        ).astype(int)

        # Sort tasks: group by color_col, within group by start date or original order
        if color_col and color_col in gantt_df.columns:
            if sort_by_start:
                gantt_df = (
                    gantt_df.sort_values([color_col, start_col], kind="stable")
                    .reset_index(drop=True)
                )
            else:
                gantt_df["_orig_order"] = range(len(gantt_df))
                gantt_df = (
                    gantt_df.sort_values([color_col, "_orig_order"], kind="stable")
                    .drop(columns=["_orig_order"])
                    .reset_index(drop=True)
                )
        elif sort_by_start:
            # No color grouping — sort all tasks by start date
            gantt_df = gantt_df.sort_values(start_col, kind="stable").reset_index(drop=True)

        # Auto-number tasks if requested (01 Task, 02 Task ...)
        if show_task_number:
            gantt_df[task_col] = [
                f"{i+1:02d}  {v}" for i, v in enumerate(gantt_df[task_col])
            ]

        # Task order for Y-axis: Altair's sort list places the first element at the TOP
        task_order = gantt_df[task_col].tolist()

        gcfg = GRANULARITY_CONFIG.get(time_granularity, GRANULARITY_CONFIG["月 (Month)"])
        x_axis = alt.Axis(format=gcfg["format"], tickCount=gcfg["tickCount"], grid=True)
        color_scale = alt.Scale(scheme="tableau10")

        # ==================================================================
        # HIERARCHICAL VIEW: thick project header bars + thin task bars
        # Mirrors the reference project-management Gantt chart style.
        # ==================================================================
        if hierarchical_view and color_col and color_col in gantt_df.columns:
            _Y = "_row_label"

            # Build combined rows: project summary row followed by its tasks
            hier_rows: list = []
            seen_projects: list = []
            for pname in gantt_df[color_col]:
                if pname not in seen_projects:
                    seen_projects.append(pname)

            for pname in seen_projects:
                grp = gantt_df[gantt_df[color_col] == pname]
                p_start = grp[start_col].min()
                p_end   = grp[end_col].max()
                p_dur   = int((p_end - p_start).total_seconds() / 86400)

                proj_entry: dict = {
                    _Y: pname,
                    "_row_type": "project",
                    "_s": p_start.strftime("%Y-%m-%dT%H:%M:%S"),
                    "_e": p_end.strftime("%Y-%m-%dT%H:%M:%S"),
                    "Duration": p_dur,
                    color_col: pname,
                }
                if owner_col and owner_col in gantt_df.columns:
                    owners = grp[owner_col].dropna().tolist()
                    proj_entry[owner_col] = str(owners[0]) if owners else ""
                if desc_col and desc_col in gantt_df.columns and desc_col != color_col:
                    proj_entry[desc_col] = ""
                hier_rows.append(proj_entry)

                for _, row in grp.iterrows():
                    task_entry: dict = {
                        _Y: f"  {row[task_col]}",
                        "_row_type": "task",
                        "_s": row[start_col].strftime("%Y-%m-%dT%H:%M:%S"),
                        "_e": row[end_col].strftime("%Y-%m-%dT%H:%M:%S"),
                        "Duration": int(row["Duration"]),
                        color_col: pname,
                        task_col: row[task_col],
                    }
                    if owner_col and owner_col in gantt_df.columns:
                        task_entry[owner_col] = ""
                    if desc_col and desc_col in gantt_df.columns:
                        task_entry[desc_col] = str(row[desc_col]) if pd.notna(row.get(desc_col)) else ""
                    if milestone_col and milestone_col in gantt_df.columns:
                        task_entry[milestone_col] = row.get(milestone_col)
                    if milestone_date_col and milestone_date_col in gantt_df.columns:
                        task_entry[milestone_date_col] = row.get(milestone_date_col)
                    hier_rows.append(task_entry)

            hier_df = pd.DataFrame(hier_rows)
            hier_order = hier_df[_Y].tolist()
            proj_df_h = hier_df[hier_df["_row_type"] == "project"].copy()
            task_df_h = hier_df[hier_df["_row_type"] == "task"].copy()

            color_enc_h = alt.Color(
                f"{color_col}:N", scale=color_scale,
                legend=alt.Legend(title=color_col),
            )

            # Project header bars — thick
            proj_bars = (
                alt.Chart(proj_df_h)
                .mark_bar(size=22, cornerRadius=3, clip=True, opacity=0.95)
                .encode(
                    x=alt.X("_s:T", axis=x_axis, title="日期"),
                    x2=alt.X2("_e:T"),
                    y=alt.Y(
                        f"{_Y}:N", sort=hier_order,
                        scale=alt.Scale(padding=0.4),
                        axis=alt.Axis(title=None, labelLimit=380),
                    ),
                    color=color_enc_h,
                    tooltip=[
                        alt.Tooltip(f"{_Y}:N", title="项目"),
                        alt.Tooltip("_s:T", title="开始"),
                        alt.Tooltip("_e:T", title="结束"),
                        alt.Tooltip("Duration:Q", title="周期(天)"),
                    ],
                )
            )

            # Task bars — thin
            task_bars_h = (
                alt.Chart(task_df_h)
                .mark_bar(size=11, cornerRadius=2, clip=True, opacity=0.85)
                .encode(
                    x=alt.X("_s:T"),
                    x2=alt.X2("_e:T"),
                    y=alt.Y(f"{_Y}:N", sort=hier_order, scale=alt.Scale(padding=0.4)),
                    color=color_enc_h,
                    tooltip=[
                        alt.Tooltip(f"{_Y}:N", title="任务"),
                        alt.Tooltip("_s:T", title="开始"),
                        alt.Tooltip("_e:T", title="结束"),
                        alt.Tooltip("Duration:Q", title="周期(天)"),
                    ],
                )
            )

            layers = [proj_bars, task_bars_h]

            # Owner / responsible person name above project bar
            if owner_col and owner_col in proj_df_h.columns:
                owner_vis = proj_df_h[proj_df_h[owner_col].str.strip().ne("")]
                if not owner_vis.empty:
                    layers.append(
                        alt.Chart(owner_vis)
                        .mark_text(
                            align="left", baseline="bottom",
                            dx=5, dy=-14, fontSize=11, fontWeight="bold", clip=True,
                        )
                        .encode(
                            x=alt.X("_s:T"),
                            y=alt.Y(f"{_Y}:N", sort=hier_order, scale=alt.Scale(padding=0.4)),
                            text=alt.Text(f"{owner_col}:N"),
                        )
                    )

            # Description text inside task bars
            if show_task_details:
                text_field = desc_col if desc_col and desc_col in task_df_h.columns else task_col
                layers.append(
                    alt.Chart(task_df_h)
                    .mark_text(
                        align="left", baseline="middle", dx=6, fontSize=10,
                        color="white" if dark_theme else "black", clip=True,
                    )
                    .encode(
                        x=alt.X("_s:T"),
                        y=alt.Y(f"{_Y}:N", sort=hier_order, scale=alt.Scale(padding=0.4)),
                        text=alt.Text(f"{text_field}:N"),
                    )
                )

            # Planned (baseline) bars — dashed outline on task rows
            if (plan_start_col and plan_end_col
                    and plan_start_col in gantt_df.columns
                    and plan_end_col in gantt_df.columns):
                plan_map = gantt_df[[task_col, plan_start_col, plan_end_col]].copy()
                plan_map[plan_start_col] = pd.to_datetime(plan_map[plan_start_col], errors="coerce")
                plan_map[plan_end_col]   = pd.to_datetime(plan_map[plan_end_col],   errors="coerce")
                plan_map = plan_map.dropna(subset=[plan_start_col, plan_end_col])
                plan_map[_Y] = "  " + plan_map[task_col]   # must match the task row labels in hier_order
                plan_map["_ps"] = plan_map[plan_start_col].dt.strftime("%Y-%m-%dT%H:%M:%S")
                plan_map["_pe"] = plan_map[plan_end_col].dt.strftime("%Y-%m-%dT%H:%M:%S")
                if not plan_map.empty:
                    layers.append(
                        alt.Chart(plan_map)
                        .mark_bar(
                            filled=False, stroke="gray", strokeDash=[4, 3],
                            strokeWidth=1.5, size=11, opacity=0.7, clip=True,
                        )
                        .encode(
                            x=alt.X("_ps:T", axis=None),
                            x2=alt.X2("_pe:T"),
                            y=alt.Y(f"{_Y}:N", sort=hier_order, scale=alt.Scale(padding=0.4)),
                            tooltip=[
                                alt.Tooltip(f"{task_col}:N", title="任务"),
                                alt.Tooltip("_ps:T", title="计划开始"),
                                alt.Tooltip("_pe:T", title="计划结束"),
                            ],
                        )
                    )

            # Milestone markers on task rows
            if milestone_col and milestone_col in hier_df.columns:
                ms_h = hier_df[
                    (hier_df["_row_type"] == "task") & hier_df[milestone_col].notna()
                ].copy()
                if not ms_h.empty:
                    if milestone_date_col and milestone_date_col in ms_h.columns:
                        ms_h["_ms_date"] = pd.to_datetime(ms_h[milestone_date_col], errors="coerce")
                    else:
                        ms_h["_ms_date"] = pd.to_datetime(ms_h["_s"], errors="coerce")
                    ms_h = ms_h.dropna(subset=["_ms_date"])
                    if not ms_h.empty:
                        ms_h["_msd"] = ms_h["_ms_date"].dt.strftime("%Y-%m-%dT%H:%M:%S")
                        ms_tip_h = [
                            alt.Tooltip(f"{milestone_col}:N", title="里程碑"),
                            alt.Tooltip("_msd:T", title="日期"),
                        ]
                        layers += [
                            alt.Chart(ms_h)
                            .mark_rule(color="crimson", strokeDash=[5, 4], strokeWidth=1, opacity=0.4)
                            .encode(x=alt.X("_msd:T"), tooltip=ms_tip_h),
                            alt.Chart(ms_h)
                            .mark_text(text="!", fontSize=16, fontWeight="bold", color="crimson")
                            .encode(
                                x=alt.X("_msd:T"),
                                y=alt.Y(f"{_Y}:N", sort=hier_order, scale=alt.Scale(padding=0.4)),
                                tooltip=ms_tip_h,
                            ),
                            alt.Chart(ms_h)
                            .mark_text(angle=270, align="right", fontSize=10,
                                       color="crimson", opacity=0.85, dx=-3)
                            .encode(
                                x=alt.X("_msd:T"),
                                y=alt.value(10),
                                text=alt.Text(f"{milestone_col}:N"),
                            ),
                        ]

            chart_height = max(400, len(hier_df) * 22 + 80)

        else:
            # ==================================================================
            # FLAT VIEW: original single-level chart
            # ==================================================================
            hier_df = None

            bar_df = gantt_df.copy()
            bar_df[start_col] = bar_df[start_col].dt.strftime("%Y-%m-%dT%H:%M:%S")
            bar_df[end_col]   = bar_df[end_col].dt.strftime("%Y-%m-%dT%H:%M:%S")

            plan_df = None
            if (plan_start_col and plan_end_col
                    and plan_start_col in gantt_df.columns
                    and plan_end_col in gantt_df.columns):
                plan_df = gantt_df[[task_col, plan_start_col, plan_end_col]].copy()
                plan_df[plan_start_col] = pd.to_datetime(plan_df[plan_start_col], errors="coerce")
                plan_df[plan_end_col]   = pd.to_datetime(plan_df[plan_end_col],   errors="coerce")
                plan_df = plan_df.dropna(subset=[plan_start_col, plan_end_col])
                plan_df[plan_start_col] = plan_df[plan_start_col].dt.strftime("%Y-%m-%dT%H:%M:%S")
                plan_df[plan_end_col]   = plan_df[plan_end_col].dt.strftime("%Y-%m-%dT%H:%M:%S")

            tooltip_fields = [task_col, start_col, end_col]
            if color_col:
                tooltip_fields.append(color_col)
            if show_duration:
                tooltip_fields.append("Duration")

            color_encoding = (
                alt.Color(f"{color_col}:N", scale=color_scale, legend=alt.Legend(title=color_col))
                if color_col
                else alt.value("#4C78A8")
            )

            bars = (
                alt.Chart(bar_df)
                .mark_bar(opacity=0.82, clip=True, cornerRadius=2)
                .encode(
                    x=alt.X(f"{start_col}:T", axis=x_axis, title="日期"),
                    x2=alt.X2(f"{end_col}:T"),
                    y=alt.Y(
                        f"{task_col}:N",
                        sort=task_order,
                        scale=alt.Scale(padding=0.4),
                        axis=alt.Axis(title=None, labelLimit=350),
                    ),
                    color=color_encoding,
                    tooltip=[
                        alt.Tooltip(f"{c}:N" if c not in [start_col, end_col] else f"{c}:T")
                        for c in tooltip_fields
                    ],
                )
            )

            layers = [bars]

            if plan_df is not None and not plan_df.empty:
                layers.append(
                    alt.Chart(plan_df)
                    .mark_bar(
                        filled=False, stroke="gray", strokeDash=[4, 3],
                        strokeWidth=1.5, opacity=0.7, clip=True,
                    )
                    .encode(
                        x=alt.X(f"{plan_start_col}:T", axis=None),
                        x2=alt.X2(f"{plan_end_col}:T"),
                        y=alt.Y(f"{task_col}:N", sort=task_order, scale=alt.Scale(padding=0.4)),
                        tooltip=[
                            alt.Tooltip(f"{task_col}:N", title="任务"),
                            alt.Tooltip(f"{plan_start_col}:T", title="计划开始"),
                            alt.Tooltip(f"{plan_end_col}:T", title="计划结束"),
                        ],
                    )
                )

            if show_task_details:
                text_field = desc_col if desc_col and desc_col in bar_df.columns else task_col
                layers.append(
                    alt.Chart(bar_df)
                    .mark_text(
                        align="left", baseline="middle", dx=6, dy=0, fontSize=11,
                        color="white" if dark_theme else "black", clip=True,
                    )
                    .encode(
                        x=alt.X(f"{start_col}:T"),
                        y=alt.Y(f"{task_col}:N", sort=task_order, scale=alt.Scale(padding=0.4)),
                        text=alt.Text(f"{text_field}:N"),
                        tooltip=[
                            alt.Tooltip(f"{c}:N" if c not in [start_col, end_col] else f"{c}:T")
                            for c in tooltip_fields
                        ],
                    )
                )

            if milestone_col and milestone_col in gantt_df.columns:
                milestones_raw = gantt_df[gantt_df[milestone_col].notna()].copy()
                if not milestones_raw.empty:
                    if milestone_date_col and milestone_date_col in gantt_df.columns:
                        milestones_raw["_ms_date"] = pd.to_datetime(
                            milestones_raw[milestone_date_col], errors="coerce"
                        )
                    else:
                        milestones_raw["_ms_date"] = milestones_raw[start_col]
                    milestones_raw = milestones_raw.dropna(subset=["_ms_date"])
                    if not milestones_raw.empty:
                        ms_df = milestones_raw[[milestone_col, task_col, "_ms_date"]].copy()
                        ms_df["_ms_date"] = ms_df["_ms_date"].dt.strftime("%Y-%m-%dT%H:%M:%S")
                        ms_df = ms_df.sort_values("_ms_date").reset_index(drop=True)
                        ms_tooltip = [
                            alt.Tooltip(f"{milestone_col}:N", title="里程碑"),
                            alt.Tooltip("_ms_date:T", title="日期"),
                            alt.Tooltip(f"{task_col}:N", title="任务"),
                        ]
                        layers += [
                            alt.Chart(ms_df)
                            .mark_rule(color="crimson", strokeDash=[5, 4], strokeWidth=1, opacity=0.4)
                            .encode(x=alt.X("_ms_date:T", title=""), tooltip=ms_tooltip),
                            alt.Chart(ms_df)
                            .mark_text(text="!", fontSize=18, fontWeight="bold", color="crimson")
                            .encode(
                                x=alt.X("_ms_date:T"),
                                y=alt.Y(f"{task_col}:N", sort=task_order, scale=alt.Scale(padding=0.4)),
                                tooltip=ms_tooltip,
                            ),
                            alt.Chart(ms_df)
                            .mark_text(angle=270, align="right", fontSize=10,
                                       color="crimson", opacity=0.85, dx=-3)
                            .encode(
                                x=alt.X("_ms_date:T"),
                                y=alt.value(10),
                                text=alt.Text(f"{milestone_col}:N"),
                                tooltip=ms_tooltip,
                            ),
                        ]

            if color_col and color_col in gantt_df.columns:
                groups = gantt_df[color_col].tolist()
                boundary_tasks = [
                    {task_col: gantt_df[task_col].iloc[i - 1]}
                    for i in range(1, len(groups)) if groups[i] != groups[i - 1]
                ]
                if boundary_tasks:
                    bdf = pd.DataFrame(boundary_tasks)
                    bdf["_x0"] = bar_df[start_col].min()
                    bdf["_x1"] = bar_df[end_col].max()
                    layers.append(
                        alt.Chart(bdf)
                        .mark_rect(height=1, color="gray", opacity=0.6)
                        .encode(
                            x=alt.X("_x0:T"),
                            x2=alt.X2("_x1:T"),
                            y=alt.Y(f"{task_col}:N", sort=task_order),
                        )
                    )

            chart_height = max(300, len(gantt_df) * 25 + 80)

        # ==================================================================
        # Assemble final chart with dark / light theme
        # ==================================================================
        chart_base = (
            alt.layer(*layers)
            .properties(title="甘特图", width="container", height=chart_height)
        )

        if dark_theme:
            BG   = "#1a2b4a"
            GRID = "rgba(255,255,255,0.08)"
            FG   = "white"
            chart = (
                chart_base
                .configure(background=BG)
                .configure_view(fill=BG, stroke="transparent")
                .configure_title(fontSize=16, color=FG)
                .configure_axis(
                    gridColor=GRID, gridOpacity=1,
                    labelColor=FG, titleColor=FG,
                    domainColor="rgba(255,255,255,0.2)",
                    tickColor="rgba(255,255,255,0.2)",
                    labelFontSize=12, titleFontSize=13,
                )
                .configure_legend(labelColor=FG, titleColor=FG)
                .interactive()
            )
        else:
            chart = (
                chart_base
                .configure_title(fontSize=16)
                .configure_axis(gridColor="lightgray", labelFontSize=12, titleFontSize=13)
                .interactive()
            )

        st.altair_chart(chart, use_container_width=True)

        # Download buttons for task chart
        with st.container(border=True):
            dl_col1, dl_col2 = st.columns(2)
            with dl_col1:
                html_bytes = chart.to_html().encode("utf-8")
                st.download_button(
                    label="📥 Task 详细图 HTML",
                    data=html_bytes,
                    file_name="gantt_chart.html",
                    mime="text/html",
                    use_container_width=True,
                )
            with dl_col2:
                display_cols = [task_col, start_col, end_col, "Duration"]
                if color_col and color_col not in display_cols:
                    display_cols.insert(1, color_col)
                if milestone_col and milestone_col in gantt_df.columns and milestone_col not in display_cols:
                    display_cols.append(milestone_col)
                if milestone_date_col and milestone_date_col in gantt_df.columns and milestone_date_col not in display_cols:
                    display_cols.append(milestone_date_col)
                display_df = gantt_df[display_cols].copy()
                csv_buf = io.BytesIO()
                display_df.to_csv(csv_buf, index=False, encoding="utf-8")
                csv_buf.seek(0)
                st.download_button(
                    label="📥 下载数据 CSV",
                    data=csv_buf,
                    file_name="gantt_data.csv",
                    mime="text/csv",
                    use_container_width=True,
                )

        # ----------------------------------------------------------------
        # Project summary Gantt (skipped in hierarchical view — already embedded)
        # ----------------------------------------------------------------
        if not hierarchical_view and show_project_summary and group_col and group_col in gantt_df.columns:
            project_df = (
                gantt_df.groupby(group_col)
                .agg(
                    Project_Start=(start_col, "min"),
                    Project_End=(end_col, "max"),
                )
                .reset_index()
            )
            project_df["Duration"] = (
                (project_df["Project_End"] - project_df["Project_Start"])
                .dt.total_seconds() / (24 * 3600)
            ).astype(int)

            project_order = project_df[group_col].tolist()[::-1]
            proj_df_str = project_df.copy()
            proj_df_str["Project_Start"] = proj_df_str["Project_Start"].dt.strftime("%Y-%m-%dT%H:%M:%S")
            proj_df_str["Project_End"]   = proj_df_str["Project_End"].dt.strftime("%Y-%m-%dT%H:%M:%S")

            project_chart = (
                alt.Chart(proj_df_str)
                .mark_bar()
                .encode(
                    x=alt.X("Project_Start:T", axis=x_axis, title="日期"),
                    x2=alt.X2("Project_End:T"),
                    y=alt.Y(
                        f"{group_col}:N",
                        sort=project_order,
                        axis=alt.Axis(title="项目", labelLimit=300),
                    ),
                    color=alt.Color(f"{group_col}:N", scale=alt.Scale(scheme="tableau10"), legend=None),
                    tooltip=[
                        alt.Tooltip(f"{group_col}:N", title="项目"),
                        alt.Tooltip("Project_Start:T", title="开始"),
                        alt.Tooltip("Project_End:T", title="结束"),
                        alt.Tooltip("Duration:Q", title="周期(天)"),
                    ],
                )
                .properties(
                    title=f"Project 整体时间横道图（按 {group_col} 聚合）",
                    width="container",
                    height=max(150, len(project_df) * 40 + 60),
                )
                .configure_title(fontSize=16)
                .configure_axis(labelFontSize=12, titleFontSize=13)
                .interactive()
            )

            st.altair_chart(project_chart, use_container_width=True)

            proj_html_bytes = project_chart.to_html().encode("utf-8")
            st.download_button(
                label="📥 Project 整体图 HTML",
                data=proj_html_bytes,
                file_name="gantt_project_summary.html",
                mime="text/html",
                use_container_width=True,
            )

        # ----------------------------------------------------------------
        # Detail table
        # ----------------------------------------------------------------
        with st.expander("查看详细数据"):
            st.dataframe(display_df, use_container_width=True)

        # ----------------------------------------------------------------
        # Statistics
        # ----------------------------------------------------------------
        st.write("---")
        st.subheader("📈 统计信息")
        sc1, sc2, sc3, sc4 = st.columns(4)

        with sc1:
            st.metric("总任务数", len(gantt_df))
        with sc2:
            st.metric("平均周期(天)", f"{gantt_df['Duration'].mean():.1f}")
        with sc3:
            total_span_days = int(
                (gantt_df[end_col].max() - gantt_df[start_col].min()).total_seconds() / (24 * 3600)
            )
            st.metric("总周期(天)", total_span_days)
        with sc4:
            st.metric("最长周期(天)", int(gantt_df["Duration"].max()))

        with st.expander("按任务分析周期"):
            dur_task = (
                gantt_df.groupby(task_col)["Duration"]
                .agg(["sum", "mean", "max"])
                .round(1)
                .rename(columns={"sum": "总周期", "mean": "平均周期", "max": "最长周期"})
            )
            st.dataframe(dur_task, use_container_width=True)

        if color_col:
            with st.expander(f"按 {color_col} 分析周期"):
                dur_cat = (
                    gantt_df.groupby(color_col)
                    .agg(
                        项目开始=(start_col, "min"),
                        项目结束=(end_col, "max"),
                        平均周期=("Duration", "mean"),
                        最长周期=("Duration", "max"),
                    )
                    .assign(
                        总周期=lambda x: (
                            (x["项目结束"] - x["项目开始"]).dt.total_seconds() / (24 * 3600)
                        ).astype(int)
                    )
                    [["总周期", "平均周期", "最长周期"]]
                    .round(1)
                )
                st.dataframe(dur_cat, use_container_width=True)

    except Exception as e:
        st.error(f"创建甘特图时出错: {e}")
        raise


if __name__ == "__main__":
    main()
