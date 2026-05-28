"""CSE 110 study example: Adventure Game."""


def choose(prompt, options):
    options_text = "/".join(options)
    while True:
        answer = input(f"{prompt} ({options_text}): ").strip().lower()
        if answer in options:
            return answer
        print("That choice is not on the map. Try one of the listed words.")


def main():
    print("The Library Beneath the Hill\n")
    print("You find a brass door under a mossy hill. It hums when you touch it.")

    first = choose("Do you OPEN the door, KNOCK, or LEAVE", ["open", "knock", "leave"])

    if first == "leave":
        print("\nYou go home and make soup. The soup is excellent. The mystery is not solved.")
        return

    if first == "knock":
        print("\nA slot opens. A voice asks for the password.")
        password = choose("Do you say BOOK, PLEASE, or SANDWICH", ["book", "please", "sandwich"])
        if password == "please":
            print("\nThe door opens. Manners remain the oldest form of security.")
        else:
            print("\nThe slot closes. Somewhere inside, a librarian sighs with professional force.")
            return
    else:
        print("\nThe door opens because apparently it was waiting for dramatic confidence.")

    # [1] Nested choices make a tree. The trick is pruning each branch before it
    #     grows into a hedge maze with opinions.
    path = choose("Inside, do you follow the LANTERN, STAIRS, or MUSIC", ["lantern", "stairs", "music"])

    if path == "lantern":
        print("\nThe lantern leads you to a reading room where every book has your name in it.")
        read = choose("Do you READ one or RUN", ["read", "run"])
        if read == "read":
            print("\nYou learn tomorrow's weather and bring an umbrella. Victory, but practical.")
        else:
            print("\nYou escape safely, although the books will now gossip about you.")
    elif path == "stairs":
        print("\nThe stairs spiral down to a quiet vault.")
        take = choose("Do you TAKE the silver bookmark or WAIT", ["take", "wait"])
        if take == "wait":
            print("\nThe vault thanks you for your patience and gives you the bookmark anyway.")
        else:
            print("\nThe bookmark sticks to your hand until you promise to return overdue books.")
    else:
        print("\nThe music leads to a tiny orchestra of self-playing instruments.")
        dance = choose("Do you DANCE or LISTEN", ["dance", "listen"])
        if dance == "dance":
            print("\nThe instruments applaud. You win a lifetime supply of dramatic entrances.")
        else:
            print("\nThe final chord becomes a key. It opens the way home.")


if __name__ == "__main__":
    main()
