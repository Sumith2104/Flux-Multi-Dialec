
import csv
import os

# This script demonstrates how to generate a clean, robust CSV file
# that is compatible with the application's importer.

# --- Configuration ---
# Replace with the actual column names from your table schema
COLUMN_NAMES = ['id', 'product_name', 'quantity', 'price']
OUTPUT_FILENAME = 'safe_import_data.csv'
NUMBER_OF_ROWS = 10000

def generate_safe_csv(filename, headers, num_rows):
    """
    Generates a CSV file with robust formatting for safe import.

    Args:
        filename (str): The name of the output CSV file.
        headers (list): A list of strings for the column headers.
        num_rows (int): The number of data rows to generate.
    """
    print(f"Generating '{filename}' with {num_rows} rows...")

    # Open the file with newline='' to prevent blank rows between writes.
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        # Use csv.QUOTE_ALL to wrap every field in quotes.
        # This is the most robust way to handle fields that might contain
        # the delimiter (,), quotes ("), or line breaks.
        writer = csv.writer(csvfile, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)

        # 1. Write the header row
        writer.writerow(headers)

        # 2. Write data rows
        for i in range(1, num_rows + 1):
            # Example data.
            # Notice the product_name includes a comma, which is handled
            # safely because of QUOTE_ALL.
            row_data = [
                f'uuid-{i}',
                f'Product {i}, with a comma',
                i * 2,
                f'{i * 1.5:.2f}'
            ]

            # Ensure data matches the number of headers
            if len(row_data) != len(headers):
                print(f"Error: Row {i} has {len(row_data)} items but there are {len(headers)} headers.")
                continue

            writer.writerow(row_data)

    print(f"Successfully generated '{filename}' with a size of {os.path.getsize(filename) / 1024:.2f} KB.")
    print("This file is now ready for import.")


if __name__ == '__main__':
    generate_safe_csv(OUTPUT_FILENAME, COLUMN_NAMES, NUMBER_OF_ROWS)

# --- How to Run This Script ---
# 1. Make sure you have Python installed.
# 2. Save this code as a Python file (e.g., generate_data.py).
# 3. Open a terminal or command prompt.
# 4. Navigate to the directory where you saved the file.
# 5. Run the script with the command: python generate_data.py
# 6. The output file 'safe_import_data.csv' will be created in the same directory.
