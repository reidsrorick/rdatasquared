import subprocess

# Define the command you want to execute
command = 'start chrome "https://reidsrorick.github.io/hub/snote" "http://www.google.com"'

# Execute the command in the command prompt
result = subprocess.run(command, shell=True, capture_output=True, text=True)

# Print the output of the command
print(result.stdout)

# Print the return code of the command
print("Return code:", result.returncode)
