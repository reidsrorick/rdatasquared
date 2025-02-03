import string

letters1 = list(string.ascii_uppercase) #creates an array of uppercase letters
reference_array = list(range(0,26)) #creates an array beginning with 0 and ending at 25 (26 numbers total - like amound of letters in the alphabet)
dashedLine = ("\n----------------------------------------------\n") #just to help organize the output code if I am printing a lot

key_alpha = "" # just used sometimes so that I do not have to enter a key_alpha --> I will sometimes comment out the input() variable
#key_alpha = input("Please enter your key_alpha: ")
key_alpha_array = []
vigenere = []

# This populates the "key_alpha_array" with each letter of the input word (all uppercase)
for i in key_alpha:
    key_alpha_array.append(i.upper())

# This "moves" all of the input key_alpha at the front, and then any leftover letters are appended to the end
# For example, if the key_alpha happens to be "kryptos" you should see the array look like this: 
# ['K', 'R', 'Y', 'P', 'T', 'O', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Q', 'U', 'V', 'W', 'X', 'Z']
for i in reference_array:
    if letters1[i] not in key_alpha_array:
        key_alpha_array.append(letters1[i])

# This should create a Vigenère cipher
# Takes the key array, moves the first letter to the end and shifts all other letters up one position
# One instance of this should provide you with this array (with key_alpha "Kryptos"): 
# ['K', 'R', 'Y', 'P', 'T', 'O', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Q', 'U', 'V', 'W', 'X', 'Z']
# ['R', 'Y', 'P', 'T', 'O', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Q', 'U', 'V', 'W', 'X', 'Z', 'K']
vigenere.append(key_alpha_array.copy())
for z in range(0,25):
    first_letter = key_alpha_array[0]
    for i in range(0,25):
            key_alpha_array[i]=key_alpha_array[i+1]
    key_alpha_array[-1]=first_letter
    vigenere.append(key_alpha_array.copy())

first_dict = {}
for i, letter in enumerate(letters1):
     first_dict[i] = letter

plain_text = input("Please enter the text you want to be encrypted: ") # this is the text you would like to be encrypted
# plain_text = "Hello World, don't mind if I do." # this is the text you would like to be encrypted
arr_plain_text = []
for i in plain_text: # this for loop will take out any non-letters (including spaces) and add the plain text as all uppercase
     if i.upper() in letters1:
          arr_plain_text.append(i.upper())

# this is used to create the new keystream
# For example, if the keystream is "HIDDEN" and the Plaintext is "Hello World, don't mind if I do." you should have it output to:
# Plaintext =  ['H', 'E', 'L', 'L', 'O', 'W', 'O', 'R', 'L', 'D', 'D', 'O', 'N', 'T', 'M', 'I', 'N', 'D', 'I', 'F', 'I', 'D', 'O'] Length: 23
# Keystream =  ['H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E'] Length: 23
# It repeats the keystream through until it equals the same length as the plaintext
#keystream = "HIDDEN" # this is the key to iterate over the X axis of the vignere 
keystream = input("Enter the Keystream for the Vigenere: ") # this is the key to iterate over the X axis of the vignere
arr_keystream = []
for i in keystream:
     arr_keystream.append(i.upper())
full_keystream = []
keystream_count = 0
for i in range(0,len(arr_plain_text)):
     if keystream_count < len(arr_keystream):
          full_keystream.append(arr_keystream[keystream_count])
          keystream_count += 1
     else:
          keystream_count=0
          full_keystream.append(arr_keystream[keystream_count])
          keystream_count += 1

cipher_text =[]
y_index = []
x_index = []
for i in arr_plain_text:
     y_index.append(letters1.index(i))
for i in full_keystream:
     x_index.append(letters1.index(i))

for i in range(0,len(y_index)):
     ydex = y_index[i]
     xdex = x_index[i]
     new_letter = vigenere[ydex][xdex]
     cipher_text.append(new_letter)


# print("Y-Index:",y_index)     
# print("X-Index:",x_index)     
# print(dashedLine)
# print("Plaintext = ",arr_plain_text,"Length:",len(arr_plain_text))
# print("Keystream = ",full_keystream,"Length:",len(full_keystream))
# print(dashedLine)
# print(cipher_text,"Len:",len(cipher_text))
print(cipher_text)
input()