import pandas as pd

def run_pivot(df, rows, cols, values, agg):
    if not values:
        pivot = pd.pivot_table(
            df,
            index=rows,
            columns=cols,
            aggfunc="size",
            fill_value=0
        )
    else:
        pivot = pd.pivot_table(
            df,
            index=rows,
            columns=cols,
            values=values,
            aggfunc=agg,
            fill_value=0
        )

    return pivot.reset_index()