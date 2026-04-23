import pandas as pd

def run_pivot(df, rows, cols, values, agg):

    if not rows and not cols:
        return df

    if values:
        pivot = pd.pivot_table(
            df,
            index=rows if rows else None,
            columns=cols if cols else None,
            values=values,
            aggfunc=agg,
            fill_value=0
        )
    else:
        pivot = pd.pivot_table(
            df,
            index=rows if rows else None,
            columns=cols if cols else None,
            aggfunc="size",
            fill_value=0
        )

    return pivot.reset_index()