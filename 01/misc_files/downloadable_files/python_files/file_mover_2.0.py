import os
import shutil
from tkinter import filedialog, Tk

# Function to move a file from source to destination
def move_file(source, destination):
    try:
        shutil.move(source, destination)
        print("File moved successfully.")
    except FileNotFoundError:
        print("The chosen file does not exist.")
    except Exception as e:
        print("Error:", e)

# Function to choose a source file using file explorer
def choose_source_file():
    root = Tk()
    root.withdraw()  # Hide the main tkinter window
    source_file = filedialog.askopenfilename()
    return source_file

# Function to choose a destination folder using file explorer
def choose_destination_folder():
    root = Tk()
    root.withdraw()  # Hide the main tkinter window
    destination_folder = filedialog.askdirectory(initialdir="D:\\")
    return destination_folder

# Get source file path using file explorer
source_file = choose_source_file()

# Get destination folder path using file explorer, pre-setting initial directory to D drive
destination_folder = choose_destination_folder()

# Check if source file is chosen and destination folder is valid
if source_file and destination_folder:
  # Moving the chosen file to the destination folder
  usb_file_path = os.path.join(source_file)
  move_file(usb_file_path, destination_folder)
else:
  print("No file or folder chosen.")
