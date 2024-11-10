import string
import pyperclip

letters1 = list(string.ascii_uppercase) #creates an array of uppercase letters
reference_array = list(range(0,26)) #creates an array beginning with 0 and ending at 25 (26 numbers total - like amound of letters in the alphabet)
dashedLine = ("\n----------------------------------------------\n") #just to help organize the output code if I am printing a lot

first_dict = {}
for i, letter in enumerate(letters1):
     first_dict[i] = letter


def alpha_array_creation():
     key_alpha = "" # just used sometimes so that I do not have to enter a key_alpha --> I will sometimes comment out the input() variable
     #key_alpha = input("Please enter your key_alpha: ")
     key_alpha_array = []

     # This populates the "key_alpha_array" with each letter of the input word (all uppercase)
     for i in key_alpha:
          key_alpha_array.append(i.upper())

     # This "moves" all of the input key_alpha at the front, and then any leftover letters are appended to the end
     # For example, if the key_alpha happens to be "kryptos" you should see the array look like this: 
     # ['K', 'R', 'Y', 'P', 'T', 'O', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Q', 'U', 'V', 'W', 'X', 'Z']
     for i in reference_array:
          if letters1[i] not in key_alpha_array:
           key_alpha_array.append(letters1[i])

     return key_alpha_array

def vigenere_table_creation(key_alpha_array):
     vigenere = []
# This should create a Vigenère table
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
     return vigenere

def text_input(input1):
     # this is the text you would like to be encrypted
     # plain_text = "Hello World, don't mind if I do." # this is the text you would like to be encrypted
     arr_plain_text = []
     for i in input1: # this for loop will take out any non-letters (including spaces) and add the plain text as all uppercase
          if i.upper() in letters1:
               arr_plain_text.append(i.upper())
     return arr_plain_text

def create_keystream(arr_plain_text, keystream):
     #keystream = input("Enter the Keystream for the Vigenere: ") # this is the key to iterate over the X axis of the vignere
     arr_keystream = [] # this is the same as the above input, just each letter is separated into an array
     full_keystream = [] # this is the output that we are going to want (the keystream repeated until it reaches the same length as the plaintext)
     keystream_count = 0

     for i in keystream:
          arr_keystream.append(i.upper())
     for i in range(0,len(arr_plain_text)):
          if keystream_count < len(arr_keystream):
               full_keystream.append(arr_keystream[keystream_count])
               keystream_count += 1
          else:
               keystream_count=0
               full_keystream.append(arr_keystream[keystream_count])
               keystream_count += 1
     return full_keystream
          # this is used to create the new keystream
          # For example, if the keystream is "HIDDEN" and the Plaintext is "Hello World, don't mind if I do." you should have it output to:
          # Plaintext =  ['H', 'E', 'L', 'L', 'O', 'W', 'O', 'R', 'L', 'D', 'D', 'O', 'N', 'T', 'M', 'I', 'N', 'D', 'I', 'F', 'I', 'D', 'O'] Length: 23
          # Keystream =  ['H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E', 'N', 'H', 'I', 'D', 'D', 'E'] Length: 23
          # It repeats the keystream through until it equals the same length as the plaintext
          #keystream = "HIDDEN" # this is the key to iterate over the X axis of the vignere 

def create_cipher_text(arr_plain_text, full_keystream, vigenere):
     cipher_text =[]
     y_index = []
     x_index = []
     actual_cipher_text = ""

     for i in arr_plain_text:
          y_index.append(letters1.index(i))
     for i in full_keystream:
          x_index.append(letters1.index(i))

     for i in range(0,len(y_index)):
          ydex = y_index[i]
          xdex = x_index[i]
          new_letter = vigenere[ydex][xdex]
          cipher_text.append(new_letter)

     for i in cipher_text:
          actual_cipher_text += i
     print("Cipher Text:",actual_cipher_text)
     return actual_cipher_text

def find_plain_text(arr_cipher_text, full_keystream, vigenere):
     array_with_cipher_text = arr_cipher_text
     array_with_full_keystream = full_keystream
     vigenere_table = vigenere

     y_index = [] #this now needs to be values from the full keystream
     x_index = [] #this is actually going to be our answer now. We know the cipher text and the keystream, now to find the original text
     array_plain_text_answer = []
     plain_text_answer = ""

     cipher_text_array_count = 0

     for i in array_with_full_keystream:
          y_index.append(letters1.index(i))
     
     for i in y_index:
          correct_row = vigenere_table[i]
          x_index.append(correct_row.index(arr_cipher_text[cipher_text_array_count]))
          cipher_text_array_count += 1

     for i in x_index:
          array_plain_text_answer.append(letters1[i])
          plain_text_answer += (letters1[i])
     print(plain_text_answer)
     return plain_text_answer
          




def encrypt():
     input1 = input("Please enter the text you want to be encrypted: ")
     cipher_key = input("Please enter the cipher key you would like to use for encryption: ")
     key_alpha_array = alpha_array_creation()
     vigenere = vigenere_table_creation(key_alpha_array)
     arr_plain_text = text_input(input1)
     full_keystream = create_keystream(arr_plain_text, cipher_key)
     actual_cipher_text = create_cipher_text(arr_plain_text, full_keystream, vigenere)
     pyperclip.copy(actual_cipher_text)

def decrypt():
     
     input1 = input("Please enter your ciphertext to be decrypted: ")
     cipher_key = input("Please enter your cipher key: ")

     key_alpha_array = alpha_array_creation()
     vigenere = vigenere_table_creation(key_alpha_array)
     arr_cipher_text = text_input(input1)
     full_keystream = create_keystream(arr_cipher_text, cipher_key)
     plainy = find_plain_text(arr_cipher_text, full_keystream, vigenere)
     pyperclip.copy(plainy)

def encrypt_decrypt():
     repeat = True
     while repeat:
          choice = input("Would you like to encrypt (A) or decrypt (B) a message?")
          if choice.upper() == "A":
               encrypt()
               repeat = False
               break
          if choice.upper() == "B":
               decrypt()
               repeat = False
               break
          else:
               print("Incorrect input. Please enter only A or B")
               print(dashedLine)
               #print("\n")

continue_quest = True

while continue_quest: # this loop should allow you to run the program however many times you want to in a row.
     valid_input = False
     encrypt_decrypt()

     while valid_input == False:
          cont_yes_no = input("Would you like to run the program again? A = Yes, B = No")
          
          if cont_yes_no.upper() == "B":
               valid_input = True
               continue_quest = False
               print("You have chosen to exit this program.")
               print("Press \"Enter\" to close this screen.")
               exit()  
               break

          elif cont_yes_no.upper() == "A":
               valid_input = True
               print("You have chosen to repeat this program.")
                

          else:
               valid_input = False
               print("You have entered an invalid input, please only enter 'A' or 'B'")
               print(dashedLine)
     print(dashedLine)





#encrypt_decrypt()

#encrypt()
input()