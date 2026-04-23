import pandas as pd

def load_file(file):
    if file.name.endswith("csv"):
        df = pd.read_csv(file)
    else:
        df = pd.read_excel(file)

    return df.dropna(how="all", axis=1).dropna(how="all", axis=0)