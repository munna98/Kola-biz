import glob
import re

def main():
    files = glob.glob('src-tauri/src/commands/*.rs')
    for f in files:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # 1. Strip dynamic aggregations
        content = content.replace(
            "v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,", 
            "v.grand_total,"
        )
        content = content.replace(
            "v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as grand_total,", 
            "v.grand_total,"
        )

        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)

    print("Replaced dynamic aggregations in SELECT queries.")

    # Now let's manually patch the INSERT/UPDATE logic in the 4 files
    # 1. invoices.rs: I can just modify scratch/refactor.py and re-run it
    pass

if __name__ == '__main__':
    main()
