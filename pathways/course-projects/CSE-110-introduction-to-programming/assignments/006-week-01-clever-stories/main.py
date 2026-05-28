"""CSE 110 study example: Clever Stories."""


def ask(prompt):
    """Ask for a word and trim the extra space people naturally bring with them."""
    return input(prompt).strip()


def main():
    print("Clever Stories")
    print("Give me a few words, and I will assemble a tiny expedition.\n")

    adjective = ask("Adjective: ")
    animal = ask("Animal: ")
    verb = ask("Verb: ")
    exclamation = ask("Exclamation: ").capitalize()
    place = ask("Place: ")
    object_name = ask("Object: ")
    number = ask("Number: ")

    # [1] The f-string is the story loom: it keeps the sentence readable while
    #     slipping variables into their assigned seats.
    story = f"""
The other day, I was walking through {place} when I saw a {adjective} {animal}.
"{exclamation}!" I shouted, because some moments arrive already wearing a hat.
The {animal} decided to {verb} toward a {object_name}, which was brave for the
{object_name} and educational for everyone else.

After {number} minutes, we agreed to call it a scientific achievement and went
home with a story that sounded less believable every time I explained it.
"""

    print("\nYour story:")
    print(story)


if __name__ == "__main__":
    main()
