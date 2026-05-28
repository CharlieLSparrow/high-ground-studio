"""CSE 110 study example: Meal Price Calculator."""


def money(prompt):
    return float(input(prompt))


def whole_number(prompt):
    return int(input(prompt))


def main():
    print("Meal Price Calculator\n")

    child_meal = money("Price of a child's meal: $")
    adult_meal = money("Price of an adult's meal: $")
    children = whole_number("Number of children: ")
    adults = whole_number("Number of adults: ")
    drink_total = money("Total for drinks or extras: $")
    tax_rate = money("Sales tax rate percent: ")
    tip_rate = money("Optional tip percent: ")

    # [1] Keep the subtotal pure: food and extras only. Tax and tip enter later,
    #     like guests who were told the party started fifteen minutes earlier.
    subtotal = child_meal * children + adult_meal * adults + drink_total
    tax = subtotal * tax_rate / 100
    tip = subtotal * tip_rate / 100
    total = subtotal + tax + tip

    print("\nReceipt")
    print(f"Subtotal: ${subtotal:.2f}")
    print(f"Sales Tax: ${tax:.2f}")
    print(f"Tip:       ${tip:.2f}")
    print(f"Total:     ${total:.2f}")

    payment = money("\nPayment amount: $")
    change = payment - total

    if change >= 0:
        print(f"Change:    ${change:.2f}")
    else:
        print(f"Still due: ${abs(change):.2f}")


if __name__ == "__main__":
    main()
