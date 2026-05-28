"""CSE 110 study example: Shopping Cart."""


def show_menu():
    print("\nShopping Cart")
    print("1. Add item")
    print("2. View cart")
    print("3. Remove item")
    print("4. Compute total")
    print("5. Quit")


def view_cart(names, prices):
    if not names:
        print("Your cart is empty.")
        return
    for index, (name, price) in enumerate(zip(names, prices), start=1):
        print(f"{index}. {name} - ${price:.2f}")


def main():
    names = []
    prices = []

    while True:
        show_menu()
        choice = input("Choose an option: ").strip()

        if choice == "1":
            name = input("Item name: ").strip()
            price = float(input("Item price: $"))
            names.append(name)
            prices.append(price)
            print(f"Added {name}.")
        elif choice == "2":
            view_cart(names, prices)
        elif choice == "3":
            view_cart(names, prices)
            if names:
                remove_at = int(input("Number to remove: ")) - 1
                if 0 <= remove_at < len(names):
                    removed = names.pop(remove_at)
                    prices.pop(remove_at)
                    print(f"Removed {removed}.")
                else:
                    print("That item number is outside the cart.")
        elif choice == "4":
            # [1] `sum` is a tiny accountant. It does not care what you bought,
            #     which is why we keep names and prices paired by index.
            print(f"Total: ${sum(prices):.2f}")
        elif choice == "5":
            print("Goodbye.")
            break
        else:
            print("Please choose a number from 1 to 5.")


if __name__ == "__main__":
    main()
