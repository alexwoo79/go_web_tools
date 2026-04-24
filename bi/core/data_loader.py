import pandas as pd

def load_file(file, header=0, skiprows=0, skipfooter=0):
    """Load a CSV or Excel file with optional header/skiprows/skipfooter handling.

    header: int or list or None — row(s) to use as the header (relative to after skiprows).
            Default is 0 (treat first non-skipped row as header) to preserve upload behavior.
    skiprows: number of rows (or list) to skip at the start
    skipfooter: number of rows to skip at the end
    """
    # Ensure file pointer at start
    try:
        file.seek(0)
    except Exception:
        pass

    if file.name.endswith("csv"):
        # pandas.read_csv requires engine='python' for skipfooter
        if int(skipfooter or 0) > 0:
            df = pd.read_csv(file, header=header, skiprows=skiprows, skipfooter=skipfooter, engine="python")
        else:
            df = pd.read_csv(file, header=header, skiprows=skiprows)
    else:
        df = pd.read_excel(file, header=header, skiprows=skiprows, skipfooter=skipfooter)

    return df.dropna(how="all", axis=1).dropna(how="all", axis=0)


def load_for_cleaning(file, skip_head=0, skip_tail=0, header_row=-1):
    """Load a file specifically for cleaning workflows.

    This reads the file with `header=None` (so pandas does not parse a header row),
    applies skiprows/skipfooter, and if `header_row` >= 0 will take that row
    (relative to the sliced data) as the column names and remove the row from data.

    Returns a DataFrame ready for column selection and cleaning.
    """
    # normalize numeric inputs
    skip_head = int(skip_head or 0)
    skip_tail = int(skip_tail or 0)
    hr = int(header_row) if header_row is not None else -1

    # Try to load using load_file with header=None
    try:
        df = load_file(file, header=None, skiprows=skip_head, skipfooter=skip_tail)
    except Exception:
        # fallback to reading via default load_file and slicing
        try:
            # ensure file pointer at start
            try:
                file.seek(0)
            except Exception:
                pass
            df = pd.read_csv(file) if file.name.endswith("csv") else pd.read_excel(file)
            start = skip_head
            end = None if skip_tail == 0 else -skip_tail
            df = df.iloc[start:end].copy()
        except Exception:
            # give up and return empty DataFrame
            return pd.DataFrame()

    # if header_row specified, set that row as header
    if hr >= 0 and hr < len(df):
        try:
            new_cols = df.iloc[hr].astype(str).tolist()
            df = df.drop(df.index[hr]).reset_index(drop=True)
            df.columns = new_cols
        except Exception:
            # if header assignment fails, keep original
            pass

    return df