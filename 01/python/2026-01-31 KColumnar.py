def keyed_columnar_encrypt(plaintext, key):
    plaintext = plaintext.upper().replace(" ", "")
    key = key.upper()
    n_cols = len(key)
    n_rows = -(-len(plaintext) // n_cols)  # Ceiling division
    padded_length = n_rows * n_cols
    plaintext += 'X' * (padded_length - len(plaintext))

    # Fill the matrix row-wise
    matrix = [list(plaintext[i:i+n_cols]) for i in range(0, len(plaintext), n_cols)]

    # Sort key and get the order of columns
    key_order = sorted([(char, i) for i, char in enumerate(key)])
    column_order = [index for char, index in key_order]

    # Read the columns in key order
    ciphertext = ""
    for col in column_order:
        for row in matrix:
            ciphertext += row[col]

    return ciphertext


def keyed_columnar_decrypt(ciphertext, key):
    ciphertext = ciphertext.upper().replace(" ", "")
    key = key.upper()
    n_cols = len(key)
    n_rows = len(ciphertext) // n_cols

    # Sort key and get the order of columns
    key_order = sorted([(char, i) for i, char in enumerate(key)])
    column_order = [index for char, index in key_order]

    # Create an empty matrix
    matrix = [[''] * n_cols for _ in range(n_rows)]

    # Fill the matrix column-wise in the order of the key
    idx = 0
    for col in column_order:
        for row in range(n_rows):
            matrix[row][col] = ciphertext[idx]
            idx += 1

    # Read row-wise
    plaintext = "".join("".join(row) for row in matrix)
    return plaintext


def main():
    while True:
        mode = input("Do you want to encrypt or decrypt? (e/d), or 'q' to quit: ").lower()

        if mode == 'q':
            print("Exiting the program.")
            break

        if mode not in ('e', 'd'):
            print("Invalid mode. Use 'e' for encrypt, 'd' for decrypt, or 'q' to quit.")
            continue

        key = input("Enter the key: ").strip()
        if not key.isalpha():
            print("Key must only contain letters.")
            continue

        text = input("Enter the text: ")

        if mode == 'e':
            result = keyed_columnar_encrypt(text, key)
        else:
            result = keyed_columnar_decrypt(text, key)

        print("Result:", result)


if __name__ == "__main__":
    main()