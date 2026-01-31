def vigenere_encrypt(plaintext, key):
    ciphertext = ""
    key = key.upper()
    key_index = 0
    plaintext = plaintext.upper().replace(" ", "")

    for char in plaintext:
        if char.isalpha():
            shift = ord(key[key_index % len(key)]) - ord('A')
            encrypted_char = chr((ord(char) - ord('A') + shift) % 26 + ord('A'))
            ciphertext += encrypted_char
            key_index += 1
        else:
            ciphertext += char

    return ciphertext


def vigenere_decrypt(ciphertext, key):
    plaintext = ""
    key = key.upper()
    key_index = 0
    ciphertext = ciphertext.upper().replace(" ", "")

    for char in ciphertext:
        if char.isalpha():
            shift = ord(key[key_index % len(key)]) - ord('A')
            decrypted_char = chr((ord(char) - ord('A') - shift) % 26 + ord('A'))
            plaintext += decrypted_char
            key_index += 1
        else:
            plaintext += char

    return plaintext


def main():
    choice = input("Do you want to encrypt or decrypt? (e/d): ").lower()

    if choice not in ('e', 'd'):
        print("Invalid choice. Use 'e' for encrypt or 'd' for decrypt.")
        return

    key = input("Enter the key: ").strip()
    if not key.isalpha():
        print("Key must only contain letters.")
        return

    if choice == 'e':
        plaintext = input("Enter the plaintext: ")
        ciphertext = vigenere_encrypt(plaintext, key)
        print("Encrypted text:", ciphertext)
    else:
        ciphertext = input("Enter the ciphertext: ")
        plaintext = vigenere_decrypt(ciphertext, key)
        print("Decrypted text:", plaintext)


if __name__ == "__main__":
    main()
