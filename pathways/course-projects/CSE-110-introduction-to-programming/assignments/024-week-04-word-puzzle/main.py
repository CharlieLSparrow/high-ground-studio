"""CSE 110 study example: Word Puzzle."""


SECRET_WORD = "lantern"


def build_hint(secret, guess):
    hint = []
    for index, letter in enumerate(guess):
        if letter == secret[index]:
            hint.append(letter.upper())
        elif letter in secret:
            hint.append(letter.lower())
        else:
            hint.append("_")
    return " ".join(hint)


def main():
    print("Word Puzzle")
    print("_ " * len(SECRET_WORD))
    guesses = 0

    while True:
        guess = input("What is your guess? ").strip().lower()
        guesses += 1

        if len(guess) != len(SECRET_WORD):
            print(f"Your guess must have {len(SECRET_WORD)} letters.")
            continue

        if guess == SECRET_WORD:
            break

        # [1] Uppercase means exact location, lowercase means right letter in the
        #     wrong seat, underscore means the letter was not invited.
        print("Hint:", build_hint(SECRET_WORD, guess))

    print("Correct!")
    print(f"You guessed it in {guesses} tries.")


if __name__ == "__main__":
    main()
