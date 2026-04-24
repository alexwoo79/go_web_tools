from core.data_loader import load_file
from core.chart_engine import render_chart
import altair as alt
def load_data(file, **kwargs):
    return load_file(file, **kwargs)

def get_columns(df):
    return df.columns.tolist()

def process_topn_sort(df, sort_mode, sort_order, topn_mode, topn_value, use_x, use_y):
    # 选择排序字段
    if sort_mode == "自动":
        sort_field = use_y
    elif sort_mode == "按X":
        sort_field = use_x
    elif sort_mode == "按Y":
        sort_field = use_y
    else:
        sort_field = None
    df_plot = df.copy()
    if topn_mode != "关闭" and sort_field:
        df_plot = df_plot.sort_values(
            by=sort_field,
            ascending=(sort_order == "升序")
        )
        if topn_mode == "TopN":
            df_plot = df_plot.head(topn_value)
        else:
            df_plot = df_plot.tail(topn_value)
    return df_plot, sort_field

def get_sort_rule(sort_mode, sort_field, sort_order):
    order_map = {"升序": "ascending", "降序": "descending"}
    if sort_mode == "无":
        return None
    elif sort_mode == "按X":
        return order_map[sort_order]
    else:
        return {"field": sort_field, "order": order_map[sort_order]}

def get_chart_cfg(use_x, use_y, color, sort_rule):
    return {
        "x": use_x,
        "y": use_y,
        "color": None if color == "无" else color,
        "sort": sort_rule
    }

def swap_xy(x, y, swap):
    if swap == "是":
        return y, x
    return x, y



def render_main_chart(chart_type, df_plot, cfg):
    return render_chart(chart_type, df_plot, cfg)
