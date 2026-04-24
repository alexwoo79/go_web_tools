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

def drop_duplicates(df):
    """去重"""
    return df.drop_duplicates()

def convert_column_type(df, col, dtype):
    """类型转换"""
    df2 = df.copy()
    df2[col] = df2[col].astype(dtype)
    return df2

def add_calc_column(df, expr, new_col):
    """自定义计算列"""
    df2 = df.copy()
    df2[new_col] = df.eval(expr)
    return df2

def export_csv(df):
    """导出CSV"""
    return df.to_csv(index=False).encode('utf-8')
