"""CSE 110 study example: Data Analysis."""

import csv
from pathlib import Path


DATA_FILE = Path(__file__).with_name("life_expectancy_sample.csv")


def load_rows():
    with DATA_FILE.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        rows = []
        for row in reader:
            rows.append(
                {
                    "country": row["Entity"],
                    "code": row["Code"],
                    "year": int(row["Year"]),
                    "life": float(row["Life expectancy"]),
                }
            )
        return rows


def print_record(label, row):
    print(f"{label}: {row['country']} in {row['year']} - {row['life']:.1f}")


def main():
    rows = load_rows()

    lowest = min(rows, key=lambda row: row["life"])
    highest = max(rows, key=lambda row: row["life"])

    print_record("Lowest overall", lowest)
    print_record("Highest overall", highest)

    year = int(input("\nEnter a year of interest: "))
    year_rows = [row for row in rows if row["year"] == year]

    if not year_rows:
        print("No data for that year.")
        return

    average = sum(row["life"] for row in year_rows) / len(year_rows)
    year_lowest = min(year_rows, key=lambda row: row["life"])
    year_highest = max(year_rows, key=lambda row: row["life"])

    # [1] Filtering first keeps the year-specific math honest. Otherwise a
    #     sneaky 2000 row may wander into 2020 wearing borrowed statistics.
    print(f"\nFor {year}:")
    print(f"Average life expectancy: {average:.2f}")
    print_record("Lowest", year_lowest)
    print_record("Highest", year_highest)


if __name__ == "__main__":
    main()
