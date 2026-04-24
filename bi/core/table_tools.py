import pandas as pd

def table_join(df1, df2, left_on, right_on, how):
    """多表合并（Join）"""
    return pd.merge(df1, df2, left_on=left_on, right_on=right_on, how=how)

def groupby_agg(df, group_cols, agg_col, agg_func):
    """分组聚合"""
    return df.groupby(group_cols)[agg_col].agg(agg_func).reset_index()

def multi_pivot(df, rows, columns, values, aggs):
    """多指标/多聚合透视表"""
    return pd.pivot_table(df, index=rows, columns=columns, values=values, aggfunc=aggs)

def fillna_column(df, col, val):
    """缺失值填充"""
    df2 = df.copy()
    df2[col] = df2[col].fillna(val)
    return df2

def drop_duplicates(df, cols=None):
    """去重"""
    if cols:
        # normalize cols to a list
        if not isinstance(cols, (list, tuple)):
            cols_list = [cols]
        else:
            cols_list = list(cols)

        # find matching columns in the DataFrame
        present = []
        for c in cols_list:
            if c in df.columns:
                present.append(c)
                continue
            # try matching after stripping whitespace and case-insensitive
            c_str = str(c).strip()
            for dc in df.columns:
                if str(dc).strip() == c_str or str(dc).strip().lower() == c_str.lower():
                    present.append(dc)
                    break

        # dedupe preserve order
        present = list(dict.fromkeys(present))

        # if none of the requested cols exist, return the original DF unchanged
        if not present:
            return df.copy()

        return df.drop_duplicates(subset=present)

    return df.drop_duplicates()

def convert_column_type(df, col, dtype):
    """类型转换"""
    df2 = df.copy()
    # support common dtype strings including datetime/date
    dt_lower = str(dtype).lower()
    if dt_lower in ("datetime", "date", "datetime64", "datetime64[ns]"):
        # coerce errors to NaT for unparsable values
        ser = pd.to_datetime(df2[col], errors="coerce", infer_datetime_format=True)
        if dt_lower == "date":
            # convert to python date objects (may be useful for display)
            df2[col] = ser.dt.date
        else:
            df2[col] = ser
    else:
        df2[col] = df2[col].astype(dtype)
    return df2

def add_calc_column(df, expr, new_col):
    """自定义计算列"""
    df2 = df.copy()
    df2[new_col] = df.eval(expr)
    return df2

def table_concat(dfs, axis=0, ignore_index=True):
    """表格拼接（Concat）

    dfs: list/tuple of pandas.DataFrame
    axis: 0 按行拼接（默认），1 按列拼接
    ignore_index: 是否重建索引
    """
    if not isinstance(dfs, (list, tuple)):
        raise ValueError("dfs must be a list or tuple of DataFrame objects")
    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, axis=axis, ignore_index=ignore_index)

def export_csv(df, include_index=False):
    """导出CSV为 bytes

    include_index: 是否包含索引列（默认 False）
    """
    return df.to_csv(index=include_index).encode('utf-8')


def export_excel(df, include_index=False):
    """导出为 Excel (.xlsx) 的 bytes

    使用 pandas.to_excel 写入 BytesIO 并返回二进制数据。
    注意：需要安装 openpyxl 来写入 xlsx。
    """
    from io import BytesIO

    output = BytesIO()
    # pandas will choose an engine; openpyxl is commonly available
    df.to_excel(output, index=include_index, engine="openpyxl")
    output.seek(0)
    return output.read()
