import os
import pandas as pd
file_path = r"c:\clms\castingline_backend\crawler\example.xlsx"


try:
    df = pd.read_excel(file_path, engine='openpyxl')
    print("Columns:", df.columns.tolist())
    print("\nFirst row:")
    print(df.iloc[0].to_dict() if not df.empty else "Empty")
except Exception as e:
    print(f"Error reading excel: {e}")


